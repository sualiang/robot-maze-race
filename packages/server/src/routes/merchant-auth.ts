import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { compareSync, hashSync } from '../config/bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query, queryOne, execute, getOperatorPool } from '../config/database';

const router = Router();

// ============================================================
// Merchant Admin 认证相关类型
// ============================================================
export interface MerchantAuthPayload {
  merchantAdminId: string;
  merchantId: string;
  merchantName: string;
  operatorId: string;
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
 * bcrypt 密码哈希 — 与 auth.ts / operator.ts 保持一致
 */
function hashPassword(password: string): string {
  return hashSync(password, 10);
}

function verifyPassword(password: string, hash: string): boolean {
  return compareSync(password, hash);
}

/**
 * 获取运营商 operator pool（用于无 auth 或独立认证的公开路由）
 */
async function resolveMerchantOpPool(req: Request): Promise<any> {
  // 优先从 merchantAdmin 取 operatorId（登录后路由）
  const opId = req.merchantAdmin?.operatorId || req.body.operatorId;
  if (!opId) return null;
  const row = await queryOne<{ db_name: string }>(
    'SELECT db_name FROM operators_registry WHERE operator_id = $1', [opId]
  );
  if (!row) return null;
  return getOperatorPool(row.db_name);
}

/**
 * 商家认证中间件
 * 验证 JWT — 返回 401 未登录
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
 * @body operatorId — 运营商ID（必填，用于确定 DB）
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, inviteCode, phone, realName, operatorId } = req.body;

    if (!username || !password || !inviteCode) {
      res.json({ code: 400, message: '用户名、密码和邀请码不能为空', data: null });
      return;
    }
    if (!operatorId) {
      res.json({ code: 400, message: '缺少运营商信息', data: null });
      return;
    }

    if (password.length < 6) {
      res.json({ code: 400, message: '密码长度不能少于6位', data: null });
      return;
    }

    // 手动查 DB 名 → 获取 operator pool
    const opDbName = (await queryOne<{ db_name: string }>(
      'SELECT db_name FROM operators_registry WHERE operator_id = $1', [operatorId]
    ))?.db_name;
    if (!opDbName) {
      res.json({ code: 500, message: '运营商信息不完整', data: null });
      return;
    }
    const pool = getOperatorPool(opDbName);

    // 校验邀请码
    const [inviteRows] = await pool.execute(
      `SELECT * FROM merchant_invite_codes WHERE code = ? AND used = 0`,
      [inviteCode]
    );
    const invite = (inviteRows as any[])?.[0];
    if (!invite) {
      res.json({ code: 400, message: '邀请码无效或已使用', data: null });
      return;
    }

    // 检查用户名是否已存在
    const [adminRows] = await pool.execute(
      `SELECT id FROM merchant_admin WHERE username = ?`,
      [username]
    );
    if ((adminRows as any[])?.[0]) {
      res.json({ code: 400, message: '用户名已存在', data: null });
      return;
    }

    // 创建商家子账号
    const id = uuidv4();
    const passwordHash = hashPassword(password);
    await pool.execute(
      `INSERT INTO merchant_admin (id, merchant_id, username, password_hash, phone, real_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [id, (invite as any).merchant_id, username, passwordHash, phone || '', realName || '']
    );

    // 标记邀请码已使用
    await pool.execute(
      `UPDATE merchant_invite_codes SET used = 1, used_by = ?, used_at = NOW() WHERE id = ?`,
      [id, (invite as any).id]
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
 * 商家登录（用户名 + 密码 + operatorId，返回 JWT）
 * @body operatorId — 运营商ID（必填，用于确定 DB）
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password, operatorId } = req.body;

    if (!username || !password) {
      res.json({ code: 400, message: '用户名和密码不能为空', data: null });
      return;
    }
    if (!operatorId) {
      res.json({ code: 400, message: '缺少运营商信息', data: null });
      return;
    }

    const opDbName = (await queryOne<{ db_name: string }>(
      'SELECT db_name FROM operators_registry WHERE operator_id = $1', [operatorId]
    ))?.db_name;
    if (!opDbName) {
      res.json({ code: 500, message: '运营商信息不完整', data: null });
      return;
    }
    const pool = getOperatorPool(opDbName);

    const [adminRows] = await pool.execute(
      `SELECT ma.*, m.merchant_name
       FROM merchant_admin ma
       LEFT JOIN merchants m ON ma.merchant_id = m.id
       WHERE ma.username = ?`,
      [username]
    );
    const adminRow = (adminRows as any[])?.[0];

    if (!adminRow) {
      res.json({ code: 401, message: '用户名或密码错误', data: null });
      return;
    }

    if (adminRow.status !== 1) {
      res.json({ code: 403, message: '账号已被禁用', data: null });
      return;
    }

    // 验证密码
    if (!verifyPassword(password, adminRow.password_hash)) {
      res.json({ code: 401, message: '用户名或密码错误', data: null });
      return;
    }

    // 更新最后登录时间
    await pool.execute(
      `UPDATE merchant_admin SET last_login_time = NOW(), updated_at = NOW() WHERE id = ?`,
      [adminRow.id]
    );

    // 生成 JWT（携带 operatorId 以便后续请求可获取 DB）
    const payload: MerchantAuthPayload = {
      merchantAdminId: adminRow.id,
      merchantId: adminRow.merchant_id,
      merchantName: adminRow.merchant_name || '',
      operatorId: operatorId,
      role: 'merchant_admin',
    };
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        firstLogin: adminRow.first_login === 1,
        admin: {
          id: adminRow.id,
          username: adminRow.username,
          phone: adminRow.phone || '',
          realName: adminRow.real_name || '',
          merchantId: adminRow.merchant_id,
          merchantName: adminRow.merchant_name || '',
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

    const pool = await resolveMerchantOpPool(req);
    if (!pool) { res.json({ code: 500, message: '运营商信息不完整', data: null }); return; }

    // 查询当前密码
    const [adminRows] = await pool.execute(
      `SELECT password_hash FROM merchant_admin WHERE id = ?`,
      [adminId]
    );
    const adminRow = (adminRows as any[])?.[0];

    if (!adminRow) {
      res.json({ code: 404, message: '账号不存在', data: null });
      return;
    }

    if (!verifyPassword(oldPassword, adminRow.password_hash)) {
      res.json({ code: 401, message: '旧密码错误', data: null });
      return;
    }

    const newHash = hashPassword(newPassword);
    await pool.execute(
      `UPDATE merchant_admin SET password_hash = ?, first_login = 0, updated_at = NOW() WHERE id = ?`,
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

    const pool = await resolveMerchantOpPool(req);
    if (!pool) { res.json({ code: 500, message: '运营商信息不完整', data: null }); return; }

    const [adminRows] = await pool.execute(
      `SELECT ma.id, ma.username, ma.phone, ma.real_name, ma.status, ma.last_login_time, ma.created_at,
              m.id as merchant_id, m.merchant_name, m.merchant_address, m.contact_phone, m.qrcode_url,
              m.region, m.business_hours, m.audit_status,
              m.operator_id
       FROM merchant_admin ma
       LEFT JOIN merchants m ON ma.merchant_id = m.id
       WHERE ma.id = ?`,
      [adminId]
    );
    const adminRow = (adminRows as any[])?.[0];

    if (!adminRow) {
      res.json({ code: 404, message: '账号不存在', data: null });
      return;
    }

    res.json({
      code: 0,
      data: {
        id: adminRow.id,
        username: adminRow.username,
        phone: adminRow.phone || '',
        realName: adminRow.real_name || '',
        status: adminRow.status,
        lastLoginTime: adminRow.last_login_time,
        createdAt: adminRow.created_at,
        merchant: {
          id: adminRow.merchant_id,
          name: adminRow.merchant_name || '',
          address: adminRow.merchant_address || '',
          contactPhone: adminRow.contact_phone || '',
          region: adminRow.region || '',
          businessHours: adminRow.business_hours || '',
          qrcodeUrl: adminRow.qrcode_url || '',
          auditStatus: adminRow.audit_status || 0,
          operatorId: adminRow.operator_id || '',
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

    const pool = await resolveMerchantOpPool(req);
    if (!pool) { res.json({ code: 500, message: '运营商信息不完整', data: null }); return; }

    const updatePromises: Promise<any>[] = [];

    // 更新 merchant_admin 表
    const adminUpdates: string[] = [];
    const adminParams: any[] = [];

    if (phone !== undefined) { adminUpdates.push(`phone = ?`); adminParams.push(phone); }
    if (realName !== undefined) { adminUpdates.push(`real_name = ?`); adminParams.push(realName); }

    if (adminUpdates.length > 0) {
      adminUpdates.push(`updated_at = NOW()`);
      adminParams.push(adminId);
      updatePromises.push(pool.execute(
        `UPDATE merchant_admin SET ${adminUpdates.join(', ')} WHERE id = ?`,
        adminParams
      ));
    }

    // 更新 merchants 表（商家信息）
    const merchantUpdates: string[] = [];
    const merchantParams: any[] = [];

    if (merchantName !== undefined) { merchantUpdates.push(`merchant_name = ?`); merchantParams.push(merchantName); }
    if (merchantAddress !== undefined) { merchantUpdates.push(`merchant_address = ?`); merchantParams.push(merchantAddress); }
    if (contactPhone !== undefined) { merchantUpdates.push(`contact_phone = ?`); merchantParams.push(contactPhone); }
    if (businessHours !== undefined) { merchantUpdates.push(`business_hours = ?`); merchantParams.push(businessHours); }

    if (merchantUpdates.length > 0) {
      merchantUpdates.push(`updated_at = NOW()`);
      merchantParams.push(req.merchantAdmin!.merchantId);
      updatePromises.push(pool.execute(
        `UPDATE merchants SET ${merchantUpdates.join(', ')} WHERE id = ?`,
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
