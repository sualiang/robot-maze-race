import { Router, Request, Response } from 'express';
import { broadcastToScreen, validateActivationCode } from '../ws/handler';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import {
  ApiResponse,
  PaginatedResult,
  Referee,
  CreateRefereeParams,
  UpdateRefereeParams,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// Referees 路由 — 裁判认证申请/审核/绑定赛场
// ============================================================

/**
 * POST /api/v1/referees/create-by-operator
 * 运营商后台创建裁判（批量注册裁判账号）
 * 创建 users 表记录 + referees 表记录，返回裁判的登录手机号和初始密码
 * @header Authorization: Bearer <token> (operator 或 admin)
 * @body name - 裁判姓名
 * @body phone - 裁判手机号（必填，用于登录）
 * @body venue_id - 绑定的赛场 ID（可选）
 * @returns 创建的裁判信息 + 初始密码
 */
router.post('/create-by-operator', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可创建裁判', data: null });
    }

    const { name, phone, venue_id } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ code: 400, message: '请填写裁判姓名和手机号', data: null });
    }

    // 检查手机号是否已被注册为裁判
    const existingReferee = await queryOne<{ id: string }>(
      'SELECT id FROM referees WHERE phone = $1',
      [phone]
    );
    if (existingReferee) {
      return res.status(400).json({ code: 400, message: '该手机号已被注册为裁判', data: null });
    }

    // 检查手机号是否已存在 users 表
    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE phone = $1',
      [phone]
    );

    let userId: string;
    // 创建 users 记录（裁判仅微信OAuth登录，无需密码）
    if (!existingUser) {
      userId = uuidv4();
      await execute(
        `INSERT INTO users (id, openid, nickname, phone, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'ref_' + phone, name, phone, 'referee']
      );
    } else {
      userId = existingUser.id;
    }

    const refereeId = uuidv4();
    await execute(
      `INSERT INTO referees (id, user_id, phone, venue_id, name, operator_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [refereeId, userId, phone, venue_id || null, name, req.user?.operatorId || null]
    );

    return res.json({
      code: 0,
      message: '裁判创建成功',
      data: {
        id: refereeId,
        user_id: userId,
        name,
        phone,
        venue_id: venue_id || null,
      },
    });
  } catch (error: any) {
    console.error('[Referees] create-by-operator error:', error.message);
    return res.status(500).json({ code: 500, message: '创建裁判失败: ' + error.message, data: null });
  }
});

/** 扩展的裁判类型，包含关联用户信息 */
interface RefereeWithUser extends Referee {
  nickname?: string;
  avatar_url?: string;
  venue_name?: string;
  operator_name?: string;
}

/**
 * GET /api/v1/referees
 * 获取裁判列表（admin/operator 仅看自己的赛场，admin 看全部）
 * @header Authorization: Bearer <token>
 * @query status - 按认证状态筛选: pending | approved | rejected
 * @query venue_id - 按赛场筛选
 * @query page - 页码，默认 1
 * @query pageSize - 每页数量，默认 20
 * @returns PaginatedResult<RefereeWithUser>
 */
