import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { merchantAuthMiddleware } from './merchant-auth';
const router = Router();

// 所有接口都需要商家认证
router.use(merchantAuthMiddleware);

/**
 * 核心核销逻辑（供 scan / manual 共用）
 */
async function doVerify(
  merchantId: string,
  verifierId: string,
  verifierName: string,
  verifyCode: string,
  verifyType: number
): Promise<{ code: number; message: string; data?: any }> {
  // 查询 user_coupons 通过 verify_code
  const coupon = await queryOpOne<any>(req, 
    `SELECT uc.*, mc.name as mc_name, mc.denomination_cents as mc_denomination,
            mc.coupon_type as mc_coupon_type, mc.discount_percent as mc_discount_percent
     FROM user_coupons uc
     LEFT JOIN merchant_coupons mc ON uc.coupon_id = mc.id
     WHERE uc.verify_code = $1`,
    [verifyCode]
  );

  if (!coupon) {
    return { code: 40020, message: '券不存在或核销码无效' };
  }

  if (coupon.status !== 1) {
    if (coupon.status === 2) {
      return { code: 40021, message: '该券已使用' };
    }
    if (coupon.status === 3) {
      return { code: 40022, message: '该券已过期' };
    }
    return { code: 40021, message: '该券不可用' };
  }

  // 检查有效期
  if (coupon.valid_end && new Date(coupon.valid_end) < new Date()) {
    // 标记为过期
    await executeOp(req, 
      `UPDATE user_coupons SET status = 3, updated_at = NOW() WHERE id = $1`,
      [coupon.id]
    );
    return { code: 40022, message: '该券已过期' };
  }

  // 检查是否属于本商家
  if (coupon.merchant_id !== merchantId) {
    return { code: 40023, message: '非本商家优惠券' };
  }

  // 标记为已使用
  const now = new Date().toISOString();
  await executeOp(req, 
    `UPDATE user_coupons SET status = 2, used_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 1`,
    [coupon.id]
  );

  // 扣减 merchant_coupons.remain_count
  await executeOp(req, 
    `UPDATE merchant_coupons SET remain_count = remain_count - 1, updated_at = NOW()
     WHERE id = $1 AND remain_count > 0`,
    [coupon.coupon_id]
  );

  // 写入核销流水
  const merchantOp = await queryOpOne<{ operator_id: string }>(req, 
    `SELECT operator_id FROM merchants WHERE id = $1`,
    [merchantId]
  );
  const mOpId = merchantOp?.operator_id || '';
  await executeOp(req, 
    `INSERT INTO coupon_verify_log (
      id, user_coupon_id, merchant_id, verifier_id, verifier_name,
      user_id, coupon_name, denomination_cents, verify_type, verify_time, created_at) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, NOW(), NOW(), $10
    )`,
    [
      uuidv4(),
      coupon.id,
      merchantId,
      verifierId,
      verifierName,
      coupon.user_id,
      coupon.name || coupon.mc_name || '',
      coupon.denomination_cents || coupon.mc_denomination || 0,
      verifyType,
      mOpId
    ]
  );

  return {
    code: 0,
    message: '核销成功',
    data: {
      id: coupon.id,
      couponName: coupon.name || '',
      denominationCents: coupon.denomination_cents || 0,
      usedAt: now,
    },
  };
}

