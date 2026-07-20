import { Router, Request, Response } from 'express';
import { query, queryOne, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// Operator Finance 路由 - 运营商财务(需要 operator 角色)
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
 * 根路径,等同 /summary
 */
router.get('/', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const operator = await queryOne<{
      id: string; name: string; company_name: string | null;
      profit_share_rate: number; total_revenue: number;
    }>(
      `SELECT id, name, company_name, profit_share_rate, total_revenue
       FROM operators WHERE id = $1`,
      [operatorId]
    );
    const venueCount = await queryOpOne<{ count: string }>(req,
      'SELECT COUNT(*) as count FROM venues WHERE operator_id = $1',
      [operatorId]
    );
    const settlementStats = await queryOpOne<{
      total_amount_cents: number; total_commission_cents: number;
      total_points_deduction_cents: number;
      total_settled_cents: number; total_pending_cents: number;
      settled_count: number; pending_count: number;
    }>(req,
      `SELECT
         COALESCE(SUM(amount_cents), 0) as total_amount_cents,
         COALESCE(SUM(commission_cents), 0) as total_commission_cents,
         COALESCE(SUM(points_deduction_cents), 0) as total_points_deduction_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN amount_cents ELSE 0 END), 0) as total_settled_cents,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) as total_pending_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END), 0) as settled_count,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count
       FROM settlements WHERE operator_id = $1`,
      [operatorId]
    );

    // 从 orders 表取实时统计（今日/本月营收+订单数）—— settlements 表可能为空
    const orderStats = await queryOpOne<{
      today_revenue: string; month_revenue: string;
      today_orders: string; month_orders: string; month_points: string;
    }>(req,
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(paid_at) = CURDATE() THEN amount_cents ELSE 0 END), 0) as today_revenue,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN amount_cents ELSE 0 END), 0) as month_revenue,
         COALESCE(SUM(CASE WHEN DATE(paid_at) = CURDATE() THEN 1 ELSE 0 END), 0) as today_orders,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN 1 ELSE 0 END), 0) as month_orders,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN points_deduction_cents ELSE 0 END), 0) as month_points
       FROM orders WHERE operator_id = $1 AND status = 'paid'`,
      [operatorId]
    );

    const netIncome = (settlementStats?.total_amount_cents || 0) - (settlementStats?.total_commission_cents || 0);

    return res.json({
      code: 0, message: 'ok',
      data: {
        operator: operator || null,
        venue_count: parseInt(venueCount?.count || '0', 10),
        orders: {
          today_revenue_cents: parseInt(orderStats?.today_revenue || '0', 10),
          month_revenue_cents: parseInt(orderStats?.month_revenue || '0', 10),
          today_orders: parseInt(orderStats?.today_orders || '0', 10),
          month_orders: parseInt(orderStats?.month_orders || '0', 10),
          month_points_deduction_cents: parseInt(orderStats?.month_points || '0', 10),
        },
        settlements: {
          total_amount_cents: settlementStats?.total_amount_cents || 0,
          total_commission_cents: settlementStats?.total_commission_cents || 0,
          net_income_cents: netIncome,
          settled_amount_cents: settlementStats?.total_settled_cents || 0,
          pending_amount_cents: settlementStats?.total_pending_cents || 0,
          settled_count: settlementStats?.settled_count || 0,
          pending_count: settlementStats?.pending_count || 0,
          total_points_deduction_cents: settlementStats?.total_points_deduction_cents || 0,
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
    const operatorId = req.user!.operatorId;

    const operator = await queryOne<{
      id: string; name: string; company_name: string | null;
      profit_share_rate: number; total_revenue: number;
    }>(
      `SELECT id, name, company_name, profit_share_rate, total_revenue
       FROM operators WHERE id = $1`,
      [operatorId]
    );

    const venueCount = await queryOpOne<{ count: string }>(req,
      'SELECT COUNT(*) as count FROM venues WHERE operator_id = $1',
      [operatorId]
    );

    const settlementStats = await queryOpOne<{
      total_amount_cents: number; total_commission_cents: number;
      total_points_deduction_cents: number;
      total_settled_cents: number; total_pending_cents: number;
      settled_count: number; pending_count: number;
    }>(req,
      `SELECT
         COALESCE(SUM(amount_cents), 0) as total_amount_cents,
         COALESCE(SUM(commission_cents), 0) as total_commission_cents,
         COALESCE(SUM(points_deduction_cents), 0) as total_points_deduction_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN amount_cents ELSE 0 END), 0) as total_settled_cents,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) as total_pending_cents,
         COALESCE(SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END), 0) as settled_count,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count
       FROM settlements WHERE operator_id = $1`,
      [operatorId]
    );

    // 从 orders 表取实时统计（今日/本月营收+订单数）—— settlements 表可能为空
    const orderStats = await queryOpOne<{
      today_revenue: string; month_revenue: string;
      today_orders: string; month_orders: string; month_points: string;
    }>(req,
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(paid_at) = CURDATE() THEN amount_cents ELSE 0 END), 0) as today_revenue,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN amount_cents ELSE 0 END), 0) as month_revenue,
         COALESCE(SUM(CASE WHEN DATE(paid_at) = CURDATE() THEN 1 ELSE 0 END), 0) as today_orders,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN 1 ELSE 0 END), 0) as month_orders,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN points_deduction_cents ELSE 0 END), 0) as month_points
       FROM orders WHERE operator_id = $1 AND status = 'paid'`,
      [operatorId]
    );

    const netIncome = (settlementStats?.total_amount_cents || 0) - (settlementStats?.total_commission_cents || 0);

    return res.json({
      code: 0, message: 'ok',
      data: {
        operator: operator || null,
        venue_count: parseInt(venueCount?.count || '0', 10),
        orders: {
          today_revenue_cents: parseInt(orderStats?.today_revenue || '0', 10),
          month_revenue_cents: parseInt(orderStats?.month_revenue || '0', 10),
          today_orders: parseInt(orderStats?.today_orders || '0', 10),
          month_orders: parseInt(orderStats?.month_orders || '0', 10),
          month_points_deduction_cents: parseInt(orderStats?.month_points || '0', 10),
        },
        settlements: {
          total_amount_cents: settlementStats?.total_amount_cents || 0,
          total_commission_cents: settlementStats?.total_commission_cents || 0,
          net_income_cents: netIncome,
          settled_amount_cents: settlementStats?.total_settled_cents || 0,
          pending_amount_cents: settlementStats?.total_pending_cents || 0,
          settled_count: settlementStats?.settled_count || 0,
          pending_count: settlementStats?.pending_count || 0,
          total_points_deduction_cents: settlementStats?.total_points_deduction_cents || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('[OperatorFinance] summary error:', error.message);
    return res.status(500).json({ code: 500, message: '获取财务汇总失败', data: null });
  }
});

/**
 * GET /api/v1/operator/finance/revenue-details
 * 按日期分组的营收明细(含订单详情、积分抵扣)
 */
router.get('/revenue-details', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const startDate = (req.query.startDate as string) || '';
    const endDate = (req.query.endDate as string) || '';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

    let dateFilter = '';
    const params: any[] = [operatorId];
    if (startDate && endDate) {
      dateFilter = `AND o.paid_at >= $2 AND o.paid_at < $3`;
      params.push(startDate, endDate + ' 23:59:59');
    }

    // 按日期汇总:日期, 订单数, 总营收, 总积分抵扣
    const dailyRows = await queryOp<any>(req,
      `SELECT
         DATE_FORMAT(o.paid_at, '%Y-%m-%d') as date,
         COUNT(*) as order_count,
         COALESCE(SUM(o.amount_cents), 0) as total_revenue,
         COALESCE(SUM(o.points_deduction_cents), 0) as total_points_deducted
       FROM orders o
       WHERE o.operator_id = $1
         AND o.status = 'paid'
         ${dateFilter}
       GROUP BY DATE_FORMAT(o.paid_at, '%Y-%m-%d')
       ORDER BY DATE_FORMAT(o.paid_at, '%Y-%m-%d') ${sortOrder}`,
      params
    );

    // 每个日期的订单列表(含积分抵扣详情)
    const result = await Promise.all((dailyRows || []).map(async (day: any) => {
      const orderRows = await queryOp<any>(req,
        `SELECT o.id, o.order_no, o.amount_cents, o.discount_cents,
                o.points_deduction_cents, DATE_FORMAT(o.paid_at, '%Y-%m-%d %H:%i:%s') as paid_at, o.package_id
         FROM orders o
         WHERE o.operator_id = $1
           AND DATE_FORMAT(o.paid_at, '%Y-%m-%d') = $2
           AND o.status = 'paid'
         ORDER BY o.paid_at DESC`,
        [operatorId, day.date]
      );

      const orders = (orderRows || []).map((o: any) => ({
        id: o.id,
        orderNo: o.order_no,
        amountCents: o.amount_cents || 0,
        discountCents: o.discount_cents || 0,
        pointsDeducted: o.points_deduction_cents || 0, // 金额分
        paidAt: o.paid_at,
        packageId: o.package_id,
      }));

      return {
        date: day.date,
        orderCount: parseInt(day.order_count, 10) || 0,
        revenue: day.total_revenue || 0,
        discount: day.total_discount || 0,
        pointsDeducted: day.total_points_deducted || 0,
        orders,
      };
    }));

    return res.json({ code: 0, message: 'ok', data: result });
  } catch (error: any) {
    console.error('[OperatorFinance] revenue-details error:', error.message);
    return res.status(500).json({ code: 500, message: '获取营收明细失败', data: null });
  }
});

/**
 * GET /api/v1/operator/finance/export
 * 导出财务流水 CSV
 */
router.get('/export', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const rows = await queryOp<any>(req,
      `SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') as created_at, o.order_no, o.amount_cents, o.discount_cents,
              o.points_deduction_cents, o.status, DATE_FORMAT(o.paid_at, '%Y-%m-%d %H:%i:%s') as paid_at
       FROM orders o
       WHERE o.operator_id = $1
       ORDER BY o.created_at DESC`,
      [operatorId]
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=finance.csv');
    res.write('\uFEFF'); // BOM for Excel
    res.write('日期,订单号,金额(元),积分抵扣(元),状态,支付时间\n');
    for (const r of rows) {
      const amount = ((r.amount_cents || 0) / 100).toFixed(2);
      const pointsDeducted = ((r.points_deduction_cents || 0) / 100).toFixed(2);
      const status = r.status || '';
      const paidAt = r.paid_at || '';
      res.write(`${r.created_at},${r.order_no || ''},${amount},${pointsDeducted},${status},${paidAt}\n`);
    }
    res.end();
  } catch (error: any) {
    console.error('[OperatorFinance] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

export default router;
