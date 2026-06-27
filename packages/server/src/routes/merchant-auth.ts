import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query, queryOne, execute } from '../config/database';

const router = Router();

// ============================================================
// Merchant Admin 认证相关类型
// ============================================================
export interface MerchantAuthPayload {
  merchantAdminId: string;
  merchantId: string;
  merchantName: string;
  role: 'merchant_admin';
}

declare global {
  namespace Express {
    interface Request {
      merchantAdmin?: MerchantAuthPayload;
    }
  }
}

/**
 * SHA-256 简单密码哈希（与现有 auth.ts 风格一致，不使用 bcrypt）
 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 商家认证中间件
 * 验证 JWT 且 role 必须为 merchant_admin
 */
export function merchantAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      code: 401,
      message: '未登录，请先授权',
      data: null,
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as MerchantAuthPayload;
    if (payload.role !== 'merchant_admin') {
      res.status(403).json({
        code: 403,
        message: '非商家账号无法操作',
        data: null,
      });
      return;
    }
    req.merchantAdmin = payload;
    next();
  } catch (error: any) {
    const message =
      error.name === 'TokenExpiredError'
        ? '登录已过期，请重新登录'
        : '无效的登录凭证';
    res.status(401).json({
      code: 401,
      message,
      data: null,
    });
  }
}

// ============================================================
// API Routes
// ============================================================

/**
 * POST /api/v1/merchant/auth/register
 * 商家子账号注册（需要邀请码，绑定到指定 merchant_id）
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, inviteCode, phone, realName } = req.body;

    if (!username || !password || !inviteCode) {
      res.json({ code: 400, message: '用户名、密码和邀请码不能为空', data: null });
      return;
    }

    if (password.length < 6) {
      res.json({ code: 400, message: '密码长度不能少于6位', data: null });
      return;
    }

    // 校验邀请码
    const invite = await queryOne<any>(
      `SELECT * FROM merchant_invite_codes WHERE code = $1 AND used = 0`,
      [inviteCode]
    );

    if (!invite) {
      res.json({ code: 400, message: '邀请码无效或已使用', data: null });
      return;
    }

    // 检查用户名是否已存在
    const existing = await queryOne<any>(
      `SELECT id FROM merchant_admin WHERE username = $1`,
      [username]
    );

    if (existing) {
      res.json({ code: 400, message: '用户名已存在', data: null });
      return;
    }

    // 创建商家子账号
    const id = uuidv4();
    const passwordHash = hashPassword(password);
    await execute(
      `INSERT INTO merchant_admin (id, merchant_id, username, password_hash, phone, real_name, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())`,
      [id, invite.merchant_id, username, passwordHash, phone || '', realName || '']
    );

    // 标记邀请码已使用
    await execute(
      `UPDATE merchant_invite_codes SET used = 1, used_by = $1, used_at = NOW() WHERE id = $2`,
      [id, invite.id]
    );

    res.json({
      code: 0,
      message: '注册成功',
      data: { id },
    });
  } catch (e: any) {
    console.error('[MerchantAuth] register error:', e?.message || e);
    res.json({ code: 500, message: '注册失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/auth/login
 * 商家登录（用户名 + 密码，返回 JWT）
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.json({ code: 400, message: '用户名和密码不能为空', data: null });
      return;
    }

    const admin = await queryOne<any>(
      `SELECT ma.*, m.merchant_name
       FROM merchant_admin ma
       LEFT JOIN merchants m ON ma.merchant_id = m.id
       WHERE ma.username = $1`,
      [username]
    );

    if (!admin) {
      res.json({ code: 401, message: '用户名或密码错误', data: null });
      return;
    }

    if (admin.status !== 1) {
      res.json({ code: 403, message: '账号已被禁用', data: null });
      return;
    }

    // 验证密码
    const inputHash = hashPassword(password);
    if (inputHash !== admin.password_hash) {
      res.json({ code: 401, message: '用户名或密码错误', data: null });
      return;
    }

    // 更新最后登录时间
    await execute(
      `UPDATE merchant_admin SET last_login_time = NOW(), updated_at = NOW() WHERE id = $1`,
      [admin.id]
    );

    // 生成 JWT
    const payload: MerchantAuthPayload = {
      merchantAdminId: admin.id,
      merchantId: admin.merchant_id,
      merchantName: admin.merchant_name || '',
      role: 'merchant_admin',
    };
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        firstLogin: admin.first_login === 1,
        admin: {
          id: admin.id,
          username: admin.username,
          phone: admin.phone || '',
          realName: admin.real_name || '',
          merchantId: admin.merchant_id,
          merchantName: admin.merchant_name || '',
        },
      },
    });
  } catch (e: any) {
    console.error('[MerchantAuth] login error:', e?.message || e);
    res.json({ code: 500, message: '登录失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/auth/change-password
 * 修改密码
 */