/**
 * POST /api/v1/merchant/verify/scan
 * 扫码核销
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const verifierId = req.merchantAdmin!.merchantAdminId;
    const verifierName = req.merchantAdmin!.merchantName;
    const { verifyCode } = req.body;

    if (!verifyCode) {
      res.json({ code: 400, message: '核销码不能为空', data: null });
      return;
    }

    const result = await doVerify(merchantId, verifierId, verifierName, verifyCode, 1);
    if (result.code !== 0) {
      res.json(result);
      return;
    }

    res.json(result);
  } catch (e: any) {
    console.error('[MerchantVerify] scan error:', e?.message || e);
    res.json({ code: 500, message: '核销失败', data: null });
  }
});

/**
 * POST /api/v1/merchant/verify/manual
 * 手动核销（输入券码）
 */
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const verifierId = req.merchantAdmin!.merchantAdminId;
    const verifierName = req.merchantAdmin!.merchantName;
    const { verifyCode } = req.body;

    if (!verifyCode) {
      res.json({ code: 400, message: '核销码不能为空', data: null });
      return;
    }

    const result = await doVerify(merchantId, verifierId, verifierName, verifyCode, 2);
    if (result.code !== 0) {
      res.json(result);
      return;
    }

    res.json(result);
  } catch (e: any) {
    console.error('[MerchantVerify] manual error:', e?.message || e);
    res.json({ code: 500, message: '核销失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/verify/log
 * 核销记录列表
 */
router.get('/log', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const countRow = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM coupon_verify_log WHERE merchant_id = $1`,
      [merchantId]
    );

    const logs = await queryOp<any>(req, 
      `SELECT * FROM coupon_verify_log
       WHERE merchant_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [merchantId, pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: (logs || []).map((l: any) => ({
          id: l.id,
          userCouponId: l.user_coupon_id,
          userId: l.user_id,
          couponName: l.coupon_name || '',
          denominationCents: l.denomination_cents || 0,
          verifyType: l.verify_type,
          verifierName: l.verifier_name || '',
          verifyTime: l.verify_time ? new Date(l.verify_time).getTime() : null,
          createdAt: new Date(l.created_at).getTime(),
        })),
        total: countRow?.total || 0,
        page,
        pageSize,
      },
    });
  } catch (e: any) {
    console.error('[MerchantVerify] log list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/verify/log/:id
 * 核销记录详情
 */
router.get('/log/:id', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const { id } = req.params;

    const log = await queryOpOne<any>(req, 
      `SELECT * FROM coupon_verify_log WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (!log) {
      res.json({ code: 404, message: '核销记录不存在', data: null });
      return;
    }

    res.json({
      code: 0,
      data: {
        id: log.id,
        userCouponId: log.user_coupon_id,
        userId: log.user_id,
        couponName: log.coupon_name || '',
        denominationCents: log.denomination_cents || 0,
        verifyType: log.verify_type,
        verifierId: log.verifier_id,
        verifierName: log.verifier_name || '',
        verifyTime: log.verify_time ? new Date(log.verify_time).getTime() : null,
        createdAt: new Date(log.created_at).getTime(),
      },
    });
  } catch (e: any) {
    console.error('[MerchantVerify] log detail error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/merchant/verify/stats
 * 核销统计数据（今日核销、本月核销、累计核销）
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const merchantId = req.merchantAdmin!.merchantId;
    const now = new Date();
    const todayStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`;
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;

    const todayRow = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM coupon_verify_log
       WHERE merchant_id = $1 AND verify_time >= $2`,
      [merchantId, todayStart]
    );

    const monthRow = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM coupon_verify_log
       WHERE merchant_id = $1 AND verify_time >= $2`,
      [merchantId, monthStart]
    );

    const totalRow = await queryOpOne<{ total: number }>(req, 
      `SELECT COUNT(*) as total FROM coupon_verify_log
       WHERE merchant_id = $1`,
      [merchantId]
    );

    // 今日核销金额
    const todayAmountRow = await queryOpOne<{ total: number }>(req, 
      `SELECT COALESCE(SUM(denomination_cents), 0) as total FROM coupon_verify_log
       WHERE merchant_id = $1 AND verify_time >= $2`,
      [merchantId, todayStart]
    );

    res.json({
      code: 0,
      data: {
        todayCount: todayRow?.total || 0,
        todayAmount: todayAmountRow?.total || 0,
        monthCount: monthRow?.total || 0,
        totalCount: totalRow?.total || 0,
      },
    });
  } catch (e: any) {
    console.error('[MerchantVerify] stats error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

export default router;
