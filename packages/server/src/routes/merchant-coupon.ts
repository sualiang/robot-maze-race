import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { merchantAuthMiddleware } from './merchant-auth';

const router = Router();

// 所有接口都需要商家认证
router.use(merchantAuthMiddleware);

/**
 * POST /api/v1/merchant/coupon/create
 * 创建优惠券（存入 merchant_coupons，audit_status=0）
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const {
      name,
      description,
      denominationCents,
      minConsumeCents,
      totalCount,
      validStart,
      validEnd,
      couponType,
      discountPercent,
      maxPerUser,
      putChannels,
      availableStart,
      availableEnd,
    } = req.body;

    if (!name) {
      res.json({ code: 400, message: '优惠券名称不能为空', data: null });
      return;
    }

    if (!denominationCents || denominationCents <= 0) {
      res.json({ code: 400, message: '面值必须大于0', data: null });
      return;
    }

    if (!totalCount || totalCount <= 0) {
      res.json({ code: 400, message: '库存数量必须大于0', data: null });
      return;
    }

    const id = uuidv4();
    await execute(
      `INSERT INTO merchant_coupons (
        id, merchant_id, name, description, denomination_cents, min_consume_cents,
        total_count, remain_count, valid_start, valid_end, status, sort_order,
        coupon_type, discount_percent, max_per_user, put_channels,
        available_start, available_end, audit_status, version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $7, $8, $9, 1, 0,
        $10, $11, $12, $13,
        $14, $15, 0, 1, datetime('now'), datetime('now')
      )`,
      [
        id,
        merchantId,
        name,
        description || '',
        denominationCents,
        minConsumeCents || 0,
        totalCount,
        validStart || null,
        validEnd || null,
        couponType || 1,
        discountPercent || 0,
        maxPerUser || 1,
        putChannels || '{}',
        availableStart || null,
        availableEnd || null,
      ]
    );

    res.json({
      code: 0,
      message: '创建成功，等待审核',
      data: { id },
    });
  } catch (e: any) {
    console.error('[MerchantCoupon] create error:', e?.message || e);
    res.json({ code: 500, message: '创建失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/coupon/list
 * 优惠券列表（只返回本商家的，可筛选状态/审核状态）
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;

    const status = req.query.status as string; // 可选: 1=上架 0=下架
    const auditStatus = req.query.auditStatus as string; // 可选: 0=待审核 1=已通过 2=已驳回
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['merchant_id = ?'];
    const params: any[] = [merchantId];

    if (status) {
      conditions.push('status = ?');
      params.push(parseInt(status, 10));
    }

    if (auditStatus) {
      conditions.push('audit_status = ?');
      params.push(parseInt(auditStatus, 10));
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons ${whereClause}`,
      params
    );

    const coupons = await query<any>(
      `SELECT * FROM merchant_coupons ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: (coupons || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          denominationCents: c.denomination_cents,
          minConsumeCents: c.min_consume_cents || 0,
          totalCount: c.total_count,
          remainCount: c.remain_count,
          couponType: c.coupon_type,
          discountPercent: c.discount_percent || 0,
          maxPerUser: c.max_per_user || 1,
          putChannels: (() => { try { return JSON.parse(c.put_channels || '{}'); } catch { return {}; } })(),
          status: c.status,
          auditStatus: c.audit_status,
          auditRemark: c.audit_remark || '',
          version: c.version || 1,
          validStart: c.valid_start ? new Date(c.valid_start).getTime() : null,
          validEnd: c.valid_end ? new Date(c.valid_end).getTime() : null,
          availableStart: c.available_start ? new Date(c.available_start).getTime() : null,
          availableEnd: c.available_end ? new Date(c.available_end).getTime() : null,
          sortOrder: c.sort_order || 0,
          createdAt: new Date(c.created_at).getTime(),
          updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : null,
        })),
        total: countRow?.total || 0,
        page,
        pageSize,
      },
    });
  } catch (e: any) {
    console.error('[MerchantCoupon] list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/coupon/detail/:id
 * 优惠券详情
 */
