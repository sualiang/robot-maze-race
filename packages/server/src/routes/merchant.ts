import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * GET /api/v1/player/coupons
 * 获取玩家卡包列表
 * querystring: status=1(未使用) / 2(已使用) / 3(已过期)
 */
router.get('/coupons', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const status = parseInt(req.query.status as string, 10) || 1; // 默认查未使用

  try {
    const coupons = await query<any>(
      `SELECT uc.id, uc.coupon_id, uc.merchant_id, uc.name, uc.description,
              uc.denomination_cents, uc.min_consume_cents, uc.status,
              uc.used_at, uc.valid_start, uc.valid_end, uc.created_at,
              uc.coupon_type, uc.discount_percent, uc.verify_code,
              m.merchant_name, m.logo_url
       FROM user_coupons uc
       LEFT JOIN merchants m ON uc.merchant_id = m.id
       WHERE uc.user_id = $1 AND uc.status = $2
       ORDER BY uc.created_at DESC
       LIMIT 50`,
      [userId, status]
    );

    res.json({
      code: 0,
      data: {
        list: (coupons || []).map((c: any) => ({
          id: c.id,
          couponId: c.coupon_id,
          merchantId: c.merchant_id,
          merchantName: c.merchant_name || '',
          merchantLogo: c.logo_url || '',
          name: c.name || '',
          description: c.description || '',
          denominationCents: c.denomination_cents || 0,
          minConsumeCents: c.min_consume_cents || 0,
          couponType: c.coupon_type || 1,
          discountPercent: c.discount_percent || 0,
          verifyCode: c.verify_code || '',
          status: c.status,
          usedAt: c.used_at ? new Date(c.used_at).getTime() : null,
          validStart: c.valid_start ? new Date(c.valid_start).getTime() : null,
          validEnd: c.valid_end ? new Date(c.valid_end).getTime() : null,
          createdAt: new Date(c.created_at).getTime(),
        })),
        total: coupons?.length || 0,
      }
    });
  } catch (e: any) {
    console.error('[商家] 查询优惠券列表失败:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/coupon/use
 * 使用优惠券
 */
router.post('/coupon/use', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { couponId } = req.body;

  if (!couponId) {
    res.json({ code: 400, message: '缺少优惠券ID', data: null });
    return;
  }

  try {
    // 查询优惠券
    const coupon = await queryOne<any>(
      `SELECT * FROM user_coupons WHERE id = $1 AND user_id = $2`,
      [couponId, userId]
    );

    if (!coupon) {
      res.json({ code: 404, message: '优惠券不存在', data: null });
      return;
    }

    if (coupon.status !== 1) {
      res.json({ code: 400, message: '优惠券已使用或已过期', data: null });
      return;
    }

    // 检查有效期
    if (coupon.valid_end && new Date(coupon.valid_end) < new Date()) {
      await execute(
        `UPDATE user_coupons SET status = 3, updated_at = NOW() WHERE id = $1`,
        [couponId]
      );
      res.json({ code: 400, message: '优惠券已过期', data: null });
      return;
    }

    // 标记为已使用
    await execute(
      `UPDATE user_coupons SET status = 2, used_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 1`,
      [couponId]
    );

    // 扣减商家优惠券库存
    await execute(
      `UPDATE merchant_coupons SET remain_count = remain_count - 1 WHERE id = $1 AND remain_count > 0`,
      [coupon.coupon_id]
    );

    res.json({
      code: 0,
      data: {
        id: coupon.id,
        couponId: coupon.coupon_id,
        name: coupon.name || '',
        denominationCents: coupon.denomination_cents || 0,
        usedAt: Date.now(),
      }
    });
  } catch (e: any) {
    console.error('[商家] 使用优惠券失败:', e?.message || e);
    res.json({ code: 500, message: '使用失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/list
 * 获取商家列表（玩家端）
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const merchants = await query<any>(
      `SELECT id, merchant_name, merchant_address, longitude, latitude,
              contact_phone, logo_url, region, business_hours, qrcode_url
       FROM merchants
       WHERE status = 1 AND audit_status = 1
       ORDER BY created_at DESC`
    );

    res.json({
      code: 0,
      data: (merchants || []).map((m: any) => ({
        id: m.id,
        merchantName: m.merchant_name || '',
        merchantAddress: m.merchant_address || '',
        longitude: m.longitude || 0,
        latitude: m.latitude || 0,
        contactPhone: m.contact_phone || '',
        logoUrl: m.logo_url || '',
        region: m.region || '',
        businessHours: m.business_hours || '',
        qrcodeUrl: m.qrcode_url || '',
      })),
    });
  } catch (e: any) {
    console.error('[商家] 查询商家列表失败:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/detail/:id
 * 获取商家详情（玩家端）
 */
router.get('/detail/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchant = await queryOne<any>(
      `SELECT id, merchant_name, merchant_address, longitude, latitude,
              contact_phone, logo_url, region, business_hours, qrcode_url
       FROM merchants
       WHERE id = $1 AND status = 1 AND audit_status = 1`,
      [id]
    );

    if (!merchant) {
      res.json({ code: 404, message: '商家不存在', data: null });
      return;
    }

    res.json({
      code: 0,
      data: {
        id: merchant.id,
        merchantName: merchant.merchant_name || '',
        merchantAddress: merchant.merchant_address || '',
        longitude: merchant.longitude || 0,
        latitude: merchant.latitude || 0,
        contactPhone: merchant.contact_phone || '',
        logoUrl: merchant.logo_url || '',
        region: merchant.region || '',
        businessHours: merchant.business_hours || '',
        qrcodeUrl: merchant.qrcode_url || '',
      },
    });
  } catch (e: any) {
    console.error('[商家] 查询商家详情失败:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

// TODO: 积分抽奖发放商家券时，需在 doDraw 中生成 verify_code
// 并在 user_coupons 插入记录时带上 verify_code

export default router;
