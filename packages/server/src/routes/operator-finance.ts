import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// Operator Finance 路由 — 运营商财务（需要 operator 角色）
// ============================================================

function operatorOnly(req: Request, res: Response, next: Function): void {
  if (req.user?.role !== 'operator' && req.user?.role !== 'admin') {
    res.status(403).json({ code: 403, message: '仅运营商可操作', data: null });
    return;
  }
  next();
}

/**
 * GET /api/v1/operator/finance/summary
 * 获取当前运营商财务汇总
 * 从 venues 表拼接 operator_id 信息，用 settlements 表统计数据
 */
router.get('/summary', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.userId;

    // 获取运营商基本信息
    const operator = await queryOne<{
      id: string;
      name: string;
      company_name: string | null;
      profit_share_rate: number;
      total_revenue: number;
    }>(
      `SELECT id, name, company_name, profit_share_rate, total_revenue
       FROM operators WHERE id = $1`,
      [operatorId]
    );

    // 获取关联的赛场数
    const venueCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM venues WHERE operator_id = $1',
      [operatorId]
    );

    // 从 settlements 表统计
    const settlementStats = await queryOne<{
      total_amount_cents: number;
      total_commission_cents: number;
      total_settled_cents: number;
      total_pending_cents: number;
      settled_count: number;
      pending_count: number;
    }>(
      `SELECT
         COALESCE(SUM(amount_cents), 0) as total_amount_cents,
         COALESCE(SUM(commission_cents), 0) as total_commission_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN amount_cents ELSE 0 END), 0) as total_settled_cents,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) as total_pending_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END), 0) as settled_count,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count
       FROM settlements
       WHERE operator_id = $1`,
      [operatorId]
    );

    // 净收入 = 总金额 - 平台佣金
    const netIncome = (settlementStats?.total_amount_cents || 0) - (settlementStats?.total_commission_cents || 0);

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        operator: operator || null,
        venue_count: parseInt(venueCount?.count || '0', 10),
        settlements: {
          total_amount_cents: settlementStats?.total_amount_cents || 0,
          total_commission_cents: settlementStats?.total_commission_cents || 0,
          net_income_cents: netIncome,
          settled_amount_cents: settlementStats?.total_settled_cents || 0,
          pending_amount_cents: settlementStats?.total_pending_cents || 0,
          settled_count: settlementStats?.settled_count || 0,
          pending_count: settlementStats?.pending_count || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('[OperatorFinance] summary error:', error.message);
    return res.status(500).json({ code: 500, message: '获取财务汇总失败', data: null });
  }
});

export default router;
