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
 * GET /api/v1/operator/finance
 * 根路径，等同 /summary
 */
router.get('/', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.userId;
    const operator = await queryOne<{
      id: string; name: string; company_name: string | null;
      profit_share_rate: number; total_revenue: number;
    }>(
      `SELECT id, name, company_name, profit_share_rate, total_revenue
       FROM operators WHERE id = $1`,
      [operatorId]
    );
    const venueCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM venues WHERE operator_id = $1',
      [operatorId]
    );
    const settlementStats = await queryOne<{
      total_amount_cents: number; total_commission_cents: number;
      total_settled_cents: number; total_pending_cents: number;
      settled_count: number; pending_count: number;
    }>(
      `SELECT
         COALESCE(SUM(amount_cents), 0) as total_amount_cents,
         COALESCE(SUM(commission_cents), 0) as total_commission_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN amount_cents ELSE 0 END), 0) as total_settled_cents,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) as total_pending_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END), 0) as settled_count,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count
       FROM settlements WHERE operator_id = $1`,
      [operatorId]
    );
    const netIncome = (settlementStats?.total_amount_cents || 0) - (settlementStats?.total_commission_cents || 0);
    return res.json({
      code: 0, message: 'ok',
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
    console.error('[OperatorFinance] root error:', error.message);
    return res.status(500).json({ code: 500, message: '获取财务汇总失败', data: null });
  }
});

/**
 * GET /api/v1/operator/finance/summary
 * 获取当前运营商财务汇总
 */
router.get('/summary', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.userId;

    const operator = await queryOne<{
      id: string; name: string; company_name: string | null;
      profit_share_rate: number; total_revenue: number;
    }>(
      `SELECT id, name, company_name, profit_share_rate, total_revenue
       FROM operators WHERE id = $1`,
      [operatorId]
    );

    const venueCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM venues WHERE operator_id = $1',
      [operatorId]
    );

    const settlementStats = await queryOne<{
      total_amount_cents: number; total_commission_cents: number;
      total_settled_cents: number; total_pending_cents: number;
      settled_count: number; pending_count: number;
    }>(
      `SELECT
         COALESCE(SUM(amount_cents), 0) as total_amount_cents,
         COALESCE(SUM(commission_cents), 0) as total_commission_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN amount_cents ELSE 0 END), 0) as total_settled_cents,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) as total_pending_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END), 0) as settled_count,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count
       FROM settlements WHERE operator_id = $1`,
      [operatorId]
    );

    const netIncome = (settlementStats?.total_amount_cents || 0) - (settlementStats?.total_commission_cents || 0);

    return res.json({
      code: 0, message: 'ok',
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

/**
 * GET /api/v1/operator/finance/export
 * 导出财务流水 CSV
 */
router.get('/export', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.userId;
    const rows = await query<any>(
      `SELECT s.created_at, s.order_id, s.amount_cents, s.commission_cents,
              s.status, s.settled_at
       FROM settlements s
       WHERE s.operator_id = $1
       ORDER BY s.created_at DESC`,
      [operatorId]
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=finance.csv');
    res.write('\uFEFF'); // BOM for Excel
    res.write('日期,订单ID,金额（元）,佣金（元）,状态,结算时间\n');
    for (const r of rows) {
      const amount = ((r.amount_cents || 0) / 100).toFixed(2);
      const commission = ((r.commission_cents || 0) / 100).toFixed(2);
      const status = r.status || '';
      const settledAt = r.settled_at || '';
      res.write(`${r.created_at},${r.order_id || ''},${amount},${commission},${status},${settledAt}\n`);
    }
    res.end();
  } catch (error: any) {
    console.error('[OperatorFinance] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

export default router;
