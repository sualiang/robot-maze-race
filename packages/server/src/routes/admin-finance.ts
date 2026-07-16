import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();

// ============================================================
// Admin Finance 路由 — 提现管理（RBAC 权限控制）
// ============================================================

// ============================================================
// GET /api/v1/admin/finance/withdraws
// 提现申请列表 — finance:read
// ============================================================
router.get('/withdraws', authMiddleware, checkPermission('finance:read'), async (req: Request, res: Response) => {
  try {
    const { status: filterStatus, start_date, end_date } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filterStatus === 'pending' || filterStatus === 'approved' || filterStatus === 'rejected' || filterStatus === 'processed') {
      conditions.push(`s.status = $${params.length + 1}`);
      params.push(filterStatus);
    }
    if (start_date && typeof start_date === 'string') {
      conditions.push(`s.created_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date && typeof end_date === 'string') {
      // 加一天构成当天结束
      conditions.push(`s.created_at <= $${params.length + 1}`);
      params.push(end_date);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const withdraws = await queryOp<any>(req, 
      `SELECT s.id, s.operator_id,
              COALESCE(u.nickname, '未知运营商') as operator_name,
              s.amount_cents as amount,
              COALESCE(u.phone, '') as bank_account,
              COALESCE(u.nickname, '') as bank_name,
              s.status,
              s.created_at as applied_at,
              s.settled_at as processed_at,
              '' as remark
       FROM settlements s
       LEFT JOIN users u ON u.id = s.operator_id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params.length > 0 ? params : undefined
    );

    return res.json({ code: 0, message: 'ok', data: { list: withdraws } });
  } catch (error: any) {
    console.error('[AdminFinance] withdraws list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取提现列表失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/finance/history-withdraws
// 历史提现查询（按时间段筛选，任意状态）— finance:history
// ============================================================
router.get('/history-withdraws', authMiddleware, checkPermission('finance:history'), async (req: Request, res: Response) => {
  try {
    const {
      start_date,
      end_date,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push(`s.created_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`s.created_at <= $${params.length + 1}`);
      params.push(end_date);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 总数
    const countResult = await queryOpOne<{ count: number }>(req, 
      `SELECT COUNT(*) as count FROM settlements s ${whereClause}`,
      params.length > 0 ? params : undefined
    );
    const total = countResult?.count || 0;

    // 分页数据
    const withdraws = await queryOp<any>(req, 
      `SELECT s.id, s.order_id, s.operator_id,
              COALESCE(u.nickname, '未知运营商') as operator_name,
              s.amount_cents as amount,
              s.commission_cents,
              COALESCE(u.phone, '') as bank_account,
              COALESCE(u.nickname, '') as bank_name,
              s.status,
              s.created_at as applied_at,
              s.settled_at as processed_at
       FROM settlements s
       LEFT JOIN users u ON u.id = s.operator_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return res.json({ code: 0, message: 'ok', data: { list: withdraws, total, page, pageSize } });
  } catch (error: any) {
    console.error('[AdminFinance] history-withdraws error:', error.message);
    return res.status(500).json({ code: 500, message: '获取历史提现记录失败', data: null });
  }
});

// ============================================================
// POST /api/v1/admin/finance/withdraws/:id/approve
// 批准提现 — finance:withdraw
// ============================================================
router.post('/withdraws/:id/approve', authMiddleware, checkPermission('finance:withdraw'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await queryOpOne<{ id: string; status: string }>(req, 
      'SELECT id, status FROM settlements WHERE id = $1',
      [id]
    );

    if (!existing) {
      return res.status(404).json({ code: 404, message: '提现记录不存在', data: null });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '该提现申请已处理', data: null });
    }

    await executeOp(req, 
      "UPDATE settlements SET status = 'approved', settled_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id]
    );

    return res.json({ code: 0, message: '提现已批准', data: null });
  } catch (error: any) {
    console.error('[AdminFinance] approve withdraw error:', error.message);
    return res.status(500).json({ code: 500, message: '提现批准失败', data: null });
  }
});

// ============================================================
// POST /api/v1/admin/finance/withdraws/:id/reject
// 拒绝提现 — finance:withdraw
// ============================================================
router.post('/withdraws/:id/reject', authMiddleware, checkPermission('finance:withdraw'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await queryOpOne<{ id: string; status: string }>(req, 
      'SELECT id, status FROM settlements WHERE id = $1',
      [id]
    );

    if (!existing) {
      return res.status(404).json({ code: 404, message: '提现记录不存在', data: null });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '该提现申请已处理', data: null });
    }

    await executeOp(req, 
      "UPDATE settlements SET status = 'rejected', settled_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id]
    );

    return res.json({ code: 0, message: '提现已拒绝', data: null });
  } catch (error: any) {
    console.error('[AdminFinance] reject withdraw error:', error.message);
    return res.status(500).json({ code: 500, message: '提现拒绝失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/finance/export
// 导出提现记录为 CSV — finance:read
// ============================================================
router.get('/export', authMiddleware, checkPermission('finance:read'), async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push(`s.created_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`s.created_at <= $${params.length + 1}`);
      params.push(end_date);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const withdrawals = await queryOp<any>(req, 
      `SELECT s.id, s.operator_id,
              COALESCE(u.nickname, '未知运营商') as operator_name,
              s.amount_cents as amount,
              COALESCE(u.phone, '') as bank_account,
              COALESCE(u.nickname, '') as bank_name,
              s.status,
              s.created_at as applied_at,
              s.settled_at as processed_at
       FROM settlements s
       LEFT JOIN users u ON u.id = s.operator_id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params.length > 0 ? params : undefined
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=withdraw-export.csv');

    const header = '运营商名称,提现金额,开户行,银行账号,状态,申请时间,处理时间\n';
    const rows = withdrawals.map((w: any) => {
      const statusMap: Record<string, string> = {
        pending: '待审核', approved: '已通过', rejected: '已拒绝', processed: '已打款',
      };
      return [
        w.operator_name,
        (w.amount / 100).toFixed(2),
        w.bank_name,
        w.bank_account,
        statusMap[w.status] || w.status,
        w.applied_at || '',
        w.processed_at || '',
      ].join(',') + '\n';
    }).join('');

    // BOM for Excel UTF-8
    res.send('\uFEFF' + header + rows);
  } catch (error: any) {
    console.error('[AdminFinance] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

/**
 * GET /api/v1/admin/finance/orders
 * 平台订单列表 — finance:read
 */
router.get('/orders', authMiddleware, checkPermission('finance:read'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const offset = (page - 1) * pageSize;
    const countRow = await queryOpOne<{ count: string }>(req, 'SELECT COUNT(*) as count FROM orders');
    const total = parseInt(countRow?.count || '0', 10);
    const rows = await queryOp<any>(req,
      'SELECT o.*, p.nickname FROM orders o LEFT JOIN player_profiles p ON o.user_id = p.user_id ORDER BY o.created_at DESC LIMIT $1 OFFSET $2',
      [pageSize, offset]
    );
    return res.json({ code: 0, message: 'ok', data: { list: rows, total, page, pageSize } });
  } catch (error: any) {
    console.error('[AdminFinance] orders error:', error.message);
    return res.status(500).json({ code: 500, message: '获取订单列表失败', data: null });
  }
});

/**
 * GET /api/v1/admin/finance/pending
 * 待处理提现列表 — finance:withdraw
 */
router.get('/pending', authMiddleware, checkPermission('finance:withdraw'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const offset = (page - 1) * pageSize;
    const countRow = await queryOpOne<{ count: string }>(req,
      'SELECT COUNT(*) as count FROM settlements WHERE status = $1', ['pending']
    );
    const total = parseInt(countRow?.count || '0', 10);
    const rows = await queryOp<any>(req,
      'SELECT * FROM settlements WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      ['pending', pageSize, offset]
    );
    return res.json({ code: 0, message: 'ok', data: { list: rows, total, page, pageSize } });
  } catch (error: any) {
    console.error('[AdminFinance] pending error:', error.message);
    return res.status(500).json({ code: 500, message: '获取待处理列表失败', data: null });
  }
});

export default router;
