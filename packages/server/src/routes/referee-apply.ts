import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// 裁判申请 & 审核路由 (单数路径 /api/v1/referee)
// ============================================================

/**
 * POST /api/v1/referee/apply
 * 裁判注册申请（从邀请链接）
 * @body name - 姓名
 * @body phone - 手机号
 * @body operatorId - 运营商ID（从URL参数传入）
 */
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { name, phone, operatorId } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ code: 400, message: '请填写姓名和手机号', data: null });
    }
    if (!/^\d{11}$/.test(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });
    }

    // 检查手机号是否已被注册
    const existing = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM referees WHERE phone = ?',
      [phone]
    );
    if (existing) {
      const label = existing.status === 'approved' ? '已通过审核' :
        existing.status === 'pending' ? '正在审核中' : '已被驳回';
      return res.status(400).json({ code: 400, message: `该手机号已有申请（${label}）`, data: null });
    }

    // 创建 users 记录
    const userId = uuidv4();
    const refOpenid = 'ref_apply_' + phone;
    await execute(
      `INSERT INTO users (id, openid, nickname, phone, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'referee', 'active', NOW(), NOW())`,
      [userId, refOpenid, name, phone]
    );

    // 创建 referees 记录
    const refereeId = uuidv4();
    await execute(
      `INSERT INTO referees (id, user_id, name, phone, status, operator_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
      [refereeId, userId, name, phone, operatorId || null]
    );

    return res.status(201).json({
      code: 0,
      message: '注册申请已提交，请等待审核',
      data: { id: refereeId, name, phone, status: 'pending' },
    });
  } catch (error: any) {
    console.error('[Referee] apply error:', error.message);
    return res.status(500).json({ code: 500, message: '提交申请失败', data: null });
  }
});

/**
 * GET /api/v1/referee/applications
 * 运营商查看裁判审核列表
 * @query status - pending | approved | rejected
 * @query page, pageSize
 */
router.get('/applications', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可查看', data: null });
    }

    const {
      status: statusFilter,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    // 运营商只看自己的
    if (role === 'operator') {
      const operatorId = (req.user as any).operatorId || req.user!.userId;
      conditions.push('r.operator_id = ?');
      params.push(operatorId);
    }

    if (statusFilter) {
      conditions.push('r.status = ?');
      params.push(String(statusFilter));
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 总数
    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM referees r ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // 列表
    const list = await query<any>(
      `SELECT r.id, r.name, r.phone, r.status, r.reject_reason,
              r.reviewed_at, r.created_at, r.operator_id,
              o.name as operator_name
       FROM referees r
       LEFT JOIN operators o ON o.id = r.operator_id
       ${whereClause}
       ORDER BY r.status = 'pending' DESC, r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  } catch (error: any) {
    console.error('[Referee] applications error:', error.message);
    return res.status(500).json({ code: 500, message: '获取申请列表失败', data: null });
  }
});

/**
 * POST /api/v1/referee/review
 * 审核裁判申请（通过/拒绝）
 * @body refereeId - 裁判记录ID
 * @body action - 'approve' | 'reject'
 * @body rejectReason - 拒绝原因
 */
router.post('/review', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { refereeId, action, rejectReason } = req.body;
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可审核', data: null });
    }
    if (!refereeId) {
      return res.status(400).json({ code: 400, message: '缺少裁判ID', data: null });
    }
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ code: 400, message: 'action 无效，允许值: approve, reject', data: null });
    }

    const referee = await queryOne<{ id: string; user_id: string; name: string; status: string; operator_id: string }>(
      'SELECT id, user_id, name, status, operator_id FROM referees WHERE id = ?',
      [refereeId]
    );
    if (!referee) {
      return res.status(404).json({ code: 404, message: '裁判申请不存在', data: null });
    }
    if (referee.status !== 'pending') {
      return res.status(400).json({ code: 400, message: `该申请已处理（${referee.status}）`, data: null });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const reviewer = req.user!.userId;
    const reason = action === 'reject' ? (rejectReason || '') : '';

    await execute(
      `UPDATE referees SET status = ?, reject_reason = ?, reviewed_at = NOW(),
       reviewed_by = ?, updated_at = NOW() WHERE id = ?`,
      [newStatus, reason, reviewer, refereeId]
    );

    if (action === 'approve' && referee.user_id) {
      await execute('UPDATE users SET role = "referee" WHERE id = ?', [referee.user_id]);
    }

    const label = action === 'approve' ? '已通过' : '已驳回';
    return res.json({ code: 0, message: `裁判审核${label}`, data: null });
  } catch (error: any) {
    console.error('[Referee] review error:', error.message);
    return res.status(500).json({ code: 500, message: '审核失败', data: null });
  }
});

export default router;
