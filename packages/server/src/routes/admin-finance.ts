import { Router, Request, Response } from 'express';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

// 缓存 operators 名称，避免每次 withdraw 列表都反复查 common 库
let operatorNameCache: Map<string, string> = new Map();
let operatorNameCacheTime = 0;

async function getOperatorName(opId: string): Promise<string> {
  if (Date.now() - operatorNameCacheTime > 300000) {
    operatorNameCache = new Map();
    operatorNameCacheTime = Date.now();
  }
  if (operatorNameCache.has(opId)) return operatorNameCache.get(opId)!;
  try {
    const op = await queryOne<{ name: string }>('SELECT name FROM operators WHERE id = $1', [opId]);
    const name = op?.name || '未知运营商';
    operatorNameCache.set(opId, name);
    return name;
  } catch {
    return '未知运营商';
  }
}

const router = Router();

/**
 * GET /api/v1/admin/finance/withdraws
 * 运营商提现审核 — finance:withdraw
 * 修复: users 在 common 库，settlements 在 operator 库
 */
router.get('/withdraws', authMiddleware, checkPermission('finance:withdraw'), async (req: Request, res: Response) => {
  try {
    const { status: filterStatus } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filterStatus) {
      conditions.push(`s.status = $${params.length + 1}`);
      params.push(filterStatus);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // operator 库查 settlements
    const withdraws = await queryOp<any>(req, 
      `SELECT s.id, s.operator_id,
              s.amount_cents as amount,
              s.status,
              s.created_at as applied_at,
              s.settled_at as processed_at,
              '' as remark
       FROM settlements s
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params.length > 0 ? params : undefined
    );

    // common 库补查运营商名称
    const opIds = [...new Set(withdraws.map((w: any) => w.operator_id).filter(Boolean))];
    const opMap = new Map<string, string>();
    if (opIds.length > 0) {
      const ops = await query<any>(
        `SELECT id, name FROM operators WHERE id IN (${opIds.map((_, i) => '$' + (i + 1)).join(',')})`,
        opIds
      );
      for (const op of ops) {
        opMap.set(op.id, op.name);
      }
    }

    const list = withdraws.map((w: any) => ({
      ...w,
      operator_name: opMap.get(w.operator_id) || '未知运营商',
      bank_account: '',
      bank_name: '',
    }));

    return res.json({ code: 0, message: 'ok', data: { list } });
  } catch (error: any) {
    console.error('[AdminFinance] withdraws list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取提现列表失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/finance/history-withdraws
// 历史提现查询（按时间段筛选，任意状态）— finance:history
// 修复: users 在 common 库
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
      conditions.push(`created_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`created_at <= $${params.length + 1}`);
      params.push(end_date);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 总数（operator 库）
    const countResult = await queryOpOne<{ count: number }>(req, 
      `SELECT COUNT(*) as count FROM settlements s ${whereClause}`,
      params.length > 0 ? params : undefined
    );
    const total = countResult?.count || 0;

    // 分页数据（operator 库）
    const withdraws = await queryOp<any>(req, 
      `SELECT s.id, s.order_id, s.operator_id,
              s.amount_cents as amount,
              s.commission_cents,
              s.status,
              s.created_at as applied_at,
              s.settled_at as processed_at
       FROM settlements s
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    // common 库补查运营商名称
    const opIds = [...new Set(withdraws.map((w: any) => w.operator_id).filter(Boolean))];
    const opMap = new Map<string, any>();
    if (opIds.length > 0) {
      const ops = await query<any>(
        `SELECT id, name, phone FROM operators WHERE id IN (${opIds.map((_, i) => '$' + (i + 1)).join(',')})`,
        opIds
      );
      for (const op of ops) {
        opMap.set(op.id, op);
      }
    }

    const list = withdraws.map((w: any) => {
      const op = opMap.get(w.operator_id) || {};
      return {
        ...w,
        operator_name: op.name || '未知运营商',
        bank_account: '',
        bank_name: '',
      };
    });

    return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
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
      return res.status(400).json({ code: 400, message: '只能审核待处理状态的提现', data: null });
    }

    await executeOp(req, 
      'UPDATE settlements SET status = $1, settled_at = NOW() WHERE id = $2',
      ['approved', id]
    );

    return res.json({ code: 0, message: '提现已批准', data: null });
  } catch (error: any) {
    console.error('[AdminFinance] approve error:', error.message);
    return res.status(500).json({ code: 500, message: '批准提现失败', data: null });
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
      return res.status(400).json({ code: 400, message: '只能审核待处理状态的提现', data: null });
    }

    await executeOp(req, 
      'UPDATE settlements SET status = $1, settled_at = NOW() WHERE id = $2',
      ['rejected', id]
    );

    return res.json({ code: 0, message: '提现已拒绝', data: null });
  } catch (error: any) {
    console.error('[AdminFinance] reject error:', error.message);
    return res.status(500).json({ code: 500, message: '拒绝提现失败', data: null });
  }
});

/**
 * GET /api/v1/admin/finance/withdraw-export
 * 提现审核数据导出 — finance:withdraw
 * 修复: users 在 common 库
 */
router.get('/withdraw-export', authMiddleware, checkPermission('finance:withdraw'), async (req: Request, res: Response) => {
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

    // operator 库查 settlements
    const withdrawals = await queryOp<any>(req, 
      `SELECT s.id, s.operator_id,
              s.amount_cents as amount,
              s.status,
              s.created_at as applied_at,
              s.settled_at as processed_at
       FROM settlements s
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params.length > 0 ? params : undefined
    );

    // common 库补查运营商名称
    const opIds = [...new Set(withdrawals.map((w: any) => w.operator_id).filter(Boolean))];
    const opMap = new Map<string, string>();
    if (opIds.length > 0) {
      const ops = await query<any>(
        `SELECT id, name FROM operators WHERE id IN (${opIds.map((_, i) => '$' + (i + 1)).join(',')})`,
        opIds
      );
      for (const op of ops) {
        opMap.set(op.id, op.name);
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=withdraw-export.csv');

    const header = '运营商名称,提现金额,开户行,银行账号,状态,申请时间,处理时间\n';
    const rows = withdrawals.map((w: any) => {
      const statusMap: Record<string, string> = {
        pending: '待审核', approved: '已通过', rejected: '已拒绝', processed: '已打款',
      };
      return [
        opMap.get(w.operator_id) || '未知运营商',
        (w.amount / 100).toFixed(2),
        '',
        '',
        statusMap[w.status] || w.status,
        w.applied_at || '',
        w.processed_at || '',
      ].join(',') + '\n';
    }).join('');

    res.send('\uFEFF' + header + rows);
  } catch (error: any) {
    console.error('[AdminFinance] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

/**
 * GET /api/v1/admin/finance/orders
 * 平台订单列表 — finance:read
 * 超管(opId=null)遍历所有运营商库汇总，普通运营商走单库
 */
router.get('/orders', authMiddleware, checkPermission('finance:read'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const offset = (page - 1) * pageSize;
    const opId = (req.user as any)?.operatorId || null;

    let rows: any[] = [];
    let total = 0;

    if (opId) {
      // 普通运营商：单个 operator 库
      const countRow = await queryOpOne<{ count: string }>(req, 'SELECT COUNT(*) as count FROM orders WHERE operator_id = ?', [opId]);
      total = parseInt(countRow?.count || '0', 10);
      rows = await queryOp<any>(req,
        'SELECT o.* FROM orders o WHERE o.operator_id = ? ORDER BY o.created_at DESC LIMIT ? OFFSET ?',
        [opId, pageSize, offset]
      );
    } else {
      // 超管：遍历所有运营商库汇总
      const { getOperatorPool } = require('../config/database');
      const opRegs = await query<any>('SELECT db_name, operator_id FROM operators_registry WHERE db_name IS NOT NULL', []);
      const allRows: any[] = [];
      for (const reg of opRegs) {
        try {
          const pool = getOperatorPool(reg.db_name);
          const [regRows] = await pool.query<any[]>('SELECT o.*, ? as _op_id FROM orders o ORDER BY o.created_at DESC', [reg.operator_id]);
          allRows.push(...regRows);
        } catch { /* skip unavailable operator dbs */ }
      }
      total = allRows.length;
      // 内存分页
      allRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      rows = allRows.slice(offset, offset + pageSize);
    }

    // common 库补查 player_profiles nickname
    const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
    const playerMap = new Map<string, string>();
    if (userIds.length > 0) {
      const profiles = await query<any>(
        `SELECT user_id, nickname FROM player_profiles WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      );
      for (const p of profiles) {
        playerMap.set(p.user_id, p.nickname);
      }
    }

    const list = rows.map((r: any) => ({
      ...r,
      nickname: playerMap.get(r.user_id) || '',
    }));

    return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
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

    // common 库补查运营商名称
    const opIds = [...new Set(rows.map((r: any) => r.operator_id).filter(Boolean))];
    const opMap = new Map<string, string>();
    if (opIds.length > 0) {
      const ops = await query<any>(
        `SELECT id, name FROM operators WHERE id IN (${opIds.map((_, i) => '$' + (i + 1)).join(',')})`,
        opIds
      );
      for (const op of ops) {
        opMap.set(op.id, op.name);
      }
    }

    const list = rows.map((r: any) => ({
      ...r,
      operator_name: opMap.get(r.operator_id) || '未知运营商',
    }));

    return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  } catch (error: any) {
    console.error('[AdminFinance] pending error:', error.message);
    return res.status(500).json({ code: 500, message: '获取待处理列表失败', data: null });
  }
});

export default router;
