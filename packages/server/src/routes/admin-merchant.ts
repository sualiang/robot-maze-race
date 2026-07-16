import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { hashSync } from '../config/bcrypt';
import { query, queryOne, execute, generateSecurePassword, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// 总部/运营后台商家管理 API
// adminMiddleware — 超级管理员/管理员
// operatorMiddleware — 运营人员
// ============================================================
function adminMiddleware(req: Request, res: Response, next: Function): void {
  const permissions = req.user?.permissions;
  if (!permissions || (!permissions.includes('*') && !permissions.includes('operators:list'))) {
    res.status(403).json({ code: 403, message: '权限不足', data: null });
    return;
  }
  next();
}

function operatorMiddleware(req: Request, res: Response, next: Function): void {
  const permissions = req.user?.permissions;
  if (!permissions || (!permissions.includes('*') && !permissions.some(p => p.startsWith('marketing:') || p.startsWith('operators:')))) {
    res.status(403).json({ code: 403, message: '权限不足', data: null });
    return;
  }
  next();
}

// 检测是否有全部权限的通配中间件
function anyPermissionMiddleware(req: Request, res: Response, next: Function): void {
  const permissions = req.user?.permissions;
  if (!permissions || permissions.length === 0) {
    res.status(403).json({ code: 403, message: '权限不足', data: null });
    return;
  }
  next();
}

/**
 * GET /api/v1/admin/merchant/list
 * 商家列表
 */
router.get('/', authMiddleware, anyPermissionMiddleware, async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const merchants = await queryOp<any>(req, 
      `SELECT * FROM merchants ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    const countRow = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM merchants`
    );

    res.json({
      code: 0,
      data: {
        list: (merchants || []).map((m: any) => ({
          id: m.id,
          merchantName: m.merchant_name,
          merchantAddress: m.merchant_address || '',
          longitude: m.longitude || 0,
          latitude: m.latitude || 0,
          contactName: m.contact_name || '',
          contactPhone: m.contact_phone || '',
          logoUrl: m.logo_url || '',
          status: m.status != null ? m.status : 1,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        })),
        total: countRow?.total || 0,
        page,
        pageSize,
      }
    });
  } catch (e: any) {
    console.error('[AdminMerchant] list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/admin/merchant/:id
 * 获取商家详情
 */
router.get('/:id', authMiddleware, anyPermissionMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchant = await queryOpOne<any>(req, 
      `SELECT m.*, (SELECT COUNT(*) FROM merchant_admin ma WHERE ma.merchant_id = m.id) as admin_count
       FROM merchants m WHERE m.id = $1`,
      [id]
    );
    if (!merchant) {
      res.status(404).json({ code: 404, message: '商家不存在', data: null });
      return;
    }
    res.json({
      code: 0,
      message: 'ok',
      data: {
        id: merchant.id,
        merchantName: merchant.merchant_name,
        merchantAddress: merchant.merchant_address || '',
        longitude: merchant.longitude || 0,
        latitude: merchant.latitude || 0,
        contactName: merchant.contact_name || '',
        contactPhone: merchant.contact_phone || '',
        logoUrl: merchant.logo_url || '',
        status: merchant.status != null ? merchant.status : 1,
        adminCount: parseInt(merchant.admin_count, 10) || 0,
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at,
      },
    });
  } catch (e: any) {
    console.error('[AdminMerchant] detail error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/admin/merchant
 * 创建商家
 */
router.post('/', authMiddleware, anyPermissionMiddleware, async (req: Request, res: Response) => {
  const { merchantName, merchantAddress, longitude, latitude, contactName, contactPhone, logoUrl, accountPhone } = req.body;

  if (!merchantName) {
    res.json({ code: 400, message: '商家名称不能为空', data: null });
    return;
  }

  try {
    const merchantId = uuidv4();
    await executeOp(req, 
      `INSERT INTO merchants (id, merchant_name, merchant_address, longitude, latitude, contact_name, contact_phone, logo_url, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())`,
      [
        merchantId,
        merchantName,
        merchantAddress || '',
        longitude !== undefined ? parseFloat(longitude) : 0,
        latitude !== undefined ? parseFloat(latitude) : 0,
        contactName || '',
        contactPhone || '',
        logoUrl || '',
      ]
    );

    // 生成随机密码
    const adminPassword = generateSecurePassword();
    console.log('[AdminMerchant] creating merchant:', { merchantName, merchantAddress, accountPhone, contactPhone });

    // 同时创建商家管理员账号（直接创建，不需要邀请码）
    let adminId = '';
    let adminPhone = accountPhone || contactPhone || '';
    console.log('[AdminMerchant] adminPhone:', adminPhone);
    if (adminPhone) {
      adminId = uuidv4();
      const passwordHash = hashSync(adminPassword, 10);
      await executeOp(req, 
        `INSERT INTO merchant_admin (id, merchant_id, username, password_hash, phone, real_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, '', 1, NOW(), NOW())`,
        [adminId, merchantId, adminPhone, passwordHash, adminPhone]
      );
    }

    const loginUrl = process.env.WEB_URL || 'https://dog.amberrobot.com.cn/merchant';
    res.json({
      code: 0,
      data: {
        id: merchantId,
        merchantName,
        adminPhone,
        adminPassword,
        loginUrl,
        adminCreated: !!adminId,
      }
    });
  } catch (e: any) {
    console.error('[AdminMerchant] create error:', e?.message || e);
    res.json({ code: 500, message: '创建失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/merchant/:id
 * 编辑商家（含坐标）
 */
router.put('/:id', authMiddleware, anyPermissionMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { merchantName, merchantAddress, longitude, latitude, contactName, contactPhone, logoUrl, status } = req.body;

  try {
    const existing = await queryOpOne<{ id: string }>(req, 'SELECT id FROM merchants WHERE id = $1', [id]);
    if (!existing) {
      res.json({ code: 404, message: '商家不存在', data: null });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (merchantName !== undefined) { updates.push(`merchant_name = $${idx++}`); params.push(merchantName); }
    if (merchantAddress !== undefined) { updates.push(`merchant_address = $${idx++}`); params.push(merchantAddress); }
    if (longitude !== undefined) { updates.push(`longitude = $${idx++}`); params.push(parseFloat(longitude)); }
    if (latitude !== undefined) { updates.push(`latitude = $${idx++}`); params.push(parseFloat(latitude)); }
    if (contactName !== undefined) { updates.push(`contact_name = $${idx++}`); params.push(contactName); }
    if (contactPhone !== undefined) { updates.push(`contact_phone = $${idx++}`); params.push(contactPhone); }
    if (logoUrl !== undefined) { updates.push(`logo_url = $${idx++}`); params.push(logoUrl); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await executeOp(req, 
      `UPDATE merchants SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    console.error('[AdminMerchant] update error:', e?.message || e);
    res.json({ code: 500, message: '更新失败', data: null });
  }
});

// ============================================================
// 总部优惠券统计 & 强制下架 API
// 总部不审核优惠券（由运营商审核），仅提供统计和违规券强制下架
// ============================================================

/**
 * GET /api/v1/admin/merchant/coupon/stats
 * 优惠券统计概况（全国/全部运营商）
 */
router.get('/coupon/stats', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const totalCoupons = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM merchant_coupons`
    );
    const pendingAudit = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE audit_status = 0`
    );
    const approved = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE audit_status = 1`
    );
    const online = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE status = 1 AND audit_status = 1`
    );
    const totalVerified = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM user_coupons WHERE status = 2`
    );

    res.json({
      code: 0,
      data: {
        totalCoupons: totalCoupons?.total || 0,
        pendingAudit: pendingAudit?.total || 0,
        approved: approved?.total || 0,
        online: online?.total || 0,
        totalVerified: totalVerified?.total || 0,
      },
    });
  } catch (e: any) {
    console.error('[AdminMerchant] coupon stats error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/admin/merchant/coupon/:id/force-offline
 * 总部强制下架违规券
 */
router.post('/coupon/:id/force-offline', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await queryOpOne<any>(req, 
      `SELECT * FROM merchant_coupons WHERE id = $1`,
      [id]
    );

    if (!existing) {
      res.json({ code: 404, message: '优惠券不存在', data: null });
      return;
    }

    if (existing.status !== 1) {
      res.json({ code: 400, message: '该优惠券已下架', data: null });
      return;
    }

    await executeOp(req, 
      `UPDATE merchant_coupons SET status = 0, audit_remark = $1, updated_at = NOW() WHERE id = $2`,
      ['总部强制下架', id]
    );

    res.json({ code: 0, message: '已强制下架' });
  } catch (e: any) {
    console.error('[AdminMerchant] force offline error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

// ============================================================
// 删除商家（仅 super_admin）
// ============================================================
router.delete('/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const permissions = req.user?.permissions || [];
    const role = req.user?.role || '';
    if (!permissions.includes('*') && role !== 'admin') {
      res.status(403).json({ code: 403, message: '您没有删除商家的权限', data: null });
      return;
    }

    const existing = await queryOpOne<any>(req, 'SELECT id FROM merchants WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ code: 404, message: '商家不存在', data: null });
      return;
    }

    // 删除关联数据
    await executeOp(req, 'DELETE FROM merchant_admin WHERE merchant_id = $1', [id]);
    await executeOp(req, 'DELETE FROM merchant_coupons WHERE merchant_id = $1', [id]);
    await executeOp(req, 'DELETE FROM merchants WHERE id = $1', [id]);

    res.json({ code: 0, message: '商家已删除' });
  } catch (e: any) {
    console.error('[AdminMerchant] delete error:', e?.message || e);
    res.json({ code: 500, message: '删除失败', data: null });
  }
});

// ============================================================
// 启用/禁用商家
// ============================================================
router.patch('/:id/status', authMiddleware, anyPermissionMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 1=启用, 0=禁用

    if (status !== 0 && status !== 1) {
      res.json({ code: 400, message: '状态值无效', data: null });
      return;
    }

    const existing = await queryOpOne<any>(req, 'SELECT id FROM merchants WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ code: 404, message: '商家不存在', data: null });
      return;
    }

    await executeOp(req, 'UPDATE merchants SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

    res.json({ code: 0, message: status === 1 ? '商家已启用' : '商家已禁用' });
  } catch (e: any) {
    console.error('[AdminMerchant] toggle status error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

// PUT 别名，兼容前端调用 PUT /admin/merchant/:id/status
router.put('/:id/status', authMiddleware, anyPermissionMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== 0 && status !== 1) {
    res.json({ code: 400, message: '状态值无效', data: null });
    return;
  }

  const existing = await queryOpOne<any>(req, 'SELECT id FROM merchants WHERE id = $1', [id]);
  if (!existing) {
    res.status(404).json({ code: 404, message: '商家不存在', data: null });
    return;
  }

  await executeOp(req, 'UPDATE merchants SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

  res.json({ code: 0, message: status === 1 ? '商家已启用' : '商家已禁用' });
});

/**
 * POST /api/v1/admin/merchant/:id/reset-password
 * 运营商超管/运营重置商家管理员密码
 */
router.post('/:id/reset-password', authMiddleware, operatorMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 查商家是否存在
    const merchant = await queryOpOne<{ id: string }>(req, 'SELECT id FROM merchants WHERE id = $1', [id]);
    if (!merchant) {
      res.json({ code: 404, message: '商家不存在', data: null });
      return;
    }

    // 查商家管理员账号（可能不存在）
    let admin = await queryOpOne<{ id: string; username: string }>(req, 
      'SELECT id, username FROM merchant_admin WHERE merchant_id = $1 LIMIT 1',
      [id]
    );

    // 生成新密码
    const newPassword = generateSecurePassword();
    const passwordHash = hashSync(newPassword, 10);

    if (!admin) {
      // 没有管理员：自动创建
      const adminId = uuidv4();
      await executeOp(req, 
        `INSERT INTO merchant_admin (id, merchant_id, username, password_hash, phone, first_login, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())`,
        [adminId, id, 'admin', passwordHash, '']
      );
    } else {
      // 有管理员：重置密码 + 标记首次登录
      await executeOp(req, 
        `UPDATE merchant_admin SET password_hash = $1, first_login = 1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, admin.id]
      );
    }

    res.json({
      code: 0,
      message: '密码已重置',
      data: { initPassword: newPassword },
    });
  } catch (e: any) {
    console.error('[AdminMerchant] reset password error:', e?.message || e);
    res.json({ code: 500, message: '重置密码失败', data: null });
  }
});

export default router;