router.get('/detail/:id', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const coupon = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (!coupon) {
      res.json({ code: 404, message: '优惠券不存在', data: null });
      return;
    }

    res.json({
      code: 0,
      data: {
        id: coupon.id,
        name: coupon.name,
        description: coupon.description || '',
        denominationCents: coupon.denomination_cents,
        minConsumeCents: coupon.min_consume_cents || 0,
        totalCount: coupon.total_count,
        remainCount: coupon.remain_count,
        couponType: coupon.coupon_type,
        discountPercent: coupon.discount_percent || 0,
        maxPerUser: coupon.max_per_user || 1,
        putChannels: (() => { try { return JSON.parse(coupon.put_channels || '{}'); } catch { return {}; } })(),
        status: coupon.status,
        auditStatus: coupon.audit_status,
        auditRemark: coupon.audit_remark || '',
        version: coupon.version || 1,
        validStart: coupon.valid_start ? new Date(coupon.valid_start).getTime() : null,
        validEnd: coupon.valid_end ? new Date(coupon.valid_end).getTime() : null,
        availableStart: coupon.available_start ? new Date(coupon.available_start).getTime() : null,
        availableEnd: coupon.available_end ? new Date(coupon.available_end).getTime() : null,
        sortOrder: coupon.sort_order || 0,
        createdAt: new Date(coupon.created_at).getTime(),
        updatedAt: coupon.updated_at ? new Date(coupon.updated_at).getTime() : null,
      },
    });
  } catch (e: any) {
    console.error('[MerchantCoupon] detail error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * PUT /api/v1/merchant/coupon/:id
 * 修改优惠券（只有 audit_status=0 或 2 时可修改，修改后版本号+1，audit_status 重置为 0）
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (!existing) {
      res.json({ code: 404, message: '优惠券不存在', data: null });
      return;
    }

    if (existing.audit_status === 1) {
      res.json({ code: 400, message: '已审核通过的优惠券不能修改，如需修改请先下架', data: null });
      return;
    }

    const {
      name,
      description,
      denominationCents,
      minConsumeCents,
      totalCount,
      validStart,
      validEnd,
      couponType,
      discountPercent,
      maxPerUser,
      putChannels,
      availableStart,
      availableEnd,
    } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (denominationCents !== undefined) { updates.push(`denomination_cents = $${idx++}`); params.push(denominationCents); }
    if (minConsumeCents !== undefined) { updates.push(`min_consume_cents = $${idx++}`); params.push(minConsumeCents); }
    if (totalCount !== undefined) {
      updates.push(`total_count = $${idx++}`);
      params.push(totalCount);
      // remainCount 不能超过 new totalCount
      if (existing.remain_count > totalCount) {
        updates.push(`remain_count = $${idx++}`); params.push(totalCount);
      }
    }
    if (validStart !== undefined) { updates.push(`valid_start = $${idx++}`); params.push(validStart); }
    if (validEnd !== undefined) { updates.push(`valid_end = $${idx++}`); params.push(validEnd); }
    if (couponType !== undefined) { updates.push(`coupon_type = $${idx++}`); params.push(couponType); }
    if (discountPercent !== undefined) { updates.push(`discount_percent = $${idx++}`); params.push(discountPercent); }
    if (maxPerUser !== undefined) { updates.push(`max_per_user = $${idx++}`); params.push(maxPerUser); }
    if (putChannels !== undefined) { updates.push(`put_channels = $${idx++}`); params.push(putChannels); }
    if (availableStart !== undefined) { updates.push(`available_start = $${idx++}`); params.push(availableStart); }
    if (availableEnd !== undefined) { updates.push(`available_end = $${idx++}`); params.push(availableEnd); }

    // 修改后版本号+1，audit_status 重置为待审核
    updates.push(`version = version + 1`);
    updates.push(`audit_status = 0`);
    updates.push(`audit_remark = ''`);
    updates.push(`updated_at = datetime('now')`);

    params.push(id);

    await execute(
      `UPDATE merchant_coupons SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ code: 0, message: '修改成功，等待重新审核' });
  } catch (e: any) {
    console.error('[MerchantCoupon] update error:', e?.message || e);
    res.json({ code: 500, message: '修改失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/coupon/:id/toggle
 * 上下架（只有 audit_status=1 的券可操作）
 */
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (!existing) {
      res.json({ code: 404, message: '优惠券不存在', data: null });
      return;
    }

    if (existing.audit_status !== 1) {
      res.json({ code: 400, message: '仅审核通过的优惠券可上下架', data: null });
      return;
    }

    const newStatus = existing.status === 1 ? 0 : 1;
    await execute(
      `UPDATE merchant_coupons SET status = $1, updated_at = datetime('now') WHERE id = $2`,
      [newStatus, id]
    );

    res.json({
      code: 0,
      message: newStatus === 1 ? '已上架' : '已下架',
      data: { status: newStatus },
    });
  } catch (e: any) {
    console.error('[MerchantCoupon] toggle error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/coupon/stats
 * 统计：累计创建、已上架、累计被领取、累计核销
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;

    // 累计创建（该商家的所有优惠券模板数）
    const createdRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE merchant_id = $1`,
      [merchantId]
    );

    // 已上架（status=1 且 audit_status=1）
    const onlineRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE merchant_id = $1 AND status = 1 AND audit_status = 1`,
      [merchantId]
    );

    // 累计被领取（该商家所有券的 remain_count 变化？更准确：查询 user_coupons 中属于该商家的记录数）
    const claimedRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM user_coupons WHERE merchant_id = $1`,
      [merchantId]
    );

    // 累计核销
    const verifiedRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM user_coupons WHERE merchant_id = $1 AND status = 2`,
      [merchantId]
    );

    res.json({
      code: 0,
      data: {
        totalCreated: createdRow?.total || 0,
        totalOnline: onlineRow?.total || 0,
        totalClaimed: claimedRow?.total || 0,
        totalVerified: verifiedRow?.total || 0,
      },
    });
  } catch (e: any) {
    console.error('[MerchantCoupon] stats error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

export default router;
