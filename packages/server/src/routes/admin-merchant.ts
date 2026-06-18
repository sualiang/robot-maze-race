import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
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

/**
 * GET /api/v1/admin/merchant/list
 * 商家列表
 */
router.get('/', authMiddleware, adminMiddleware, operatorMiddleware, async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const merchants = await query<any>(
      `SELECT * FROM merchants ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    const countRow = await queryOne<{ total: number }>(
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
          contactPhone: m.contact_phone || '',
          logoUrl: m.logo_url || '',
          status: m.status || 1,
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
 * POST /api/v1/admin/merchant
 * 创建商家
 */
router.post('/', authMiddleware, adminMiddleware, operatorMiddleware, async (req: Request, res: Response) => {
  const { merchantName, merchantAddress, longitude, latitude, contactPhone, logoUrl, accountPhone, accountPassword } = req.body;

  if (!merchantName) {
    res.json({ code: 400, message: '商家名称不能为空', data: null });
    return;
  }

  try {
    const merchantId = uuidv4();
    await execute(
      `INSERT INTO merchants (id, merchant_name, merchant_address, longitude, latitude, contact_phone, logo_url, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, datetime('now'), datetime('now'))`,
      [
        merchantId,
        merchantName,
        merchantAddress || '',
        longitude !== undefined ? parseFloat(longitude) : 0,
        latitude !== undefined ? parseFloat(latitude) : 0,
        contactPhone || '',
        logoUrl || '',
      ]
    );

    // 同时创建商家管理员账号（直接创建，不需要邀请码）
    let adminId = '';
    let adminPhone = accountPhone || contactPhone || '';
    let adminPassword = accountPassword || '123456';
    if (adminPhone) {
      adminId = uuidv4();
      const crypto = require('crypto');
      const passwordHash = crypto.createHash('sha256').update(adminPassword).digest('hex');
      await execute(
        `INSERT INTO merchant_admin (id, merchant_id, username, password_hash, phone, real_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, '', 1, datetime('now'), datetime('now'))`,
        [adminId, merchantId, adminPhone, passwordHash, adminPhone]
      );
    }

    res.json({
      code: 0,
      data: {
        id: merchantId,
        merchantName,
        adminPhone,
        adminPassword,
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
router.put('/:id', authMiddleware, adminMiddleware, operatorMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { merchantName, merchantAddress, longitude, latitude, contactPhone, logoUrl, status } = req.body;

  try {
    const existing = await queryOne<{ id: string }>('SELECT id FROM merchants WHERE id = $1', [id]);
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
    if (contactPhone !== undefined) { updates.push(`contact_phone = $${idx++}`); params.push(contactPhone); }
    if (logoUrl !== undefined) { updates.push(`logo_url = $${idx++}`); params.push(logoUrl); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    params.push(id);

    await execute(
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
    const totalCoupons = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons`
    );
    const pendingAudit = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE audit_status = 0`
    );
    const approved = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE audit_status = 1`
    );
    const online = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE status = 1 AND audit_status = 1`
    );
    const totalVerified = await queryOne<{ total: number }>(
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

    const existing = await queryOne<any>(
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

    await execute(
      `UPDATE merchant_coupons SET status = 0, audit_remark = $1, updated_at = datetime('now') WHERE id = $2`,
      ['总部强制下架', id]
    );

    res.json({ code: 0, message: '已强制下架' });
  } catch (e: any) {
    console.error('[AdminMerchant] force offline error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

export default router;
