import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// 运营商商家管理相关中间件
// ============================================================
function operatorOnly(req: Request, res: Response, next: Function): void {
  const role = req.user?.role;
  console.log('[operatorOnly] role:', role, 'operatorId:', req.user?.operatorId);
  if (role !== 'operator' && role !== 'admin') {
    console.log('[operatorOnly] BLOCKED - role:', role);
    res.status(403).json({ code: 403, message: '仅运营商可操作', data: null });
    return;
  }
  next();
}

/**
 * 生成随机邀请码
 */
function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * GET /api/v1/operator/merchant/pending
 * 待审核商家列表（运营商本区域的）
 * 注意：如果运营商没有 region 字段关联，则返回所有待审核；有 region 则按区域过滤
 */
router.get('/merchant/pending', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    // 获取运营商信息（看是否有 region 限制）
    const operator = await queryOne<{ region?: string }>(
      `SELECT region FROM operators WHERE id = $1`,
      [operatorId]
    );

    const conditions: string[] = ['m.audit_status = 0'];
    const params: any[] = [];

    // 如果运营商有 region 字段约束，则过滤区域内商家
    if (operator && operator.region) {
      conditions.push('m.region = ?');
      params.push(operator.region);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchants m ${whereClause}`,
      params
    );

    const merchants = await query<any>(
      `SELECT m.*, op.name as operator_name
       FROM merchants m
       LEFT JOIN operators op ON m.operator_id = op.id
       ${whereClause}
       ORDER BY m.created_at ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: (merchants || []).map((m: any) => ({
          id: m.id,
          merchantName: m.merchant_name,
          merchantAddress: m.merchant_address || '',
          contactPhone: m.contact_phone || '',
          logoUrl: m.logo_url || '',
          region: m.region || '',
          longitude: m.longitude || 0,
          latitude: m.latitude || 0,
          businessHours: m.business_hours || '',
          description: m.description || '',
          auditStatus: m.audit_status,
          operatorId: m.operator_id || '',
          operatorName: m.operator_name || '',
          createdAt: m.created_at,
        })),
        total: countRow?.total || 0,
        page,
        pageSize,
      },
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] pending list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/operator/merchant/audit
 * 审核商家（通过/驳回）
 */