router.post('/change-password', merchantAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const adminId = req.merchantAdmin!.merchantAdminId;

    if (!oldPassword || !newPassword) {
      res.json({ code: 400, message: '旧密码和新密码不能为空', data: null });
      return;
    }

    if (newPassword.length < 6) {
      res.json({ code: 400, message: '新密码长度不能少于6位', data: null });
      return;
    }

    // 查询当前密码
    const admin = await queryOne<any>(
      `SELECT password_hash FROM merchant_admin WHERE id = $1`,
      [adminId]
    );

    if (!admin) {
      res.json({ code: 404, message: '账号不存在', data: null });
      return;
    }

    const oldHash = hashPassword(oldPassword);
    if (oldHash !== admin.password_hash) {
      res.json({ code: 401, message: '旧密码错误', data: null });
      return;
    }

    const newHash = hashPassword(newPassword);
    await execute(
      `UPDATE merchant_admin SET password_hash = $1, first_login = 0, updated_at = NOW() WHERE id = $2`,
      [newHash, adminId]
    );

    res.json({ code: 0, message: '密码修改成功' });
  } catch (e: any) {
    console.error('[MerchantAuth] change-password error:', e?.message || e);
    res.json({ code: 500, message: '修改密码失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/auth/profile
 * 获取当前账号信息（含所属商家详情）
 */
router.get('/profile', merchantAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const adminId = req.merchantAdmin!.merchantAdminId;

    const admin = await queryOne<any>(
      `SELECT ma.id, ma.username, ma.phone, ma.real_name, ma.status, ma.last_login_time, ma.created_at,
              m.id as merchant_id, m.merchant_name, m.merchant_address, m.contact_phone, m.qrcode_url,
              m.region, m.business_hours, m.audit_status,
              m.operator_id
       FROM merchant_admin ma
       LEFT JOIN merchants m ON ma.merchant_id = m.id
       WHERE ma.id = $1`,
      [adminId]
    );

    if (!admin) {
      res.json({ code: 404, message: '账号不存在', data: null });
      return;
    }

    res.json({
      code: 0,
      data: {
        id: admin.id,
        username: admin.username,
        phone: admin.phone || '',
        realName: admin.real_name || '',
        status: admin.status,
        lastLoginTime: admin.last_login_time,
        createdAt: admin.created_at,
        merchant: {
          id: admin.merchant_id,
          name: admin.merchant_name || '',
          address: admin.merchant_address || '',
          contactPhone: admin.contact_phone || '',
          region: admin.region || '',
          businessHours: admin.business_hours || '',
          qrcodeUrl: admin.qrcode_url || '',
          auditStatus: admin.audit_status || 0,
          operatorId: admin.operator_id || '',
        },
      },
    });
  } catch (e: any) {
    console.error('[MerchantAuth] profile error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * PUT /api/v1/merchant/auth/profile
 * 更新个人信息
 */
router.put('/profile', merchantAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const adminId = req.merchantAdmin!.merchantAdminId;
    const { phone, realName, merchantName, merchantAddress, contactPhone, businessHours } = req.body;

    const updatePromises: Promise<any>[] = [];

    // 更新 merchant_admin 表
    const adminUpdates: string[] = [];
    const adminParams: any[] = [];
    let aIdx = 1;

    if (phone !== undefined) { adminUpdates.push(`phone = $${aIdx++}`); adminParams.push(phone); }
    if (realName !== undefined) { adminUpdates.push(`real_name = $${aIdx++}`); adminParams.push(realName); }

    if (adminUpdates.length > 0) {
      adminUpdates.push(`updated_at = NOW()`);
      adminParams.push(adminId);
      updatePromises.push(execute(
        `UPDATE merchant_admin SET ${adminUpdates.join(', ')} WHERE id = $${aIdx}`,
        adminParams
      ));
    }

    // 更新 merchants 表（商家信息）
    const merchantUpdates: string[] = [];
    const merchantParams: any[] = [];
    let mIdx = 1;

    if (merchantName !== undefined) { merchantUpdates.push(`merchant_name = $${mIdx++}`); merchantParams.push(merchantName); }
    if (merchantAddress !== undefined) { merchantUpdates.push(`merchant_address = $${mIdx++}`); merchantParams.push(merchantAddress); }
    if (contactPhone !== undefined) { merchantUpdates.push(`contact_phone = $${mIdx++}`); merchantParams.push(contactPhone); }
    if (businessHours !== undefined) { merchantUpdates.push(`business_hours = $${mIdx++}`); merchantParams.push(businessHours); }

    if (merchantUpdates.length > 0) {
      merchantUpdates.push(`updated_at = NOW()`);
      merchantParams.push(req.merchantAdmin!.merchantId);
      updatePromises.push(execute(
        `UPDATE merchants SET ${merchantUpdates.join(', ')} WHERE id = $${mIdx}`,
        merchantParams
      ));
    }

    if (updatePromises.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    await Promise.all(updatePromises);

    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    console.error('[MerchantAuth] update profile error:', e?.message || e);
    res.json({ code: 500, message: '更新失败', data: null });
  }
});

export default router;
