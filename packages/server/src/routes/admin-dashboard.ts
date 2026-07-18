import { Router, Request, Response } from 'express';
import { query, queryOne, queryOp, queryOpOne, executeOp, getOperatorPool } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();

// ============================================================
// Admin Dashboard 路由 — 仪表盘数据（RBAC 权限控制）
// ============================================================

/**
 * 超管（operatorId=null）遍历所有运营商库执行查询并聚合
 */
async function queryAllOpDash<T = any>(
  req: Request,
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  const opId = (req.user as any)?.operatorId || null;
  if (opId) return queryOp<T>(req, sql, params);
  const opRegs = await query<any>('SELECT db_name FROM operators_registry WHERE db_name IS NOT NULL', []);
  const allRows: T[] = [];
  for (const reg of opRegs) {
    try {
      const pool = getOperatorPool(reg.db_name);
      const [regRows] = await pool.query<any[]>(sql, params);
      allRows.push(...regRows);
    } catch { /* skip */ }
  }
  return allRows;
}

async function queryAllOpDashOne<T = any>(
  req: Request,
  sql: string,
  params: any[] = [],
): Promise<T | null> {
  const opId = (req.user as any)?.operatorId || null;
  if (opId) return queryOpOne<T>(req, sql, params);
  const opRegs = await query<any>('SELECT db_name FROM operators_registry WHERE db_name IS NOT NULL', []);
  for (const reg of opRegs) {
    try {
      const pool = getOperatorPool(reg.db_name);
      const [rows] = await pool.query<any[]>(sql, params);
      if (rows && rows.length > 0) return rows[0] as T;
    } catch { /* skip */ }
  }
  return null;
}