router.post('/merchant/audit', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const auditorName = req.user!.operator_name || req.user?.userId || '';
    const { merchantId, auditStatus, auditRemark } = req.body;

    if (!merchantId) {
      res.json({ code: 400, message: '商家ID不能为空', data: null });
      return;
    }

    if (auditStatus !== 1 && auditStatus !== 2) {
      res.json({ code: 400, message: '审核状态无效，只能为通过(1)或驳回(2)', data: null });
      return;
    }

    const existing = await queryOne<any>(
      `SELECT * FROM merchants WHERE id = $1`,
      [merchantId]
    );

    if (!existing) {
      res.json({ code: 404, message: '商家不存在', data: null });
      return;
    }

    if (existing.audit_status !== 0) {
      res.json({ code: 400, message: '该商家已被审核，不能重复审核', data: null });
      return;
    }

    // 审核通过时，自动绑定运营商
    const updates: string[] = [
      `audit_status = $1`,
      `audit_remark = $2`,
      `audit_time = NOW()`,
      `auditor_id = $3`,
      `updated_at = NOW()`,
    ];
    const params: any[] = [auditStatus, auditRemark || '', auditorName];

    // 审核通过时自动绑定运营商
    if (auditStatus === 1) {
      updates.push(`operator_id = $4`);
      params.push(operatorId);
    }

    params.push(merchantId);
    const idx = params.length;

    await execute(
      `UPDATE merchants SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({
      code: 0,
      message: auditStatus === 1 ? '审核通过' : '已驳回',
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] audit error:', e?.message || e);
    res.json({ code: 500, message: '审核操作失败', data: null });
  }
});

/**
 * GET /api/v1/operator/merchant/invite-codes
 * 邀请码列表
 */
router.get('/merchant/invite-codes', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_invite_codes`
    );

    const codes = await query<any>(
      `SELECT ic.*, m.merchant_name
       FROM merchant_invite_codes ic
       LEFT JOIN merchants m ON ic.merchant_id = m.id
       ORDER BY ic.created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: (codes || []).map((c: any) => ({
          id: c.id,
          code: c.code,
          merchantId: c.merchant_id,
          merchantName: c.merchant_name || '',
          used: c.used || 0,
          usedBy: c.used_by || '',
          createdAt: c.created_at,
          usedAt: c.used_at,
        })),
        total: countRow?.total || 0,
        page,
        pageSize,
      },
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] invite codes error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/operator/merchant/invite-code
 * 生成邀请码
 */
router.post('/merchant/invite-code', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.body;

    if (!merchantId) {
      res.json({ code: 400, message: '商家ID不能为空', data: null });
      return;
    }

    // 验证商家存在
    const merchant = await queryOne<any>(
      `SELECT * FROM merchants WHERE id = $1`,
      [merchantId]
    );

    if (!merchant) {
      res.json({ code: 404, message: '商家不存在', data: null });
      return;
    }

    const id = uuidv4();
    const code = generateInviteCode();

    await execute(
      `INSERT INTO merchant_invite_codes (id, code, merchant_id, used, created_at)
       VALUES ($1, $2, $3, 0, NOW())`,
      [id, code, merchantId]
    );

    res.json({
      code: 0,
      data: {
        id,
        code,
        merchantId,
        merchantName: merchant.merchant_name,
      },
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] create invite code error:', e?.message || e);
    res.json({ code: 500, message: '生成失败', data: null });
  }
});

// ============================================================
// 运营商优惠券审核 API
// ============================================================

/**
 * GET /api/v1/operator/merchant/coupon/pending
 * 待审核优惠券列表（该运营商绑定的商家）
 */
router.get('/merchant/coupon/pending', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const auditStatus = req.query.auditStatus as string || '1'; // 默认查待审核(1)

    const conditions: string[] = ['mc.audit_status = ?', 'm.operator_id = ?', 'mc.offline_request = 0'];
    const params: any[] = [parseInt(auditStatus, 10), operatorId];

    const merchantId = req.query.merchantId as string;
    if (merchantId) {
      conditions.push('mc.merchant_id = ?');
      params.push(merchantId);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       ${whereClause}`,
      params
    );

    const coupons = await query<any>(
      `SELECT mc.*, m.merchant_name
       FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       ${whereClause}
       ORDER BY mc.created_at ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: (coupons || []).map((c: any) => ({
          id: c.id,
          merchantId: c.merchant_id,
          merchantName: c.merchant_name || '',
          name: c.name,
          description: c.description || '',
          denominationCents: c.denomination_cents,
          minConsumeCents: c.min_consume_cents || 0,
          totalCount: c.total_count,
          remainCount: c.remain_count,
          couponType: c.coupon_type,
          discountPercent: c.discount_percent || 0,
          maxPerUser: c.max_per_user || 1,
          status: c.status,
          auditStatus: c.audit_status,
          auditRemark: c.audit_remark || '',
          offlineRequest: c.offline_request || 0,
          version: c.version || 1,
          validStart: c.valid_start ? new Date(c.valid_start).getTime() : null,
          validEnd: c.valid_end ? new Date(c.valid_end).getTime() : null,
          createdAt: new Date(c.created_at).getTime(),
        })),
        total: countRow?.total || 0,
        page,
        pageSize,
      },
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] coupon pending error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/operator/merchant/coupon/audit
 * 运营商审核优惠券（通过/驳回）
 */
router.post('/merchant/coupon/audit', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { couponId, auditStatus, auditRemark } = req.body;

    if (!couponId) {
      res.json({ code: 400, message: '优惠券ID不能为空', data: null });
      return;
    }

    // audit_status 新枚举：2=已通过, 3=已驳回
    if (auditStatus !== 2 && auditStatus !== 3) {
      res.json({ code: 400, message: '审核状态无效，只能为通过(2)或驳回(3)', data: null });
      return;
    }

    // 校验：该优惠券的商家是否属于该运营商
    const coupon = await queryOne<any>(
      `SELECT mc.*, m.operator_id
       FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       WHERE mc.id = $1`,
      [couponId]
    );

    if (!coupon) {
      res.json({ code: 404, message: '优惠券不存在', data: null });
      return;
    }

    if (coupon.operator_id !== operatorId) {
      res.json({ code: 403, message: '无权审核非本运营商的优惠券', data: null });
      return;
    }

    // 新枚举：1=待审核, 2=已通过, 3=已驳回
    if (coupon.audit_status === 2) {
      res.json({ code: 400, message: '该优惠券已审核通过', data: null });
      return;
    }

    if (coupon.audit_status === 3 && auditStatus === 3) {
      res.json({ code: 400, message: '该优惠券已被驳回', data: null });
      return;
    }

    const isRejected = auditStatus === 3;
    await execute(
      `UPDATE merchant_coupons SET
        audit_status = $1,
        audit_remark = $2,
        audit_time = NOW(),
        auditor_id = $3,
        op_read = $4,
        updated_at = NOW()
       WHERE id = $5`,
      [auditStatus, auditRemark || '', operatorId, isRejected ? 0 : 1, couponId] // 驳回未读，通过已读
    );

    res.json({
      code: 0,
      message: auditStatus === 2 ? '审核通过' : '已驳回',
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] coupon audit error:', e?.message || e);
    res.json({ code: 500, message: '审核操作失败', data: null });
  }
});

// ============================================================
// 优惠券下架审核 API
// ============================================================

/**
 * GET /api/v1/operator/merchant/coupon/offline-pending
 * 待下架审核列表（audit_status=4）
 */
router.get('/merchant/coupon/offline-pending', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       WHERE mc.audit_status = 1 AND mc.offline_request = 1 AND m.operator_id = $1`,
      [operatorId]
    );

    const coupons = await query<any>(
      `SELECT mc.*, m.merchant_name
       FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       WHERE mc.audit_status = 1 AND mc.offline_request = 1 AND m.operator_id = $1
       ORDER BY mc.updated_at ASC LIMIT $2 OFFSET $3`,
      [operatorId, pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: (coupons || []).map((c: any) => ({
          id: c.id,
          merchantId: c.merchant_id,
          merchantName: c.merchant_name || '',
          name: c.name,
          description: c.description || '',
          denominationCents: c.denomination_cents,
          minConsumeCents: c.min_consume_cents || 0,
          totalCount: c.total_count,
          remainCount: c.remain_count,
          couponType: c.coupon_type,
          discountPercent: c.discount_percent || 0,
          maxPerUser: c.max_per_user || 1,
          status: c.status,
          auditStatus: c.audit_status,
          auditRemark: c.audit_remark || '',
          version: c.version || 1,
          validStart: c.valid_start ? new Date(c.valid_start).getTime() : null,
          validEnd: c.valid_end ? new Date(c.valid_end).getTime() : null,
          createdAt: new Date(c.created_at).getTime(),
        })),
        total: countRow?.total || 0,
        page,
        pageSize,
      },
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] offline pending error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/operator/merchant/coupon/offline-audit
 * 下架审核：同意下架(重置为草稿) 或 驳回(回到已上架)
 */
router.post('/merchant/coupon/offline-audit', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { couponId, approved, auditRemark } = req.body;

    if (!couponId) {
      res.json({ code: 400, message: '优惠券ID不能为空', data: null });
      return;
    }

    const coupon = await queryOne<any>(
      `SELECT mc.*, m.operator_id
       FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       WHERE mc.id = $1`,
      [couponId]
    );

    if (!coupon) {
      res.json({ code: 404, message: '优惠券不存在', data: null });
      return;
    }

    if (coupon.operator_id !== operatorId) {
      res.json({ code: 403, message: '无权审核非本运营商的优惠券', data: null });
      return;
    }

    if (coupon.audit_status !== 1 || coupon.offline_request !== 1) {
      res.json({ code: 400, message: '该优惠券不在待下架审核状态', data: null });
      return;
    }

    if (approved) {
      // 同意下架：status=0(下架), audit_status=2(已通过), offline_request=0
      await execute(
        `UPDATE merchant_coupons SET
          status = 0,
          audit_status = 2,
          offline_request = 0,
          audit_remark = $1,
          audit_time = NOW(),
          auditor_id = $2,
          op_read = 0,
          updated_at = NOW()
         WHERE id = $3`,
        [auditRemark || '运营商同意下架', operatorId, couponId]
      );
    } else {
      // 驳回下架申请：audit_status=3(已驳回), 回到已上架状态
      await execute(
        `UPDATE merchant_coupons SET
          audit_status = 3,
          status = 1,
          offline_request = 0,
          audit_remark = $1,
          audit_time = NOW(),
          auditor_id = $2,
          op_read = 0,
          updated_at = NOW()
         WHERE id = $3`,
        [auditRemark || '下架申请被驳回', operatorId, couponId]
      );
    }

    res.json({
      code: 0,
      message: approved ? '已下架' : '已驳回下架申请',
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] offline audit error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

// ============================================================
// 已驳回列表 + 标记已读
// ============================================================

/**
 * GET /api/v1/operator/merchant/coupon/rejected
 * 已驳回优惠券列表（audit_status=3），含未读标记
 */
router.get('/merchant/coupon/rejected', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       WHERE mc.audit_status = 3 AND m.operator_id = $1`,
      [operatorId]
    );

    const countRowUnread = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       WHERE mc.audit_status = 3 AND m.operator_id = $1 AND mc.op_read = 0`,
      [operatorId]
    );

    const coupons = await query<any>(
      `SELECT mc.*, m.merchant_name
       FROM merchant_coupons mc
       LEFT JOIN merchants m ON mc.merchant_id = m.id
       WHERE mc.audit_status = 3 AND m.operator_id = $1
       ORDER BY mc.updated_at DESC LIMIT $2 OFFSET $3`,
      [operatorId, pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: (coupons || []).map((c: any) => ({
          id: c.id,
          merchantId: c.merchant_id,
          merchantName: c.merchant_name || '',
          name: c.name,
          description: c.description || '',
          denominationCents: c.denomination_cents,
          minConsumeCents: c.min_consume_cents || 0,
          totalCount: c.total_count,
          remainCount: c.remain_count,
          couponType: c.coupon_type,
          discountPercent: c.discount_percent || 0,
          maxPerUser: c.max_per_user || 1,
          status: c.status,
          auditStatus: c.audit_status,
          auditRemark: c.audit_remark || '',
          opRead: c.op_read || 0,
          rejectType: (c.audit_remark || '').indexOf('下架') >= 0 ? 'offline' : 'audit',
          version: c.version || 1,
          validStart: c.valid_start ? new Date(c.valid_start).getTime() : null,
          validEnd: c.valid_end ? new Date(c.valid_end).getTime() : null,
          createdAt: new Date(c.created_at).getTime(),
        })),
        total: countRow?.total || 0,
        unreadCount: countRowUnread?.total || 0,
        page,
        pageSize,
      },
    });
  } catch (e: any) {
    console.error('[OperatorMerchant] rejected list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/operator/merchant/coupon/rejected/read
 * 标记已驳回优惠券为已读
 */
router.post('/merchant/coupon/rejected/read', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { couponId } = req.body;

    if (!couponId) {
      res.json({ code: 400, message: '优惠券ID不能为空', data: null });
      return;
    }

    await execute(
      `UPDATE merchant_coupons SET op_read = 1 WHERE id = $1`,
      [couponId]
    );

    res.json({ code: 0, message: '已标记已读' });
  } catch (e: any) {
    console.error('[OperatorMerchant] rejected read error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

export default router;
