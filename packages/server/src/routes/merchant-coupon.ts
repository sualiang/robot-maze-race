import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { merchantAuthMiddleware } from './merchant-auth';

const router = Router();

// 所有接口都需要商家认证
router.use(merchantAuthMiddleware);

// ============================================================
// audit_status 枚举
//   0 = 草稿 (创建成功默认)
//   1 = 待审核 (商家提交审核)
//   2 = 审核通过 (运营商审核通过，但未上架)
//   3 = 审核驳回
//   4 = 待下架审核 (已上架商家申请下架)
// ============================================================

// ============================================================
// coupon_type 枚举 (折扣券已取消)
//   1 = 无门槛立减券
//   3 = 满减券
//   4 = 兑换券
// ============================================================

/**
 * POST /api/v1/merchant/coupon/create
 * 创建优惠券 → 草稿 (audit_status=0)
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const {
      name, description, denominationCents, minConsumeCents,
      totalCount, validStart, validEnd, couponType,
      maxPerUser, putChannels,
    } = req.body;

    if (!name) { res.json({ code: 400, message: '优惠券名称不能为空', data: null }); return; }

    // 兑换券不需要面值校验（也可能是需要），但为了逻辑清晰，无门槛立减和满减需要面值
    if (couponType !== 4 && (!denominationCents || denominationCents <= 0)) {
      res.json({ code: 400, message: '请填写面值', data: null });
      return;
    }
    if (!totalCount || totalCount <= 0) {
      res.json({ code: 400, message: '库存数量必须大于0', data: null });
      return;
    }

    const id = uuidv4();
    await execute(
      `INSERT INTO merchant_coupons (
        id, merchant_id, name, description,
        denomination_cents, min_consume_cents,
        total_count, remain_count,
        valid_start, valid_end,
        status, sort_order, coupon_type,
        max_per_user, put_channels,
        audit_status, version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, 1, 0, $10, $11, $12, 0, 1, datetime('now'), datetime('now'))`,
      [
        id, merchantId, name, description || '',
        denominationCents || 0, minConsumeCents || 0,
        totalCount, validStart || null, validEnd || null,
        couponType || 1, maxPerUser || 1, putChannels || '{}',
      ]
    );

    res.json({ code: 0, message: '创建成功', data: { id } });
  } catch (e: any) {
    console.error('[MerchantCoupon] create error:', e?.message || e);
    res.json({ code: 500, message: '创建失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/coupon/:id/submit-audit
 * 提交审核：草稿→待审核 (audit_status: 0→1)
 */
