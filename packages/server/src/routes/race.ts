import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authMiddleware, AuthPayload } from '../middleware/auth';

const router = Router();

// ============================================================
// Race 路由 — 运营商赛事管理（需 operator/admin 角色）
// ============================================================

function operatorOnly(req: Request, res: Response, next: Function): void {
  if (req.user?.role !== 'operator' && req.user?.role !== 'admin') {
    res.status(403).json({ code: 403, message: '仅运营商可操作', data: null });
    return;
  }
  next();
}

/**
 * POST /api/v1/operator/races
 * 运营商创建赛事
 * @body venueId - 场馆 ID（必填）
 * @body name - 赛事名称
 * @body maxParticipants - 最大参赛人数
 * @body startTime - 开始时间
 * @body endTime - 结束时间
 * @body entryFee - 报名费（分）
 */
router.post('/races', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { venueId, name, maxParticipants, startTime, endTime, entryFee, venueName } = req.body;
    const operatorId = req.user?.operatorId || null;

    if (!venueId || !name) {
      return res.status(400).json({ code: 400, message: '缺少必填参数（venueId, name）', data: null });
    }

    // 验证场馆属于该运营商
    const venue = await queryOne<{ id: string; operator_id: string }>(
      'SELECT id, operator_id FROM venues WHERE id = $1',
      [venueId]
    );
    if (!venue) {
      return res.status(404).json({ code: 404, message: '场馆不存在', data: null });
    }
    if (venue.operator_id !== req.user?.operatorId) {
      return res.status(403).json({ code: 403, message: '无权操作该场馆', data: null });
    }

    const raceId = require('uuid').v4();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO races (id, venue_id, name, status, max_participants, entry_fee, start_time, end_time, venue_name, operator_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        raceId, venueId, name, 'pending',
        maxParticipants || 20,
        entryFee || 0,
        startTime || now,
        endTime || now,
        venueName || null,
        operatorId || null,
        now, now
      ]
    );

    return res.json({
      code: 0,
      message: '赛事创建成功',
      data: { id: raceId, name },
    });
  } catch (error: any) {
    console.error('[Operator] race create error:', error.message);
    return res.status(500).json({ code: 500, message: '创建赛事失败', data: null });
  }
});

/**
 * GET /api/v1/operator/races
 * 运营商赛事列表（按场馆筛选）
 * @query venueId - 场馆 ID（必填）
 * @query status - 筛选状态
 * @query page - 页码
 * @query pageSize - 每页数量
 */
router.get('/races', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const venueId = req.query.venueId as string;

    if (!venueId) {
      return res.status(400).json({ code: 400, message: '缺少场馆 ID', data: null });
    }

    const status = req.query.status as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['venue_id = $1'];
    const params: any[] = [venueId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM races ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    const rows = await query<any>(
      `SELECT id, name, status, start_time, end_time,
              created_at, updated_at
       FROM races ${whereClause}
       ORDER BY start_time DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset]
    );

    const list = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      startTime: r.start_time,
    }));

    return res.json({
      code: 0,
      message: 'ok',
      data: { list, total, page, pageSize },
    });
  } catch (error: any) {
    console.error('[Operator] races list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取赛事列表失败', data: { list: [], total: 0 } });
  }
});

/**
 * GET /api/v1/operator/races/:id
 * 赛事详情
 */
router.get('/races/:id', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const race = await queryOne<any>(
      `SELECT id, name, status, start_time, end_time
       FROM races WHERE id = $1`,
      [id]
    );

    if (!race) {
      return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    }

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        race: {
          id: race.id,
          name: race.name,
          status: race.status,
          startTime: race.start_time,
        },
      },
    });
  } catch (error: any) {
    console.error('[Operator] race detail error:', error.message);
    return res.status(500).json({ code: 500, message: '获取赛事详情失败', data: null });
  }
});

/**
 * GET /api/v1/operator/races/:id/players
 * 赛事参赛选手列表
 */
router.get('/races/:id/players', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const raceId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    // 检查赛事是否存在
    const race = await queryOne<{ id: string }>(
      'SELECT id FROM races WHERE id = $1',
      [raceId]
    );
    if (!race) {
      return res.status(404).json({ code: 404, message: '赛事不存在', data: { list: [], total: 0 } });
    }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM race_records WHERE race_id = $1`,
      [raceId]
    );
    const total = parseInt(countResult?.count || '0', 10);

    const rows = await query<any>(
      `SELECT rr.id, rr.user_id, rr.score_ms, rr.rank, rr.status, rr.finished,
              u.nickname, u.avatar_url
       FROM race_records rr
       LEFT JOIN users u ON rr.user_id = u.id
       WHERE rr.race_id = $1
       ORDER BY rr.rank ASC NULLS LAST, rr.score_ms ASC
       LIMIT $2 OFFSET $3`,
      [raceId, pageSize, offset]
    );

    const list = rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      nickname: r.nickname,
      score: r.score_ms || 0,
      rank: r.rank || 0,
      finished: r.finished === 1 || r.finished === true,
      status: r.status,
    }));

    return res.json({
      code: 0,
      message: 'ok',
      data: { list, total, page, pageSize },
    });
  } catch (error: any) {
    console.error('[Operator] race players error:', error.message);
    return res.status(500).json({ code: 500, message: '获取参赛选手失败', data: { list: [], total: 0 } });
  }
});

/**
 * PUT /api/v1/operator/races/:id/status
 * 修改赛事状态（暂停/恢复/结束）
 * @body action - pause | resume | finish
 */
router.put('/races/:id/status', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const raceId = req.params.id;
    const { action } = req.body;

    const validActions: Record<string, string> = {
      pause: 'paused',
      resume: 'running',
      finish: 'finished',
    };

    const newStatus = validActions[action as string];
    if (!newStatus) {
      return res.status(400).json({ code: 400, message: '无效的操作类型', data: null });
    }

    // 检查赛事是否存在
    const race = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM races WHERE id = $1',
      [raceId]
    );
    if (!race) {
      return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    }

    // 操作合法性检查
    if (action === 'pause' && race.status !== 'running') {
      return res.status(400).json({ code: 400, message: '只有进行中的赛事可以暂停', data: null });
    }
    if (action === 'resume' && race.status !== 'paused') {
      return res.status(400).json({ code: 400, message: '只有已暂停的赛事可以恢复', data: null });
    }
    if (action === 'finish' && race.status === 'finished') {
      return res.status(400).json({ code: 400, message: '赛事已结束', data: null });
    }

    await query(
      `UPDATE races SET status = $1, updated_at = $2 WHERE id = $3`,
      [newStatus, new Date().toISOString(), raceId]
    );

    return res.json({
      code: 0,
      message: '操作成功',
      data: { id: raceId, status: newStatus },
    });
  } catch (error: any) {
    console.error('[Operator] race status error:', error.message);
    return res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

export default router;