router.get('/', authMiddleware, async (req: Request, res: Response<ApiResponse<PaginatedResult<RefereeWithUser>>>) => {
  try {
    const {
      venue_id,
      status,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (venue_id && (venue_id as string) !== '') {
      conditions.push(`r.venue_id = $${paramIdx}`);
      params.push(venue_id);
      paramIdx++;
    }

    // 按审核状态筛选
    if (status && (status as string) !== '') {
      if ((status as string) === 'pending') {
        conditions.push(`r.status = $${paramIdx}`);
        params.push('pending');
        paramIdx++;
      } else if ((status as string) === 'approved') {
        conditions.push(`r.status = $${paramIdx}`);
        params.push('approved');
        paramIdx++;
      } else if ((status as string) === 'rejected') {
        conditions.push(`r.status = $${paramIdx}`);
        params.push('rejected');
        paramIdx++;
      }
      // 不支持其他 status 值，忽略
    }

    // operator 可看自己管理的赛场下的裁判 + 未绑定赛场的裁判（自己创建的）
    if (req.user!.role === 'operator') {
      // 统一获取运营商ID：先查 operator_members 表再回退
      const roleMember = await queryOne<{ operator_id: string }>(
        'SELECT operator_id FROM operator_members WHERE id = $1',
        [req.user!.userId]
      );
      const opUserId = roleMember?.operator_id || 
        (req.user as any).operatorId || 
        req.user!.userId;
      const operatorVenues = await query<{ id: string }>(
        'SELECT id FROM venues WHERE operator_id = $1',
        [opUserId]
      );
      const venueIds = operatorVenues.map((v) => v.id);
      if (venueIds.length > 0) {
        const placeholders = venueIds.map((_, i) => `$${paramIdx + i}`).join(', ');
        // 自己赛场的裁判 OR 未绑定的裁判
        conditions.push(`(r.venue_id IN (${placeholders}) OR r.venue_id IS NULL)`);
        params.push(...venueIds);
        paramIdx += venueIds.length;
      } else {
        // 没有赛场，只看未绑定的裁判
        conditions.push('r.venue_id IS NULL');
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM referees r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN venues v ON r.venue_id = v.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    const list = await query<RefereeWithUser>(
      `SELECT r.id, r.user_id, r.venue_id, r.status,
              r.name,
              r.phone, r.id_number, r.cert_image,
              r.last_checkin_at, r.created_at, r.updated_at,
              r.apply_remark, r.review_remark, r.reviewed_at, r.operator_id,
              u.nickname, u.avatar_url,
              v.name as venue_name,
              o.name as operator_name
       FROM referees r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN venues v ON r.venue_id = v.id
       LEFT JOIN operators o ON r.operator_id = o.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset]
    );

    return res.json({
      code: 0,
      message: 'ok',
      data: { list, total, page, pageSize },
    });
  } catch (error: any) {
    console.error('[Referees] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取裁判列表失败', data: null as any });
  }
});

/**
 * GET /api/v1/referees/my
 * 获取当前用户自己的裁判信息
 * @header Authorization: Bearer <token>
 * @returns RefereeWithUser 或 null（非裁判返回特定提示）
 */
router.get('/my', authMiddleware, async (req: Request, res: Response<ApiResponse<RefereeWithUser | null>>) => {
  try {
    const userId = req.user!.userId;

    const referee = await queryOne<RefereeWithUser>(
      `SELECT r.id, r.user_id, r.venue_id, r.status,
              r.name,
              r.phone, r.id_number, r.cert_image,
              r.last_checkin_at, r.created_at, r.updated_at,
              r.name,
              v.name as venue_name
       FROM referees r
       LEFT JOIN venues v ON r.venue_id = v.id
       WHERE r.user_id = $1`,
      [userId]
    );

    if (!referee) {
      return res.json({
        code: 0,
        message: '尚未申请裁判认证',
        data: null,
      });
    }

    return res.json({ code: 0, message: 'ok', data: referee });
  } catch (error: any) {
    console.error('[Referees] my error:', error.message);
    return res.status(500).json({ code: 500, message: '获取裁判信息失败', data: null as any });
  }
});


/**
 * GET /api/v1/referees/:id
 * 获取裁判详情
 * @param id - 裁判记录 UUID
 * @returns RefereeWithUser
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<RefereeWithUser>>) => {
  try {
    const { id } = req.params;

    const referee = await queryOne<RefereeWithUser>(
      `SELECT r.id, r.user_id, r.venue_id, r.status,
              r.name,
              r.phone, r.id_number, r.cert_image,
              r.last_checkin_at, r.created_at, r.updated_at,
              r.name,
              u.nickname, u.avatar_url,
              v.name as venue_name
       FROM referees r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN venues v ON r.venue_id = v.id
       WHERE r.id = $1`,
      [id]
    );

    if (!referee) {
      return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null as any });
    }

    return res.json({ code: 0, message: 'ok', data: referee });
  } catch (error: any) {
    console.error('[Referees] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取裁判详情失败', data: null as any });
  }
});

/**
 * POST /api/v1/referees/apply
 * 裁判自助申请（无需登录，公开接口）
 * @body name - 姓名
 * @body phone - 手机号
 * @body operator_id - 运营商 ID（可选，从邀请链接获取）
 * @body remark - 申请备注（可选）
 * @returns 申请结果
 */


// 裁判审核路由已移除（cert_status 不再使用）

/**
 * PUT /api/v1/referees/:id/bind-venue
 * 为裁判重新绑定/更换赛场（admin/operator 专用）
 * @param id - 裁判记录 UUID
 * @header Authorization: Bearer <token>
 * @body venue_id - 目标赛场 UUID
 * @returns 更新后的 Referee
 */
router.put('/:id/bind-venue', authMiddleware, async (req: Request, res: Response<ApiResponse<Referee>>) => {
  try {
    const { id } = req.params;
    const { venue_id } = req.body;
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营人员可操作', data: null as any });
    }

    if (!venue_id) {
      return res.status(400).json({ code: 400, message: '请提供目标赛场 venue_id', data: null as any });
    }

    // 验证赛场存在
    const venue = await queryOne<{ id: string }>(
      'SELECT id FROM venues WHERE id = $1',
      [venue_id]
    );
    if (!venue) {
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null as any });
    }

    await execute(
      'UPDATE referees SET venue_id = $1, updated_at = $2 WHERE id = $3',
      [venue_id, new Date().toISOString(), id]
    );
    const referee = await queryOne<Referee>(
      'SELECT id, user_id, venue_id, phone, id_number, cert_image, id_card_front, id_card_back last_checkin_at, created_at, updated_at FROM referees WHERE id = $1',
      [id]
    );

    if (!referee) {
      return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null as any });
    }

    return res.json({ code: 0, message: '赛场绑定已更新', data: referee });
  } catch (error: any) {
    console.error('[Referees] bind-venue error:', error.message);
    return res.status(500).json({ code: 500, message: '绑定赛场失败', data: null as any });
  }
});

/**
 * DELETE /api/v1/referees/:id
 * 删除裁判记录（admin 专用）
 * @param id - 裁判记录 UUID
 * @header Authorization: Bearer <token>
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<null>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可删除裁判记录', data: null });
    }

    // 先取 user_id 再删裁判，同时清理 users 表残留
    const ref = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM referees WHERE id = $1', [id]
    );

    const result = await execute(
      'DELETE FROM referees WHERE id = $1',
      [id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null });
    }

    // 清理 users 表的 referee 角色关联（不删 user 本身，只清空 role）
    if (ref?.user_id) {
      await execute(
        "UPDATE users SET role = 'player', updated_at = NOW() WHERE id = $1 AND role = 'referee'",
        [ref.user_id]
      );
    }

    return res.json({ code: 0, message: '裁判记录已删除', data: null });
  } catch (error: any) {
    console.error('[Referees] delete error:', error.message);
    return res.status(500).json({ code: 500, message: '删除裁判记录失败', data: null });
  }
});

/**
 * PATCH /api/v1/referees/:id/status
 * 启用/禁用裁判（operator/admin 专用）
 * @param id - 裁判记录 UUID
 * @body status - 'disabled' | 'active'
 * @header Authorization: Bearer <token>
 */
router.patch('/:id/status', authMiddleware, async (req: Request, res: Response<ApiResponse<null>>) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可操作裁判状态', data: null });
    }

    if (status !== 'disabled' && status !== 'active') {
      return res.status(400).json({ code: 400, message: '状态值无效，允许值: active, disabled', data: null });
    }

    // 获取裁判关联的 user_id
    const referee = await queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM referees WHERE id = $1',
      [id]
    );

    if (!referee) {
      return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null });
    }

    // 更新裁判表
    console.log('[Referees] status change:', { id, status, user_id: referee.user_id });
    await execute('UPDATE referees SET status = $1 WHERE id = $2', [status, id]);
    console.log('[Referees] referees status updated');

    // 同步更新 users 表状态
    if (referee.user_id) {
      try {
        await execute('UPDATE users SET status = $1 WHERE id = $2', [status, referee.user_id]);
        console.log('[Referees] users status synced');
      } catch (e: any) {
        // users 表可能缺少 status 列或其他问题，仅记录日志
        console.error('[Referees] sync users status failed:', e.message, e.stack);
        // 不阻塞主流程
      }
    }

    const label = status === 'disabled' ? '已禁用' : '已启用';
    return res.json({ code: 0, message: '裁判' + label, data: null });
  } catch (error: any) {
    console.error('[Referees] status change error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '修改裁判状态失败: ' + error.message, data: null });
  }
});

// ============================================================
// 裁判审核路由
// ============================================================


// ============================================================
// Match 子路由 — 裁判比赛管理（Mock 数据）
// ============================================================

interface Racer {
  id: number;
  name: string;
  team: string;
  queueNumber: number;
  remainingRaces: number;
  avatarUrl?: string;
}

interface CurrentRacer extends Racer {
  status: 'waiting' | 'racing' | 'paused' | 'malfunction' | 'finished';
  startTime: number | null;
  elapsed: number;
  pausedElapsed: number;
}

let mockQueue: Racer[] = [];
let mockCurrentRacer: CurrentRacer | null = null;
const mockResults: { id: number; racerId: number; elapsed: number; status: string }[] = [];
let mockRacerSeq = 1;

/**
 * GET /api/v1/referees/match/queue
 * 获取排队队列 + 当前选手
 */
router.get('/match/queue', authMiddleware, async (_req: Request, res: Response) => {
  return res.json({
    code: 0,
    message: 'ok',
    data: {
      queue: mockQueue,
      currentRacer: mockCurrentRacer,
    },
  });
});

/**
 * POST /api/v1/referees/match/select-racer
 * 选号（从队列选下一个选手）
 */
router.post('/match/select-racer', authMiddleware, async (req: Request, res: Response) => {
  const { racerId } = req.body;

  let selected: Racer | undefined;

  if (racerId) {
    selected = mockQueue.find((r) => r.id === racerId);
    if (!selected) {
      return res.status(404).json({ code: 404, message: '选手不存在', data: null });
    }
  } else {
    // 自动选第一个
    selected = mockQueue[0];
    if (!selected) {
      return res.status(400).json({ code: 400, message: '队列为空', data: null });
    }
  }

  // 从队列中移除
  const idx = mockQueue.findIndex((r) => r.id === selected!.id);
  mockQueue.splice(idx, 1);

  mockCurrentRacer = {
    ...selected!,
    status: 'waiting',
    startTime: null,
    elapsed: 0,
    pausedElapsed: 0,
  };

  try {
    broadcastToScreen({
      race_status: 'waiting',
      current_racer: { nickname: mockCurrentRacer.name, queue_number: mockCurrentRacer.queueNumber, avatar_url: mockCurrentRacer.avatarUrl },
      elapsed_ms: 0,
      next_racer: mockQueue.length > 0 ? { nickname: mockQueue[0].name, queue_number: mockQueue[0].queueNumber } : null,
      queue: mockQueue.map(q => ({ queue_number: q.queueNumber, nickname: q.name, status: 'waiting' })),
      venue_name: cachedVenueName,
      venue_id: cachedVenueId,
      leaderboard: getLeaderboard(),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[广播] select-racer 广播失败:', e.message);
  }

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      currentRacer: mockCurrentRacer,
      queue: mockQueue,
    },
  });
});

/**
 * POST /api/v1/referees/match/start
 * 开始比赛（计时开始）
 */
router.post('/match/start', authMiddleware, async (_req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  const now = Date.now();
  mockCurrentRacer.status = 'racing';
  mockCurrentRacer.startTime = now;
  mockCurrentRacer.elapsed = 0;
  mockCurrentRacer.pausedElapsed = 0;

  try {
    broadcastToScreen({
      race_status: 'racing',
      current_racer: { nickname: mockCurrentRacer.name, queue_number: mockCurrentRacer.queueNumber, avatar_url: mockCurrentRacer.avatarUrl },
      elapsed_ms: 0,
      start_time: now,
      next_racer: mockQueue.length > 0 ? { nickname: mockQueue[0].name, queue_number: mockQueue[0].queueNumber } : null,
      queue: mockQueue.map(q => ({ queue_number: q.queueNumber, nickname: q.name, status: 'waiting' })),
      venue_name: cachedVenueName,
      venue_id: cachedVenueId,
      leaderboard: getLeaderboard(),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[广播] start 广播失败:', e.message);
  }

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      currentRacer: mockCurrentRacer,
      startTime: now,
    },
  });
});

/**
 * POST /api/v1/referees/match/pause
 * 暂停
 */
router.post('/match/pause', authMiddleware, async (_req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  if (mockCurrentRacer.status === 'racing' && mockCurrentRacer.startTime) {
    mockCurrentRacer.pausedElapsed = Date.now() - mockCurrentRacer.startTime;
  }
  mockCurrentRacer.status = 'paused';

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      currentRacer: mockCurrentRacer,
      pausedElapsed: mockCurrentRacer.pausedElapsed,
    },
  });
});

/**
 * POST /api/v1/referees/match/resume
 * 恢复
 */
router.post('/match/resume', authMiddleware, async (_req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  const now = Date.now();
  mockCurrentRacer.status = 'racing';
  // 调整 startTime，使得 elapsed 从 pausedElapsed 继续
  mockCurrentRacer.startTime = now - mockCurrentRacer.pausedElapsed;

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      currentRacer: mockCurrentRacer,
      startTime: now,
    },
  });
});

/**
 * POST /api/v1/referees/match/end
 * 结束比赛（记录成绩）
 */
router.post('/match/end', authMiddleware, async (req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  const { elapsed, finishTimeMs } = req.body;
  console.log('[endRace] req.body:', JSON.stringify(req.body), 'pausedElapsed:', mockCurrentRacer.pausedElapsed);
  const finalElapsed = elapsed || finishTimeMs || mockCurrentRacer.pausedElapsed || 0;
  console.log('[endRace] finalElapsed:', finalElapsed);

  const result = {
    id: mockResults.length + 1,
    racerId: mockCurrentRacer.id,
    elapsed: finalElapsed,
    status: 'finished',
    racerName: mockCurrentRacer.name,
    racerAvatar: mockCurrentRacer.avatarUrl || '🤖',
  };

  mockResults.push(result);
  mockCurrentRacer.status = 'finished';
  mockCurrentRacer.elapsed = finalElapsed;
  if (mockCurrentRacer.remainingRaces > 0) mockCurrentRacer.remainingRaces--;

  try {
    broadcastToScreen({
      race_status: 'finished',
      current_racer: null,
      last_result: result,
      elapsed_ms: finalElapsed,
      next_racer: mockQueue.length > 0 ? { nickname: mockQueue[0].name, queue_number: mockQueue[0].queueNumber } : null,
      queue: mockQueue.map(q => ({ queue_number: q.queueNumber, nickname: q.name, status: 'waiting' })),
      venue_name: cachedVenueName,
      venue_id: cachedVenueId,
      leaderboard: getLeaderboard(),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[广播] end 广播失败:', e.message);
  }

  return res.json({
    code: 0,
    message: 'ok',
    data: { result },
  });
});

/**
 * POST /api/v1/referees/match/re-enter
 * 当前选手再玩一次（重新进入 waiting 状态）
 */
router.post('/match/re-enter', authMiddleware, async (_req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  mockCurrentRacer.status = 'waiting';
  mockCurrentRacer.startTime = null;
  mockCurrentRacer.elapsed = 0;
  mockCurrentRacer.pausedElapsed = 0;

  broadcastToScreen({
    race_status: 'waiting',
    current_racer: { nickname: mockCurrentRacer.name, queue_number: mockCurrentRacer.queueNumber, avatar_url: mockCurrentRacer.avatarUrl },
    elapsed_ms: 0,
    next_racer: mockQueue.length > 0 ? { nickname: mockQueue[0].name, queue_number: mockQueue[0].queueNumber } : null,
    queue: mockQueue.map(q => ({ queue_number: q.queueNumber, nickname: q.name, status: 'waiting' })),
    venue_name: cachedVenueName,
    venue_id: cachedVenueId,
    leaderboard: getLeaderboard(),
    timestamp: new Date().toISOString(),
  });

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      currentRacer: mockCurrentRacer,
      queue: mockQueue,
    },
  });
});

/**
 * POST /api/v1/referees/match/call-next
 * 完成当前选手，放回队列末尾
 */
router.post('/match/call-next', authMiddleware, async (_req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  // 当前选手放回队列末尾
  const reQueue: Racer = {
    id: mockCurrentRacer.id,
    name: mockCurrentRacer.name,
    team: mockCurrentRacer.name,
    queueNumber: mockCurrentRacer.queueNumber,
    remainingRaces: mockCurrentRacer.remainingRaces,
    avatarUrl: mockCurrentRacer.avatarUrl,
  };
  mockQueue.push(reQueue);
  mockCurrentRacer = null;

  broadcastToScreen({
    event: 'call_next',
    data: {
      queue: mockQueue.map(q => ({ queue_number: q.queueNumber, nickname: q.name, status: 'waiting' })),
      currentRacer: null,
    },
  });

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      queue: mockQueue,
    },
  });
});

/**
 * POST /api/v1/referees/match/malfunction
 * 故障处理
 */
router.post('/match/malfunction', authMiddleware, async (_req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  mockCurrentRacer.status = 'malfunction';

  // 广播故障事件到大屏
  broadcastToScreen({
    event: 'racer_malfunction',
    data: {
      racerName: mockCurrentRacer.name,
      race_status: 'malfunction',
      currentRacer: null,
      queue: mockQueue,
    },
  });

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      currentRacer: mockCurrentRacer,
      status: 'malfunction',
    },
  });
});

/**
 * POST /api/v1/referees/match/forfeit
 * 弃赛
 */
router.post('/match/forfeit', authMiddleware, async (_req: Request, res: Response) => {
  if (!mockCurrentRacer) {
    return res.status(400).json({ code: 400, message: '没有当前选手', data: null });
  }

  const forfeitedRacer = { ...mockCurrentRacer };

  // 弃赛扣减一次参赛次数
  if (mockCurrentRacer.remainingRaces !== undefined) {
    mockCurrentRacer.remainingRaces--;
  }

  // 弃赛后选手回到队列第一位（仅当还有剩余次数）
  const remaining = mockCurrentRacer.remainingRaces ?? 0;
  if (remaining > 0) {
    const reQueue: Racer = {
      id: forfeitedRacer.id,
      name: forfeitedRacer.name,
      team: forfeitedRacer.name,
      queueNumber: forfeitedRacer.queueNumber,
      remainingRaces: remaining,
      avatarUrl: forfeitedRacer.avatarUrl,
    };
    mockQueue.unshift(reQueue);
  }

  mockCurrentRacer = null;

  // 广播弃赛事件到大屏
  broadcastToScreen({
    event: 'racer_forfeit',
    data: {
      racerName: forfeitedRacer.name,
      currentRacer: null,
      queue: mockQueue,
      leaderboard: getLeaderboard(),
    },
  });

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      currentRacer: null,
      queue: mockQueue,
    },
  });
});

// ============================================================
// 裁判签到 - /api/v1/referee/attendance/*
// ============================================================

interface AttendanceRecord {
  id: string;
  referee_id: string;
  venue_id: string;
  checkin_at: string;
  checkout_at: string | null;
  venue_name?: string;
}

/**
 * GET /attendance/status
 * 签到状态查询
 */
router.get('/attendance/status', authMiddleware, async (req: Request, res: Response<ApiResponse<any>>) => {
  try {
    const userId = req.user!.userId;
    // 从 referees 表查真实 referee_id
    const ref = await queryOne<{ id: string; phone: string }>(
      'SELECT id, phone FROM referees WHERE user_id = $1', [userId]
    );
    if (!ref) return res.status(401).json({ code: 401, message: '未找到裁判记录', data: null });
    const refereeId = ref.id;

    // 查询今日签到
    const todayCheckin = await queryOne<any>(
      `SELECT id, checkin_at, checkout_at, venue_id FROM attendance
       WHERE referee_id = $1 AND date(checkin_at) = CURDATE() ORDER BY checkin_at DESC LIMIT 1`,
      [refereeId]
    );

    // 查询关联的赛场信息
    let venueName = '';
    let venueAddress = '';
    if (todayCheckin?.venue_id) {
      const venueRow = await queryOne<{ name: string; address: string }>(
        'SELECT name, address FROM venues WHERE id = $1',
        [todayCheckin.venue_id]
      );
      if (venueRow) {
        venueName = venueRow.name;
        venueAddress = venueRow.address || '';
      }
    }

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        isReferee: true,
        checkedIn: !!todayCheckin && !todayCheckin.checkout_at,
        checkedOut: !!todayCheckin?.checkout_at,
        refereeId: refereeId,
        venueId: todayCheckin?.venue_id || '',
        venueName,
        venueInfo: { address: venueAddress },
        checkinRecord: todayCheckin || null,
      },
    });
  } catch (error: any) {
    console.error('[Referee] 签到状态查询失败:', error.message);
    return res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /attendance/check-in
 * 签到
 */
router.post('/attendance/check-in', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ code: 401, message: '未登录', data: null });

    const { venueId, venue_id } = req.body;
    const finalVenueId = venueId || venue_id || 'default_venue_001';

    if (!finalVenueId) {
      return res.status(400).json({ code: 400, message: '缺少赛场ID', data: null });
    }

    // 从 referees 表查找真实 referee_id
    const refRow = await queryOne<{ id: string; phone: string }>(
      'SELECT id, phone FROM referees WHERE user_id = $1', [userId]
    );
    if (!refRow) {
      return res.status(400).json({ code: 400, message: '未找到裁判记录，请先完成注册', data: null });
    }
    const refereeId = refRow.id;
    const phone = refRow.phone || req.user!.openid?.replace('mock_openid_', '') || '13800138000';

    // 检查今日是否已签到
    const existing = await queryOne<any>(
      `SELECT id, checkout_at FROM attendance
       WHERE referee_id = $1 AND date(checkin_at) = CURDATE()`,
      [refereeId]
    );

    if (existing && !existing.checkout_at) {
      return res.status(400).json({ code: 400, message: '今日已签到，请勿重复签到', data: null });
    }

    // 执行签到记录插入
    const id = uuidv4();
    const now = new Date().toISOString();
    await execute(
      'INSERT INTO attendance (id, referee_id, venue_id, checkin_at) VALUES ($1, $2, $3, NOW())',
      [id, refereeId, finalVenueId]
    );

    // 标记赛场已激活
    setVenueActive(true);
    cachedVenueStatus = 'open';

    // 回写 venues 表，确保 REST API 也返回正确状态
    try { await execute('UPDATE venues SET status = \'open\' LIMIT 1'); } catch (_) {}

    // 广播赛场重新开放到大屏，大屏恢复全新状态
    broadcastToScreen({
      event: 'venue_reopen',
      data: { reopenedAt: now },
    });

    // 再推送一次当前 screen_data，让大屏直接显示比赛界面
    const screenData = getCurrentScreenData();
    broadcastToScreen({ type: 'screen_data', data: screenData });

    // 从数据库获取真实的赛场信息
    let venueName = finalVenueId;
    let venueAddress = '';
    const venueRow = await queryOne<{ name: string; address: string }>(
      'SELECT name, address FROM venues WHERE id = $1',
      [finalVenueId]
    );
    if (venueRow) {
      venueName = venueRow.name;
      venueAddress = venueRow.address || '';
    }

    return res.json({
      code: 0,
      message: '签到成功',
      data: { id, checkinAt: now, venueInfo: { id: finalVenueId, name: venueName, address: venueAddress } } });
  } catch (error: any) {
    console.error('[Referee] 签到失败:', error.message || error, 'stack:', error.stack ? error.stack.substring(0,200) : 'none');
    return res.status(500).json({ code: 500, message: '签到失败: ' + (error.message || error), data: null });
  }
});

/**
 * POST /attendance/check-out
 * 签退
 */
router.post('/attendance/check-out', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ code: 401, message: '未登录', data: null });

    // 从 referees 表查真实 referee_id
    const ref = await queryOne<{ id: string }>(
      'SELECT id FROM referees WHERE user_id = $1', [userId]
    );
    if (!ref) return res.status(401).json({ code: 401, message: '未找到裁判记录', data: null });
    const refereeId = ref.id;

    const now = new Date().toISOString();
    await execute(
      `UPDATE attendance SET checkout_at = NOW() WHERE referee_id = $1 AND date(checkin_at) = CURDATE() AND checkout_at IS NULL`,
      [refereeId]
    );

    // 赛场标记为未激活
    setVenueActive(false);
    cachedVenueStatus = 'closed';

    // 回写 venues 表
    try { await execute('UPDATE venues SET status = \'closed\' LIMIT 1'); } catch (_) {}

    // 清空排队队列和当前选手，重置所有比赛状态（新玩家需重新扫码排队）
    mockQueue.length = 0;
    mockCurrentRacer = null;
    mockResults.length = 0;

    // 广播赛场关闭通知到大屏（含清空后的队列和选手信息）
    broadcastToScreen({
      event: 'venue_closed',
      data: {
        closedAt: now,
        queue: [],
        currentRacer: null,
        race_status: 'inactive',
      },
    });
    // 同时推送最新 screen_data（venue_status = inactive, queue 为空）
    const closedScreenData = getCurrentScreenData();
    broadcastToScreen({ type: 'screen_data', data: closedScreenData });

    return res.json({ code: 0, message: '签退成功', data: { checkoutAt: now } });
  } catch (error: any) {
    console.error('[Referee] 签退失败:', error.message);
    return res.status(500).json({ code: 500, message: '签退失败', data: null });
  }
});

/**
 * POST /attendance/check-in-by-qr
 * 裁判扫大屏二维码签到 + 激活大屏
 */
router.post('/attendance/check-in-by-qr', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { activationCode } = req.body;
    if (!activationCode) {
      return res.status(400).json({ code: 400, message: '缺少激活码', data: null });
    }

    // 1. 验证激活码
    const validation = validateActivationCode(activationCode);
    if (!validation.valid) {
      return res.status(400).json({ code: 400, message: '激活码无效或已过期，请刷新大屏二维码', data: null });
    }

    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ code: 401, message: '未登录', data: null });

    // 2. 从 referees 表查真实 referee_id
    const refRow = await queryOne<{ id: string; venue_id: string | null }>(
      'SELECT id, venue_id FROM referees WHERE user_id = $1', [userId]
    );
    if (!refRow) {
      return res.status(400).json({ code: 400, message: '未找到裁判记录，请先完成注册', data: null });
    }

    // 3. 取激活码绑定的场地（如果大屏传了 venueId 则用它，否则取第一个）
    let venue: { id: string; name: string; address: string } | null = null;
    if (validation.venueId) {
      venue = await queryOne<{ id: string; name: string; address: string }>(
        'SELECT id, name, COALESCE(address, \'\') as address FROM venues WHERE id = $1',
        [validation.venueId]
      );
    }
    if (!venue) {
      venue = await queryOne<{ id: string; name: string; address: string }>(
        'SELECT id, name, COALESCE(address, \'\') as address FROM venues LIMIT 1'
      );
    }
    if (!venue) {
      return res.status(500).json({ code: 500, message: '没有可用赛场', data: null });
    }

    // 3.5 验证裁判是否已绑定该赛场
    if (refRow.venue_id && refRow.venue_id !== venue.id) {
      return res.status(403).json({ code: 403, message: '您未绑定此赛场，请联系管理员绑定', data: null });
    }

    // 4. 查今日是否已签到且未签退
    const existing = await queryOne<any>(
      `SELECT id FROM attendance
       WHERE referee_id = $1 AND date(checkin_at) = CURDATE() AND checkout_at IS NULL
       LIMIT 1`,
      [refRow.id]
    );
    if (existing) {
      return res.status(400).json({ code: 400, message: '今日已签到，请先签退', data: null });
    }

    // 5. 写入 attendance 签到记录
    const attendanceId = uuidv4();
    const now = new Date().toISOString();
    await execute(
      'INSERT INTO attendance (id, referee_id, user_id, venue_id, checkin_at) VALUES ($1, $2, $3, $4, NOW())',
      [attendanceId, refRow.id, userId, venue.id]
    );

    // 6. 更新 referees 表最后签到时间
    await execute('UPDATE referees SET last_checkin_at = NOW() WHERE id = $1', [refRow.id]);

    // 7. 标记赛场已激活
    setVenueActive(true);
    cachedVenueStatus = 'open';
    cachedVenueName = venue.name;
    cachedVenueId = venue.id;

    // 回写 venues 表
    try { await execute('UPDATE venues SET status = \'open\' WHERE id = $1', [venue.id]); } catch (_) {}

    // 8. 通知大屏激活
    if (validation.ws && validation.ws.readyState === WebSocket.OPEN) {
      validation.ws.send(JSON.stringify({
        type: 'activated',
        data: { venue_name: venue.name, venue_id: venue.id },
      }));
    }

    // 9. 广播 screen_data 更新
    const screenData = getCurrentScreenData();
    broadcastToScreen({ type: 'screen_data', data: screenData });

    return res.json({
      code: 0,
      message: '签到成功，赛场已激活',
      data: {
        attendanceId,
        checkinAt: now,
        venueId: venue.id,
        venueName: venue.name,
      },
    });
  } catch (error: any) {
    console.error('[QR签到] 失败:', error.message);
    return res.status(500).json({ code: 500, message: '签到失败: ' + error.message, data: null });
  }
});

/**
 * GET /attendance/records
 * 签到记录列表
 */
router.get('/attendance/records', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ code: 401, message: '未登录', data: null });

    const { date } = req.query;
    // 从 referees 表查真实 referee_id
    const ref = await queryOne<{ id: string }>('SELECT id FROM referees WHERE user_id = $1', [userId]);
    if (!ref) return res.json({ code: 0, message: 'ok', data: [] });
    const refereeId = ref.id;

    let sql = `SELECT a.*, v.name as venue_name
               FROM attendance a
               LEFT JOIN venues v ON a.venue_id = v.id
               WHERE a.referee_id = $1`;
    const params: any[] = [refereeId];

    if (date) {
      params.push(date);
      sql += ` AND date(a.checkin_at) = $${params.length}`;
    }

    sql += ' ORDER BY a.checkin_at DESC';

    // 无日期参数时限制最近 5 条，按日期查不做限制
    if (!date) {
      sql += ' LIMIT 5';
    }

    const records = await query<any>(sql, params);

    return res.json({ code: 0, message: 'ok', data: records });
  } catch (error: any) {
    console.error('[Referee] 签到记录查询失败:', error.message);
    return res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

/** 获取排行榜数据（从数据库读取） */
function getLeaderboard() {
  return [];
}

/** 获取当前赛场数据（供大屏 WebSocket 使用） */
// ====== 当前赛场的激活状态（由签到/签退控制） ======
let venueActive = false;

export function setVenueActive(active: boolean) {
  venueActive = active;
}

let cachedVenueName = '机器狗迷宫赛场';
let cachedVenueId = '';
let cachedVenueStatus = 'inactive';

/** 从 MySQL venues 表加载首个赛场信息 */
export async function initVenueCache(): Promise<void> {
  try {
    const row = await queryOne<{ id: string; name: string; status: string }>(
      'SELECT id, name, status FROM venues LIMIT 1'
    );
    if (row) {
      cachedVenueName = row.name || cachedVenueName;
      cachedVenueId = row.id || cachedVenueId;
      cachedVenueStatus = row.status || cachedVenueStatus;
    }
  } catch (e) {
    console.warn('[VenueCache] 初始化失败，使用默认值:', (e as any)?.message || e);
  }
}

export function getCurrentScreenData() {
  const leaderboard = getLeaderboard();

  const isActive = venueActive;

  return {
    race_status: isActive ? (mockCurrentRacer?.status === 'racing' ? 'racing' : mockCurrentRacer?.status || 'waiting') : 'inactive',
    venue_status: cachedVenueStatus,
    current_racer: isActive && mockCurrentRacer ? { nickname: mockCurrentRacer.name, queue_number: mockCurrentRacer.queueNumber, avatar_url: mockCurrentRacer.avatarUrl } : null,
    elapsed_ms: !isActive ? 0
      : mockCurrentRacer?.status === 'finished'
      ? (mockCurrentRacer.elapsed || 0)
      : mockCurrentRacer?.startTime ? Date.now() - mockCurrentRacer.startTime : 0,
    start_time: isActive ? (mockCurrentRacer?.startTime || null) : null,
    next_racer: isActive && mockQueue.length > 0 ? { nickname: mockQueue[0].name, queue_number: mockQueue[0].queueNumber } : null,
    queue: isActive ? mockQueue.map(q => ({ queue_number: q.queueNumber, nickname: q.name, status: 'waiting' })) : [],
    venue_name: cachedVenueName,
    venue_id: cachedVenueId,
    leaderboard: isActive ? leaderboard : [],
    last_result: mockCurrentRacer?.status === 'finished' && mockCurrentRacer?.elapsed != null ? {
      racerName: mockCurrentRacer.name,
      racerAvatar: mockCurrentRacer.avatarUrl,
      finishTimeMs: mockCurrentRacer.elapsed,
      isTimeout: false,
    } : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * PATCH /api/v1/referees/:id/profile
 * 裁判完善个人资料（路径 B 步骤 7）
 */
router.patch('/:id/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ code: 400, message: '请填写姓名和手机号', data: null });
    if (!/^\d{11}$/.test(phone)) return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });

    const referee = await queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM referees WHERE id = $1', [id]);
    if (!referee) return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null });

    await execute('UPDATE referees SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3', [name, phone, id]);
    if (referee.user_id) {
      await execute('UPDATE users SET nickname = $1, phone = $2, updated_at = NOW() WHERE id = $3', [name, phone, referee.user_id]);
    }
    return res.json({ code: 0, message: '资料更新成功', data: { id, name, phone } });
  } catch (error: any) {
    console.error('[Referees] profile update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新资料失败', data: null });
  }
});

// 裁判认证审核路由已移除（cert_status 不再使用）

/**
 * PATCH /api/v1/referees/:id
 * 更新裁判信息（绑定赛场等）
 * @param id - 裁判 ID
 * @body venue_id - 绑定的赛场 ID
 */
router.patch('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<null>>) => {
  try {
    const { id } = req.params;
    const { venue_id, name, phone } = req.body;

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM referees WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '裁判不存在', data: null });
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (venue_id !== undefined) {
      fields.push(`venue_id = $${paramIdx++}`);
      values.push(venue_id);
    }
    if (name !== undefined) {
      fields.push(`name = $${paramIdx++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      fields.push(`phone = $${paramIdx++}`);
      values.push(phone);
    }

    if (fields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null });
    }

    fields.push(`updated_at = $${paramIdx++}`);
    values.push(new Date().toISOString());
    values.push(id);

    await query(
      `UPDATE referees SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    return res.json({ code: 0, message: '裁判信息已更新', data: null });
  } catch (error: any) {
    console.error('[Referees] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新裁判信息失败', data: null });
  }
});

export default router;