router.post('/:id/submit-audit', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );
    if (!existing) { res.json({ code: 404, message: '优惠券不存在', data: null }); return; }
    if (existing.audit_status !== 0) {
      res.json({ code: 400, message: '仅草稿状态的优惠券可提交审核', data: null });
      return;
    }
    // 校验必填项
    if (!existing.name) { res.json({ code: 400, message: '请先填写优惠券名称', data: null }); return; }
    if (!existing.total_count || existing.total_count <= 0) { res.json({ code: 400, message: '请先设置库存数量', data: null }); return; }

    await execute(
      `UPDATE merchant_coupons SET audit_status = 1, updated_at = datetime('now') WHERE id = $1`,
      [id]
    );

    res.json({ code: 0, message: '已提交审核，请等待运营商审核' });
  } catch (e: any) {
    console.error('[MerchantCoupon] submit-audit error:', e?.message || e);
    res.json({ code: 500, message: '提交失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/coupon/:id/request-offline
 * 申请下架：已上架→待下架审核 (audit_status: 2/已上架→4)
 */
router.post('/:id/request-offline', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );
    if (!existing) { res.json({ code: 404, message: '优惠券不存在', data: null }); return; }
    if (existing.audit_status !== 2 || existing.status !== 1) {
      res.json({ code: 400, message: '仅已上架的优惠券可申请下架', data: null });
      return;
    }

    await execute(
      `UPDATE merchant_coupons SET audit_status = 4, updated_at = datetime('now') WHERE id = $1`,
      [id]
    );

    res.json({ code: 0, message: '已申请下架，请等待运营商审核' });
  } catch (e: any) {
    console.error('[MerchantCoupon] request-offline error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/coupon/:id/cancel-offline
 * 撤销下架申请：待下架审核→回到已上架 (audit_status: 4→2)
 */
router.post('/:id/cancel-offline', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );
    if (!existing) { res.json({ code: 404, message: '优惠券不存在', data: null }); return; }
    if (existing.audit_status !== 4) {
      res.json({ code: 400, message: '仅待下架审核状态的优惠券可撤销下架申请', data: null });
      return;
    }

    await execute(
      `UPDATE merchant_coupons SET audit_status = 2, updated_at = datetime('now') WHERE id = $1`,
      [id]
    );

    res.json({ code: 0, message: '已撤销下架申请' });
  } catch (e: any) {
    console.error('[MerchantCoupon] cancel-offline error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/coupon/:id/online
 * 上架：
 *   - 审核通过（audit_status=2）→ 直接上架 (status=1)
 *   - 已下架（audit_status=2+status=0）→ 直接上架 (status=1)
 */
router.post('/:id/online', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );
    if (!existing) { res.json({ code: 404, message: '优惠券不存在', data: null }); return; }
    if (existing.audit_status !== 2) {
      res.json({ code: 400, message: '仅审核通过的优惠券可上架', data: null });
      return;
    }
    if (existing.status === 1) {
      res.json({ code: 400, message: '优惠券已上架', data: null });
      return;
    }

    await execute(
      `UPDATE merchant_coupons SET status = 1, updated_at = datetime('now') WHERE id = $1`,
      [id]
    );

    res.json({ code: 0, message: '已上架' });
  } catch (e: any) {
    console.error('[MerchantCoupon] online error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

/**
 * PUT /api/v1/merchant/coupon/:id
 * 编辑优惠券
 *   草稿(0) → 编辑后保持草稿
 *   审核通过(2) → 编辑后回到草稿(0)，需重新提交审核
 *   已驳回(3) → 编辑后回到草稿(0)
 *   其他状态不允许编辑
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );
    if (!existing) { res.json({ code: 404, message: '优惠券不存在', data: null }); return; }

    // 检查是否可编辑
    if (existing.audit_status === 1) {
      res.json({ code: 400, message: '待审核状态的优惠券不能修改，请等待审核结果', data: null });
      return;
    }
    if (existing.audit_status === 4) {
      res.json({ code: 400, message: '待下架审核状态的优惠券不能修改', data: null });
      return;
    }
    if (existing.audit_status === 2 && existing.status === 1) {
      res.json({ code: 400, message: '已上架的优惠券不能编辑，如需修改请申请下架', data: null });
      return;
    }

    const {
      name, description, denominationCents, minConsumeCents,
      totalCount, validStart, validEnd, couponType,
      maxPerUser, putChannels,
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
      if (existing.remain_count > totalCount) {
        updates.push(`remain_count = $${idx++}`);
        params.push(totalCount);
      }
    }
    if (validStart !== undefined) { updates.push(`valid_start = $${idx++}`); params.push(validStart); }
    if (validEnd !== undefined) { updates.push(`valid_end = $${idx++}`); params.push(validEnd); }
    if (couponType !== undefined) { updates.push(`coupon_type = $${idx++}`); params.push(couponType); }
    if (maxPerUser !== undefined) { updates.push(`max_per_user = $${idx++}`); params.push(maxPerUser); }
    if (putChannels !== undefined) { updates.push(`put_channels = $${idx++}`); params.push(putChannels); }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有要修改的字段', data: null });
      return;
    }

    // 版本号+1
    updates.push(`version = version + 1`);
    // 如果当前是审核通过(2)或已驳回(3)，编辑后回到草稿(0)
    if (existing.audit_status === 2 || existing.audit_status === 3) {
      updates.push(`audit_status = 0`);
    }
    updates.push(`updated_at = datetime('now')`);

    params.push(id);
    await execute(
      `UPDATE merchant_coupons SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ code: 0, message: '修改成功' });
  } catch (e: any) {
    console.error('[MerchantCoupon] update error:', e?.message || e);
    res.json({ code: 500, message: '修改失败', data: null });
  }
});

/**
 * DELETE /api/v1/merchant/coupon/:id
 * 删除优惠券
 *   草稿(0)、已驳回(3)、已下架(审计通过+status=0) 可删除
 *   待审核(1) 不可删除
 *   已上架(2+status=1) 不可删除
 *   待下架审核(4) 不可删除
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const existing = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );
    if (!existing) { res.json({ code: 404, message: '优惠券不存在', data: null }); return; }

    if (existing.audit_status === 1) {
      res.json({ code: 400, message: '待审核状态的优惠券不能删除，请等待审核结果', data: null });
      return;
    }
    if (existing.audit_status === 2 && existing.status === 1) {
      res.json({ code: 400, message: '已上架的优惠券不能删除，请先申请下架', data: null });
      return;
    }
    if (existing.audit_status === 4) {
      res.json({ code: 400, message: '待下架审核状态的优惠券不能删除', data: null });
      return;
    }

    await execute(`DELETE FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`, [id, merchantId]);
    res.json({ code: 0, message: '已删除' });
  } catch (e: any) {
    console.error('[MerchantCoupon] delete error:', e?.message || e);
    res.json({ code: 500, message: '删除失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/coupon/list
 * 优惠券列表
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 100, 1), 200);
    const offset = (page - 1) * pageSize;

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE merchant_id = $1`,
      [merchantId]
    );

    const coupons = await query<any>(
      `SELECT * FROM merchant_coupons WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [merchantId, pageSize, offset]
    );

    const mapCoupon = (c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      denominationCents: c.denomination_cents,
      minConsumeCents: c.min_consume_cents || 0,
      totalCount: c.total_count,
      remainCount: c.remain_count,
      couponType: c.coupon_type,
      maxPerUser: c.max_per_user || 1,
      putChannels: (() => { try { return JSON.parse(c.put_channels || '[]'); } catch { return []; } })(),
      status: c.status,
      auditStatus: c.audit_status,
      auditRemark: c.audit_remark || '',
      validStart: c.valid_start ? new Date(c.valid_start).getTime() : null,
      validEnd: c.valid_end ? new Date(c.valid_end).getTime() : null,
      createdAt: new Date(c.created_at).getTime(),
    });

    res.json({
      code: 0,
      data: { list: (coupons || []).map(mapCoupon), total: countRow?.total || 0, page, pageSize },
    });
  } catch (e: any) {
    console.error('[MerchantCoupon] list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/coupon/detail/:id
 */
router.get('/detail/:id', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const c = await queryOne<any>(
      `SELECT * FROM merchant_coupons WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );
    if (!c) { res.json({ code: 404, message: '优惠券不存在', data: null }); return; }

    res.json({
      code: 0,
      data: {
        id: c.id, name: c.name, description: c.description || '',
        denominationCents: c.denomination_cents, minConsumeCents: c.min_consume_cents || 0,
        totalCount: c.total_count, remainCount: c.remain_count,
        couponType: c.coupon_type,
        maxPerUser: c.max_per_user || 1,
        putChannels: (() => { try { return JSON.parse(c.put_channels || '[]'); } catch { return []; } })(),
        status: c.status, auditStatus: c.audit_status, auditRemark: c.audit_remark || '',
        validStart: c.valid_start ? new Date(c.valid_start).getTime() : null,
        validEnd: c.valid_end ? new Date(c.valid_end).getTime() : null,
        createdAt: new Date(c.created_at).getTime(),
      },
    });
  } catch (e: any) {
    console.error('[MerchantCoupon] detail error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/coupon/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const createdRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE merchant_id = $1`, [merchantId]
    );
    const onlineRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons WHERE merchant_id = $1 AND status = 1 AND audit_status = 2`, [merchantId]
    );
    const claimedRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM user_coupons WHERE merchant_id = $1`, [merchantId]
    );
    const verifiedRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM user_coupons WHERE merchant_id = $1 AND status = 2`, [merchantId]
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