// ============================================================
// GET /api/v1/admin/dashboard
// 仪表盘主页 — dashboard:read
// ============================================================
router.get('/', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    return res.json({ code: 0, message: 'ok', data: { routes: ['/stats', '/revenue-breakdown', '/revenue-by-region', '/top-operators', '/export'] } });
  } catch (error: any) {
    return res.status(500).json({ code: 500, message: error.message, data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/stats
// 全平台统计总览 — dashboard:read
// ============================================================
router.get('/stats', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    // 全平台营收
    const revenueResult = await queryAllOpDashOne<{ total: string }>(req, 
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE status = 'paid'`
    );
    const totalRevenue = parseInt(revenueResult?.total || '0', 10);

    // 全平台订单数
    const orderResult = await queryAllOpDashOne<{ total: string }>(req, 
      `SELECT COUNT(*) as total FROM orders`
    );
    const totalOrders = parseInt(orderResult?.total || '0', 10);

    // 平台利润（所有结算的 commission 之和）
    const profitResult = await queryAllOpDashOne<{ total: string }>(req, 
      `SELECT COALESCE(SUM(commission_cents), 0) as total FROM settlements WHERE status = 'settled'`
    );
    const platformProfit = parseInt(profitResult?.total || '0', 10);

    // 待审核提现总额
    const pendingResult = await queryAllOpDashOne<{ total: string }>(req, 
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM settlements WHERE status = 'pending'`
    );
    const pendingWithdraw = parseInt(pendingResult?.total || '0', 10);

    // 已提现总额
    const withdrawnResult = await queryAllOpDashOne<{ total: string }>(req, 
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
// 修复: operators 在 common 库，settlements 在 operator 库，分两步查
// ============================================================
router.get('/revenue-breakdown', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    // Step 1: 从所有运营商库查 settlements 聚合
    const settlementRows = await queryAllOpDash<any>(req, 
      `SELECT operator_id,
              SUM(amount_cents) as revenue,
              SUM(commission_cents) as platform_profit,
              SUM(amount_cents - commission_cents) as operator_profit,
              COUNT(id) as order_count
       FROM settlements
       GROUP BY operator_id
       ORDER BY revenue DESC`
    );

    // Step 2: 从 common 库查 operators 名称
    if (settlementRows.length === 0) {
      return res.json({ code: 0, message: 'ok', data: { list: [] } });
    }

    const opIds = [...new Set(settlementRows.map((r: any) => r.operator_id))];
    const placeholders = opIds.map((_, i) => '$' + (i + 1)).join(',');
    const ops = await query<any>(
      `SELECT id, name FROM operators WHERE id IN (${placeholders})`,
      opIds
    );
    const opMap = new Map(ops.map((o: any) => [o.id, o.name]));

    const breakdown = settlementRows.map((r: any) => ({
      operator_id: r.operator_id,
      operator_name: opMap.get(r.operator_id) || '未知运营商',
      revenue: parseInt(r.revenue, 10),
      platform_profit: parseInt(r.platform_profit, 10),
      operator_profit: parseInt(r.operator_profit, 10),
      order_count: parseInt(r.order_count, 10),
    }));

    return res.json({ code: 0, message: 'ok', data: { list: breakdown } });
  } catch (error: any) {
    console.error('[AdminDashboard] revenue breakdown error:', error.message);
    return res.status(500).json({ code: 500, message: '获取营收分账明细失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/revenue-by-region
// 按省统计昨日和上月营收 — dashboard:read
// 修复: operators 在 common 库，settlements 在 operator 库
// ============================================================
router.get('/revenue-by-region', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthStart = firstOfLastMonth.toISOString().slice(0, 10);
    const lastMonthEnd = lastOfLastMonth.toISOString().slice(0, 10);

    // Step 1: operator 库查 settlements 按 operator_id 聚合
    const settlementsAgg = await queryAllOpDash<any>(req,
      `SELECT operator_id,
              COALESCE(SUM(CASE WHEN date(created_at) = ? THEN amount_cents ELSE 0 END), 0) as yesterday_revenue,
              COALESCE(SUM(CASE WHEN date(created_at) >= ? AND date(created_at) <= ? THEN amount_cents ELSE 0 END), 0) as last_month_revenue
       FROM settlements
       GROUP BY operator_id`,
      [yesterdayStr, lastMonthStart, lastMonthEnd]
    );

    // Step 2: common 库查 operators 的 province
    const opIds = [...new Set(settlementsAgg.map((r: any) => r.operator_id))];
    if (opIds.length === 0) {
      return res.json({ code: 0, message: 'ok', data: { list: [] } });
    }
    const ph = opIds.map((_, i) => '$' + (i + 1)).join(',');
    const operators = await query<any>(
      `SELECT id, COALESCE(province, '未知') as province FROM operators WHERE id IN (${ph})`,
      opIds
    );
    const opProvinceMap = new Map(operators.map((o: any) => [o.id, o.province]));

    // Step 3: 按 province 聚合
    const provinceMap = new Map<string, { province: string; yesterday_revenue: number; last_month_revenue: number }>();
    for (const r of settlementsAgg) {
      const province = opProvinceMap.get(r.operator_id) || '未知';
      if (!provinceMap.has(province)) {
        provinceMap.set(province, { province, yesterday_revenue: 0, last_month_revenue: 0 });
      }
      const entry = provinceMap.get(province)!;
      entry.yesterday_revenue += parseInt(r.yesterday_revenue, 10);
      entry.last_month_revenue += parseInt(r.last_month_revenue, 10);
    }

    const regions = [...provinceMap.values()].sort((a, b) => b.last_month_revenue - a.last_month_revenue);
    return res.json({ code: 0, message: 'ok', data: { list: regions } });
  } catch (error: any) {
    console.error('[AdminDashboard] revenue-by-region error:', error.message);
    return res.status(500).json({ code: 500, message: '获取区域营收统计失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/revenue-by-province/:province
// 按省内地市统计营收 — dashboard:read
// 修复: operators 在 common，settlements 在 operator
// ============================================================
router.get('/revenue-by-province/:province', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const { province } = req.params;

    // Step 1: common 库查该省下所有 operator_id
    const ops = await query<any>(
      `SELECT id, COALESCE(city, '未知') as city FROM operators WHERE province = ?`,
      [province]
    );
    if (ops.length === 0) {
      return res.json({ code: 0, message: 'ok', data: { list: [] } });
    }
    const opCityMap = new Map(ops.map((o: any) => [o.id, o.city]));

    // Step 2: operator 库查 settlements 聚合
    const opIds = [...new Set(ops.map((o: any) => o.id))];
    const ph = opIds.map(() => '?').join(',');
    const settlementsAgg = await queryAllOpDash<any>(req,
      `SELECT operator_id,
              COALESCE(SUM(amount_cents), 0) as revenue,
              COALESCE(SUM(commission_cents), 0) as platform_profit,
              COUNT(id) as order_count
       FROM settlements
       WHERE operator_id IN (${ph})
       GROUP BY operator_id`,
      opIds
    );
    const opRevenueMap = new Map(settlementsAgg.map((r: any) => [r.operator_id, r]));

    // Step 3: 按 city 聚合
    const cityMap = new Map<string, { city: string; revenue: number; platform_profit: number; order_count: number }>();
    for (const op of ops) {
      const city = opCityMap.get(op.id) || '未知';
      const sr = opRevenueMap.get(op.id);
      if (!cityMap.has(city)) {
        cityMap.set(city, { city, revenue: 0, platform_profit: 0, order_count: 0 });
      }
      const entry = cityMap.get(city)!;
      entry.revenue += sr ? parseInt(sr.revenue, 10) : 0;
      entry.platform_profit += sr ? parseInt(sr.platform_profit, 10) : 0;
      entry.order_count += sr ? parseInt(sr.order_count, 10) : 0;
    }

    const cities = [...cityMap.values()].sort((a, b) => b.revenue - a.revenue);
    return res.json({ code: 0, message: 'ok', data: { list: cities } });
  } catch (error: any) {
    console.error('[AdminDashboard] revenue-by-province error:', error.message);
    return res.status(500).json({ code: 500, message: '获取省市营收统计失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/revenue-by-city/:city
// 按市辖区统计营收 — dashboard:read
// 修复: operators 在 common，settlements 在 operator
// ============================================================
router.get('/revenue-by-city/:city', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const { city } = req.params;

    // Step 1: common 库查该市下所有 operator_id
    const ops = await query<any>(
      `SELECT id, COALESCE(district, '未知') as district FROM operators WHERE city = ?`,
      [city]
    );
    if (ops.length === 0) {
      return res.json({ code: 0, message: 'ok', data: { list: [] } });
    }
    const opDistrictMap = new Map(ops.map((o: any) => [o.id, o.district]));

    // Step 2: operator 库查 settlements
    const opIds = [...new Set(ops.map((o: any) => o.id))];
    const ph = opIds.map(() => '?').join(',');
    const settlementsAgg = await queryAllOpDash<any>(req,
      `SELECT operator_id,
              COALESCE(SUM(amount_cents), 0) as revenue,
              COALESCE(SUM(commission_cents), 0) as platform_profit,
              COUNT(id) as order_count
       FROM settlements
       WHERE operator_id IN (${ph})
       GROUP BY operator_id`,
      opIds
    );
    const opRevenueMap = new Map(settlementsAgg.map((r: any) => [r.operator_id, r]));

    // Step 3: 按 district 聚合
    const districtMap = new Map<string, { district: string; revenue: number; platform_profit: number; order_count: number }>();
    for (const op of ops) {
      const district = opDistrictMap.get(op.id) || '未知';
      const sr = opRevenueMap.get(op.id);
      if (!districtMap.has(district)) {
        districtMap.set(district, { district, revenue: 0, platform_profit: 0, order_count: 0 });
      }
      const entry = districtMap.get(district)!;
      entry.revenue += sr ? parseInt(sr.revenue, 10) : 0;
      entry.platform_profit += sr ? parseInt(sr.platform_profit, 10) : 0;
      entry.order_count += sr ? parseInt(sr.order_count, 10) : 0;
    }

    const districts = [...districtMap.values()].sort((a, b) => b.revenue - a.revenue);
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

    // 运营商基本信息（common 库）
    const operator = await queryOne<any>(
      `SELECT id, name, phone, email, company_name, status,
              venue_count, total_revenue, profit_share_rate,
              bank_account, bank_name, contact_person,
              province, city, district, company_address,
              created_at, updated_at
       FROM operators WHERE id = ?`,
      [operatorId]
    );

    if (!operator) {
      return res.status(404).json({ code: 404, message: '运营商不存在', data: null });
    }

    // 管理的赛场列表（operator 库）
    const venues = await queryAllOpDash<any>(req, 
      `SELECT id, name, address, status, created_at
       FROM venues WHERE operator_id = ?
       ORDER BY created_at DESC`,
      [operatorId]
    );

    // 各赛场营收数据（operator 库，settlements + venues 都在 operator 库）
    const venueRevenue = await queryAllOpDash<any>(req, 
      `SELECT
         v.id as venue_id,
         v.name as venue_name,
         COALESCE(SUM(s.amount_cents), 0) as revenue,
         COALESCE(SUM(s.commission_cents), 0) as platform_profit,
         COALESCE(SUM(s.amount_cents - s.commission_cents), 0) as operator_profit,
         COUNT(s.id) as order_count
       FROM venues v
       LEFT JOIN settlements s ON s.operator_id = ?
       WHERE v.operator_id = ?
       GROUP BY v.id, v.name
       ORDER BY revenue DESC`,
      [operatorId, operatorId]
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
// 修复: operators 在 common，settlements 在 operator
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

    // Step 1: common 库查所有 operators
    const allOps = await query<any>(
      `SELECT id, name, phone, email, company_name,
              status, profit_share_rate, venue_count,
              province, city, district
       FROM operators ORDER BY name`
    );
    if (allOps.length === 0) {
      return res.json({ code: 0, message: 'ok', data: { list: [], total: 0, page, pageSize } });
    }
    const opMap = new Map(allOps.map((o: any) => [o.id, o]));

    // Step 2: operator 库查 settlements 聚合（带日期筛选）
    const settlementsAgg = await queryAllOpDash<any>(req,
      `SELECT operator_id,
              COALESCE(SUM(amount_cents), 0) as total_revenue,
              COALESCE(SUM(commission_cents), 0) as total_platform_profit,
              COUNT(id) as order_count
       FROM settlements
       WHERE date(created_at) >= ? AND date(created_at) <= ?
       GROUP BY operator_id`,
      [dateStart, dateEnd]
    );
    const revMap = new Map(settlementsAgg.map((r: any) => [r.operator_id, r]));

    // Step 3: 合并排序，取 top 100
    const merged = allOps
      .map((op: any) => {
        const rev = revMap.get(op.id) || { total_revenue: 0, total_platform_profit: 0, order_count: 0 };
        const revenue = parseInt(rev.total_revenue, 10);
        // 平台利润: 优先取 settlements.commission_cents, 为0时用 profit_share_rate 计算
        const commissionFromDB = parseInt(rev.total_platform_profit, 10);
        const profitShareRate = parseFloat(op.profit_share_rate) || 0;
        const platformProfit = commissionFromDB > 0
          ? commissionFromDB
          : Math.round(revenue * (1 - profitShareRate));
        return {
          id: op.id,
          name: op.name,
          phone: op.phone,
          email: op.email,
          company_name: op.company_name,
          status: op.status,
          profit_share_rate: profitShareRate,
          venue_count: op.venue_count,
          province: op.province,
          city: op.city,
          district: op.district,
          total_revenue: revenue,
          total_platform_profit: platformProfit,
          order_count: parseInt(rev.order_count, 10),
        };
      })
      .sort((a: any, b: any) => b.total_revenue - a.total_revenue)
      .slice(0, 100);

    const total = merged.length;
    const pagedList = merged.slice(offset, offset + pageSize).map((row: any, i: number) => ({
      ...row,
      rank: offset + i + 1,
    }));

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        list: pagedList,
        total,
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
// GET /api/v1/admin/dashboard/export

// ============================================================
// GET /api/v1/admin/dashboard/operator-orders/:operatorId
// 总部看板 - 查看某运营商订单明细（含积分抵扣），dashboard:read
// ============================================================
router.get('/operator-orders/:operatorId', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const { operatorId } = req.params;
    const {
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
      start_date,
      end_date,
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
    } else {
      const year = now.getFullYear();
      const monthNum = now.getMonth() + 1;
      const monthStr = String(monthNum).padStart(2, '0');
      dateStart = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, monthNum, 0).getDate();
      dateEnd = `${year}-${monthStr}-${lastDay}`;
    }

    // 查询订单
    const countRow = await queryAllOpDashOne<{ count: string }>(req,
      `SELECT COUNT(*) as count FROM orders
       WHERE operator_id = ? AND status = 'paid'
         AND DATE(paid_at) >= ? AND DATE(paid_at) <= ?`,
      [operatorId, dateStart, dateEnd]
    );
    const total = parseInt(countRow?.count || '0', 10);

    const rows = await queryAllOpDash<any>(req,
      `SELECT o.id, o.order_no, o.amount_cents, o.points_deduction_cents,
              o.paid_at, o.status,
              rp.name as package_name
       FROM orders o
       LEFT JOIN race_packages rp ON o.package_id = rp.id
       WHERE o.operator_id = ? AND o.status = 'paid'
         AND DATE(o.paid_at) >= ? AND DATE(o.paid_at) <= ?
       ORDER BY o.paid_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      [operatorId, dateStart, dateEnd]
    );

    // 查运营商名称
    const op = await queryOne<{ name: string; company_name: string | null }>(
      `SELECT name, company_name FROM operators WHERE id = ?`,
      [operatorId]
    );

    const list = (rows || []).map((r: any) => ({
      id: r.id,
      orderNo: r.order_no,
      packageName: r.package_name || '参赛包',
      amountCents: r.amount_cents || 0,
      pointsDeductionCents: r.points_deduction_cents || 0,
      paidAt: r.paid_at,
      status: r.status,
    }));

    return res.json({
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
        operatorName: op?.name || '',
        operatorCompany: op?.company_name || '',
      },
    });
  } catch (error: any) {
    console.error('[AdminDashboard] operator-orders error:', error.message);
    return res.status(500).json({ code: 500, message: '获取运营商订单失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/dashboard/export
// 数据导出（CSV/Excel）— dashboard:read
// ============================================================
router.get('/export', authMiddleware, checkPermission('dashboard:read'), async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'csv';

    // 汇总统计（全部在 operator 库，无跨库问题）
    const revenueRow = await queryAllOpDashOne<{ total: string }>(req,
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE status = 'paid'`
    );
    const orderRow = await queryAllOpDashOne<{ total: string }>(req,
      `SELECT COUNT(*) as total FROM orders`
    );
    const profitRow = await queryAllOpDashOne<{ total: string }>(req,
      `SELECT COALESCE(SUM(commission_cents), 0) as total FROM settlements WHERE status = 'settled'`
    );

    const totalRevenue = parseInt(revenueRow?.total || '0', 10);
    const totalOrders = parseInt(orderRow?.total || '0', 10);
    const platformProfit = parseInt(profitRow?.total || '0', 10);

    if (format === 'csv') {
      const csv = [
        '指标,值',
        `全平台营收(分),${totalRevenue}`,
        `总订单数,${totalOrders}`,
        `平台利润(分),${platformProfit}`,
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="dashboard-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    return res.json({
      code: 0,
      message: 'ok',
      data: { total_revenue: totalRevenue, total_orders: totalOrders, platform_profit: platformProfit },
    });
  } catch (error: any) {
    console.error('[AdminDashboard] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

export default router;
