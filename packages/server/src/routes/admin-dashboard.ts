import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();

// ============================================================
// Admin Dashboard 路由 — 仪表盘数据（RBAC 权限控制）
// ============================================================

// ============================================================
// GET /api/v1/admin/dashboard/stats
// 全平台统计总览 — dashboard:read
// ============================================================
router.get('/stats', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    // 全平台营收
    const revenueResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE status = 'paid'`
    );
    const totalRevenue = parseInt(revenueResult?.total || '0', 10);

    // 全平台订单数
    const orderResult = await queryOne<{ total: string }>(
      `SELECT COUNT(*) as total FROM orders`
    );
    const totalOrders = parseInt(orderResult?.total || '0', 10);

    // 平台利润（所有结算的 commission 之和）
    const profitResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(commission_cents), 0) as total FROM settlements WHERE status = 'settled'`
    );
    const platformProfit = parseInt(profitResult?.total || '0', 10);

    // 待审核提现总额
    const pendingResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM settlements WHERE status = 'pending'`
    );
    const pendingWithdraw = parseInt(pendingResult?.total || '0', 10);

    // 已提现总额
    const withdrawnResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM settlements WHERE status = 'settled'`
    );
    const totalWithdrawn = parseInt(withdrawnResult?.total || '0', 10);

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        platform_profit: platformProfit,
        pending_withdraw: pendingWithdraw,
        total_withdrawn: totalWithdrawn,
      },
    });
  } catch (error: any) {
    console.error('[AdminDashboard] stats error:', error.message);
    return res.status(500).json({ code: 500, message: '获取统计总览失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/revenue-breakdown
// 各运营商营收分账明细 — dashboard:read
// ============================================================
router.get('/revenue-breakdown', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const breakdown = await query<any>(
      `SELECT
         o.id as operator_id,
         o.name as operator_name,
         COALESCE(SUM(s.amount_cents), 0) as revenue,
         COALESCE(SUM(s.commission_cents), 0) as platform_profit,
         COALESCE(SUM(s.amount_cents - s.commission_cents), 0) as operator_profit,
         COUNT(s.id) as order_count
       FROM operators o
       LEFT JOIN settlements s ON s.operator_id = o.id
       GROUP BY o.id, o.name
       ORDER BY revenue DESC`
    );

    return res.json({ code: 0, message: 'ok', data: { list: breakdown } });
  } catch (error: any) {
    console.error('[AdminDashboard] revenue breakdown error:', error.message);
    return res.status(500).json({ code: 500, message: '获取营收分账明细失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/revenue-by-region
// 按省统计昨日和上月营收 — dashboard:read
// ============================================================
router.get('/revenue-by-region', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    // 昨日日期
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // 上月起始/结束
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthStart = firstOfLastMonth.toISOString().slice(0, 10);
    const lastMonthEnd = lastOfLastMonth.toISOString().slice(0, 10);

    // 按运营商中的省字段分组
    const regions = await query<any>(
      `SELECT
         COALESCE(o.province, '未知') as province,
         COALESCE(SUM(CASE WHEN date(s.created_at) = $1 THEN s.amount_cents ELSE 0 END), 0) as yesterday_revenue,
         COALESCE(SUM(CASE WHEN date(s.created_at) >= $2 AND date(s.created_at) <= $3 THEN s.amount_cents ELSE 0 END), 0) as last_month_revenue
       FROM operators o
       LEFT JOIN settlements s ON s.operator_id = o.id
       GROUP BY o.province
       ORDER BY last_month_revenue DESC`,
      [yesterdayStr, lastMonthStart, lastMonthEnd]
    );

    return res.json({ code: 0, message: 'ok', data: { list: regions } });
  } catch (error: any) {
    console.error('[AdminDashboard] revenue-by-region error:', error.message);
    return res.status(500).json({ code: 500, message: '获取区域营收统计失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/revenue-by-province/:province
// 按省内地市统计营收 — dashboard:read
// ============================================================
router.get('/revenue-by-province/:province', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const { province } = req.params;

    const cities = await query<any>(
      `SELECT
         COALESCE(o.city, '未知') as city,
         COALESCE(SUM(s.amount_cents), 0) as revenue,
         COALESCE(SUM(s.commission_cents), 0) as platform_profit,
         COUNT(s.id) as order_count
       FROM operators o
       LEFT JOIN settlements s ON s.operator_id = o.id
       WHERE o.province = $1
       GROUP BY o.city
       ORDER BY revenue DESC`,
      [province]
    );

    return res.json({ code: 0, message: 'ok', data: { list: cities } });
  } catch (error: any) {
    console.error('[AdminDashboard] revenue-by-province error:', error.message);
    return res.status(500).json({ code: 500, message: '获取省市营收统计失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/revenue-by-city/:city
// 按市辖区统计营收 — dashboard:read
// ============================================================
router.get('/revenue-by-city/:city', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const { city } = req.params;

    const districts = await query<any>(
      `SELECT
         COALESCE(o.district, '未知') as district,
         COALESCE(SUM(s.amount_cents), 0) as revenue,
         COALESCE(SUM(s.commission_cents), 0) as platform_profit,
         COUNT(s.id) as order_count
       FROM operators o
       LEFT JOIN settlements s ON s.operator_id = o.id
       WHERE o.city = $1
       GROUP BY o.district
       ORDER BY revenue DESC`,
      [city]
    );

    return res.json({ code: 0, message: 'ok', data: { list: districts } });
  } catch (error: any) {
    console.error('[AdminDashboard] revenue-by-city error:', error.message);
    return res.status(500).json({ code: 500, message: '获取市辖区营收统计失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/operator-detail/:operatorId
// 运营商详情（含其管理的赛场列表及营收）— dashboard:read
// ============================================================
router.get('/operator-detail/:operatorId', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const { operatorId } = req.params;

    // 运营商基本信息
    const operator = await queryOne<any>(
      `SELECT id, name, phone, email, company_name, status,
              venue_count, total_revenue, profit_share_rate,
              bank_account, bank_name, contact_person,
              province, city, district, company_address,
              created_at, updated_at
       FROM operators WHERE id = $1`,
      [operatorId]
    );

    if (!operator) {
      return res.status(404).json({ code: 404, message: '运营商不存在', data: null });
    }

    // 管理的赛场列表
    const venues = await query<any>(
      `SELECT id, name, address, status, created_at
       FROM venues WHERE operator_id = $1
       ORDER BY created_at DESC`,
      [operatorId]
    );

    // 各赛场营收数据
    const venueRevenue = await query<any>(
      `SELECT
         v.id as venue_id,
         v.name as venue_name,
         COALESCE(SUM(s.amount_cents), 0) as revenue,
         COALESCE(SUM(s.commission_cents), 0) as platform_profit,
         COALESCE(SUM(s.amount_cents - s.commission_cents), 0) as operator_profit,
         COUNT(s.id) as order_count
       FROM venues v
       LEFT JOIN settlements s ON s.operator_id = $1
       WHERE v.operator_id = $1
       GROUP BY v.id, v.name
       ORDER BY revenue DESC`,
      [operatorId]
    );

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        operator,
        venues,
        venue_revenue: venueRevenue,
      },
    });
  } catch (error: any) {
    console.error('[AdminDashboard] operator-detail error:', error.message);
    return res.status(500).json({ code: 500, message: '获取运营商详情失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/top-operators
// 全国前100运营商本月营收排行 — dashboard:list
// ============================================================
router.get('/top-operators', authMiddleware, checkPermission('dashboard:list'), async (req: Request, res: Response) => {
  try {
    const {
      month,
      start_date,
      end_date,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    // 默认本月
    const now = new Date();
    let dateStart: string;
    let dateEnd: string;

    if (start_date && end_date) {
      dateStart = start_date as string;
      dateEnd = end_date as string;
    } else if (month) {
      const [year, mon] = (month as string).split('-');
      const monthNum = parseInt(mon, 10);
      dateStart = `${year}-${mon}-01`;
      const lastDay = new Date(parseInt(year, 10), monthNum, 0).getDate();
      dateEnd = `${year}-${mon}-${lastDay}`;
    } else {
      const year = now.getFullYear();
      const monthNum = now.getMonth() + 1;
      const monthStr = String(monthNum).padStart(2, '0');
      dateStart = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, monthNum, 0).getDate();
      dateEnd = `${year}-${monthStr}-${lastDay}`;
    }

    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT o.id) as count
       FROM operators o
       LEFT JOIN settlements s ON s.operator_id = o.id AND date(s.created_at) >= $1 AND date(s.created_at) <= $2`,
      [dateStart, dateEnd]
    );
    const total = countResult?.count || 0;

    const operators = await query<any>(
      `SELECT
         o.id, o.name, o.phone, o.email, o.company_name,
         o.status, o.profit_share_rate, o.venue_count,
         o.province, o.city, o.district,
         COALESCE(SUM(s.amount_cents), 0) as total_revenue,
         COALESCE(SUM(s.commission_cents), 0) as total_platform_profit,
         COALESCE(COUNT(s.id), 0) as order_count
       FROM operators o
       LEFT JOIN settlements s ON s.operator_id = o.id AND date(s.created_at) >= $1 AND date(s.created_at) <= $2
       GROUP BY o.id
       ORDER BY total_revenue DESC
       LIMIT 100`,
      [dateStart, dateEnd]
    );

    const pagedList = operators.slice(offset, offset + pageSize);

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        list: pagedList,
        total: Math.min(total, 100),
        page,
        pageSize,
        date_start: dateStart,
        date_end: dateEnd,
      },
    });
  } catch (error: any) {
    console.error('[AdminDashboard] top-operators error:', error.message);
    return res.status(500).json({ code: 500, message: '获取运营商排行失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/region-revenue
// 区域营收钻取 — 按运营商省市区三级汇总
// 参数：level=province|city|district|operator
//       province/city/district 筛选条件（基于运营商表字段）
// ============================================================
router.get('/region-revenue', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const { level, province, city, district } = req.query as any;

    if (level === 'province') {
      // 按省份汇总运营商数量 + 营收统计（从 orders 聚合）
      const rows = await query(
        `SELECT
           o.province as name,
           COUNT(*) as operator_count,
           COALESCE(SUM(o.total_revenue), 0) as total_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.province IS NOT NULL AND o.province != '' AND DATE(ord.paid_at) = CURDATE()), 0) as today_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.province IS NOT NULL AND o.province != ''
                        AND DATE_FORMAT(ord.paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')), 0) as month_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.province IS NOT NULL AND o.province != ''
                        AND DATE_FORMAT(ord.paid_at, '%Y-%m') = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m')), 0) as prev_month_revenue_cents
         FROM operators o
         WHERE o.province IS NOT NULL AND o.province != ''
         GROUP BY o.province
         ORDER BY operator_count DESC`
      );
      return res.json({ code: 0, message: 'ok', data: rows || [] });
    }

    if (level === 'city') {
      if (!province) {
        return res.status(400).json({ code: 400, message: '缺少 province 参数', data: null });
      }
      const rows = await query(
        `SELECT
           o.city as name,
           COUNT(*) as operator_count,
           COALESCE(SUM(o.total_revenue), 0) as total_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.city IS NOT NULL AND o.city != '' AND DATE(ord.paid_at) = CURDATE()), 0) as today_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.city IS NOT NULL AND o.city != ''
                        AND DATE_FORMAT(ord.paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')), 0) as month_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.city IS NOT NULL AND o.city != ''
                        AND DATE_FORMAT(ord.paid_at, '%Y-%m') = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m')), 0) as prev_month_revenue_cents
         FROM operators o
         WHERE o.province = $1 AND o.city IS NOT NULL AND o.city != ''
         GROUP BY o.city
         ORDER BY operator_count DESC`,
        [province]
      );
      return res.json({ code: 0, message: 'ok', data: rows || [] });
    }

    if (level === 'district') {
      if (!city) {
        return res.status(400).json({ code: 400, message: '缺少 city 参数', data: null });
      }
      const rows = await query(
        `SELECT
           o.district as name,
           COUNT(*) as operator_count,
           COALESCE(SUM(o.total_revenue), 0) as total_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.district IS NOT NULL AND o.district != '' AND DATE(ord.paid_at) = CURDATE()), 0) as today_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.district IS NOT NULL AND o.district != ''
                        AND DATE_FORMAT(ord.paid_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')), 0) as month_revenue_cents,
           COALESCE((SELECT SUM(ord.amount_cents) FROM orders ord
                      JOIN venues vv ON vv.operator_id = o.id
                      WHERE o.district IS NOT NULL AND o.district != ''
                        AND DATE_FORMAT(ord.paid_at, '%Y-%m') = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m')), 0) as prev_month_revenue_cents
         FROM operators o
         WHERE o.city = $1 AND o.district IS NOT NULL AND o.district != ''
         GROUP BY o.district
         ORDER BY operator_count DESC`,
        [city]
      );
      return res.json({ code: 0, message: 'ok', data: rows || [] });
    }

    if (level === 'operator') {
      if (!district) {
        return res.status(400).json({ code: 400, message: '缺少 district 参数', data: null });
      }
      const rows = await query(
        `SELECT o.id, o.name, o.province, o.city, o.district
         FROM operators o
         WHERE o.district = $1
         ORDER BY o.name`,
        [district]
      );
      return res.json({ code: 0, message: 'ok', data: rows || [] });
    }

    if (level === 'daily') {
      const { operator_id, date_start, date_end } = req.query as any;
      if (!operator_id) {
        return res.status(400).json({ code: 400, message: '缺少 operator_id 参数', data: null });
      }
      // 查询该运营商旗下所有场馆产生的订单（待有订单数据后完善）
      const rows = await query(
        `SELECT DATE(o.used_at) as date, COUNT(*) as order_count,
                COALESCE(SUM(o.amount_cents), 0) as revenue_cents
         FROM orders o
         JOIN venues v ON v.operator_id = o.venue_id
         WHERE v.operator_id = $1
           AND o.used_at >= $2 AND o.used_at <= $3
         GROUP BY DATE(o.used_at)
         ORDER BY date DESC
         LIMIT 100`,
        [operator_id, date_start || '2024-01-01', date_end || '2099-12-31']
      );
      return res.json({ code: 0, message: 'ok', data: rows || [] });
    }

    return res.status(400).json({ code: 400, message: '无效的 level 参数', data: null });
  } catch (error: any) {
    console.error('[AdminDashboard] region-revenue error:', error.message);
    return res.status(500).json({ code: 500, message: '获取区域营收数据失败', data: null });
  }
});

export default router;
