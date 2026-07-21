import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { hashSync } from 'bcryptjs';
import { broadcastToScreen, validateActivationCode } from '../ws/handler';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import {
  ApiResponse,
  PaginatedResult,
  Referee,
  CreateRefereeParams,
  UpdateRefereeParams,
} from '@robot-race/shared';
import { getConfigInt } from '../config/utils';

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
    const existingReferee = await queryOpOne<{ id: string }>(req, 
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
    // 生成随机初始密码并创建 users 记录（bcrypt 哈希存储）
    const initPassword = crypto.randomBytes(4).toString('hex').toUpperCase();
    const hashedPassword = hashSync(initPassword, 10);
    if (!existingUser) {
      userId = uuidv4();
      await execute(
        `INSERT INTO users (id, openid, nickname, phone, role, password, first_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, 'ref_' + phone, name, phone, 'referee', hashedPassword, 1]
      );
    } else {
      userId = existingUser.id;
      // 对已存在用户也重置密码
      await execute('UPDATE users SET password=$1, first_login=1 WHERE id=$2', [hashedPassword, userId]);
    }

    const refereeId = uuidv4();
    await executeOp(req, 
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
        password: initPassword,
      },
    });
  } catch (error: any) {
    console.error('[Referees] create-by-operator error:', error.message);
    return res.status(500).json({ code: 500, message: '创建裁判失败: ' + error.message, data: null });
  }
});

/**
 * POST /api/v1/referees/:id/reset-password
 * 重置裁判登录密码
 */
router.post('/:id/reset-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const referee = await queryOpOne<{ user_id: string; phone: string }>(req,
      'SELECT user_id, phone FROM referees WHERE id = $1', [id]
    );
    if (!referee) {
      return res.status(404).json({ code: 404, message: '裁判不存在', data: null });
    }

    const initPassword = crypto.randomBytes(4).toString('hex').toUpperCase();
    const hashedPassword = hashSync(initPassword, 10);
    await execute(
      'UPDATE users SET password = $1, first_login = 1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, referee.user_id]
    );

    return res.json({
      code: 0,
      message: '密码重置成功',
      data: { phone: referee.phone, init_password: initPassword },
    });
  } catch (error: any) {
    console.error('[Referees] reset-password error:', error.message);
    return res.status(500).json({ code: 500, message: '密码重置失败: ' + error.message, data: null });
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
          'SELECT operator_id FROM operator_members WHERE id = ?',
        [req.user!.userId]
      );
      const opUserId = roleMember?.operator_id || 
        (req.user as any).operatorId || 
        req.user!.userId;
      const operatorVenues = await queryOp<{ id: string }>(req, 
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

    // COUNT: only from operator DB (no cross-DB JOIN on users)
    const countResult = await queryOpOne<{ count: string }>(req, 
      `SELECT COUNT(*) as count FROM referees r ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    // 1) 从运营商库查 referees + venues
    const rows = await queryOp<any>(req, 
      `SELECT r.id, r.user_id, r.venue_id, r.status,
              r.name,
              r.phone, r.id_number, r.cert_image,
              r.last_checkin_at, r.created_at, r.updated_at,
              r.apply_remark, r.review_remark, r.reviewed_at, r.operator_id,
              v.name as venue_name
       FROM referees r
       LEFT JOIN venues v ON r.venue_id = v.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset]
    );

    // 2) 收集 user_id 和 operator_id，批量查公共库的 users 和 operators
    const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
    const opIds = [...new Set(rows.map((r: any) => r.operator_id).filter(Boolean))];
    const userMap: Record<string, any> = {};
    const opMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const userPlaceholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
      try {
        const users = await query<any>(`SELECT id, nickname, avatar_url FROM users WHERE id IN (${userPlaceholders})`, userIds);
        users.forEach((u: any) => { userMap[u.id] = u; });
      } catch { /* ignore if users query fails */ }
    }
    if (opIds.length > 0) {
      const opPlaceholders = opIds.map((_, i) => `$${i + 1}`).join(', ');
      try {
        const ops = await query<any>(`SELECT id, name FROM operators WHERE id IN (${opPlaceholders})`, opIds);
        ops.forEach((o: any) => { opMap[o.id] = o; });
      } catch { /* ignore if operators query fails */ }
    }

    // 3) JS 层组装
    const list: RefereeWithUser[] = rows.map((r: any) => ({
      ...r,
      nickname: userMap[r.user_id]?.nickname || null,
      avatar_url: userMap[r.user_id]?.avatar_url || null,
      operator_name: opMap[r.operator_id]?.name || null,
    }));

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

    const referee = await queryOpOne<RefereeWithUser>(req, 
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

    const row = await queryOpOne<any>(req, 
      `SELECT r.id, r.user_id, r.venue_id, r.status,
              r.name,
              r.phone, r.id_number, r.cert_image,
              r.last_checkin_at, r.created_at, r.updated_at,
              r.apply_remark, r.review_remark, r.reviewed_at, r.operator_id,
              v.name as venue_name
       FROM referees r
       LEFT JOIN venues v ON r.venue_id = v.id
       WHERE r.id = $1`,
      [id]
    );

    if (!row) {
      return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null as any });
    }

    // Separate queries to common DB for user + operator info (no cross-DB JOIN)
    const referee: RefereeWithUser = { ...row };
    if (row.user_id) {
      try {
        const u = await queryOne<{ nickname: string; avatar_url: string }>(
          'SELECT nickname, avatar_url FROM users WHERE id = $1', [row.user_id]
        );
        if (u) { referee.nickname = u.nickname; referee.avatar_url = u.avatar_url; }
      } catch { /* ignore */ }
    }
    if (row.operator_id) {
      try {
        const o = await queryOne<{ name: string }>(
          'SELECT name FROM operators WHERE id = $1', [row.operator_id]
        );
        if (o) { referee.operator_name = o.name; }
      } catch { /* ignore */ }
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
    const venue = await queryOpOne<{ id: string }>(req, 
      'SELECT id FROM venues WHERE id = $1',
      [venue_id]
    );
    if (!venue) {
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null as any });
    }

    await executeOp(req, 
      'UPDATE referees SET venue_id = $1, updated_at = NOW() WHERE id = $2',
      [venue_id, id]
    );
    const referee = await queryOpOne<Referee>(req, 
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
    const ref = await queryOpOne<{ user_id: string }>(req, 
      'SELECT user_id FROM referees WHERE id = $1', [id]
    );

    const result = await executeOp(req, 
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
    const referee = await queryOpOne<{ id: string; user_id: string }>(req, 
      'SELECT id, user_id FROM referees WHERE id = $1',
      [id]
    );

    if (!referee) {
      return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null });
    }

    // 更新裁判表
    console.log('[Referees] status change:', { id, status, user_id: referee.user_id });
    await executeOp(req, 'UPDATE referees SET status = $1 WHERE id = $2', [status, id]);
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
// Match 子路由 — 裁判比赛管理（DB 持久化）
// ============================================================

interface RacerRow {
  id: string;
  venue_id: string;
  user_id: string;
  queue_number: number;
  status: string;
  remaining_races: number;
  avatar_url: string | null;
  race_type: string | null;
  checkin_id: string | null;
  referee_id: string | null;
  start_time_ms: number | null;
  paused_elapsed_ms: number;
  finish_time_ms: number | null;
  finish_status: string | null;
  fault_reason: string | null;
  nickname?: string;
}

/**
 * GET /api/v1/referees/match/queue
 * 获取排队队列 + 当前选手（DB 查询）
 */
router.get('/match/queue', authMiddleware, async (req: Request, res: Response) => {
  try {
    const venueId = (req as any).venueId || (req.query as any).venueId;
    if (!venueId) {
      const ref = await queryOpOne<{ venue_id: string }>(req,
        'SELECT venue_id FROM referees WHERE user_id = $1 LIMIT 1',
        [req.user!.userId]
      );
      if (!ref?.venue_id) {
        return res.json({ code: 0, message: 'ok', data: { queue: [], currentRacer: null } });
      }
      (req as any).venueId = ref.venue_id;
    }
    const vid = (req as any).venueId || venueId;

    // 分两段查询：race_queues 在运营商库，users 在 common 库，不能直接 JOIN
    const queueRows = await queryOp<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('waiting','called','skipped')
       ORDER BY rq.queue_number ASC`,
      [vid]
    );

    const currentRow = await queryOpOne<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('racing','paused','malfunction')
       ORDER BY rq.created_at DESC LIMIT 1`,
      [vid]
    );

    // 收集所有 user_id 去 common 库查 users 信息
    const allUserIds = [
      ...queueRows.map(r => r.user_id),
      ...(currentRow ? [currentRow.user_id] : []),
    ].filter(Boolean);
    const userMap = new Map<string, { nickname: string; avatar_url: string }>();
    if (allUserIds.length > 0) {
      try {
        const placeholders = allUserIds.map(() => '?').join(',');
        const userRows: any[] = await query(
          `SELECT id, nickname, avatar_url FROM users WHERE id IN (${placeholders})`,
          allUserIds
        );
        for (const u of (userRows || [])) {
          userMap.set(u.id, { nickname: u.nickname, avatar_url: u.avatar_url });
        }
      } catch (e: any) {
        console.warn('[Match] query users from common DB failed:', e.message);
      }
    }

    const queue = queueRows.map(r => {
      const u = userMap.get(r.user_id);
      return {
        id: r.id,
        nickname: u?.nickname || '选手',
        name: u?.nickname || '选手',
        robotName: '',
        attempt: 1,
        remainingRaces: r.remaining_races,
        avatarUrl: u?.avatar_url || undefined,
        queueNumber: r.queue_number,
        race_type: r.race_type || undefined,
      };
    });

    let currentRacer = null;
    if (currentRow) {
      const cu = userMap.get(currentRow.user_id);
      const elapsed = currentRow.start_time_ms
        ? (currentRow.paused_elapsed_ms || 0) + (currentRow.status === 'racing' ? Date.now() - currentRow.start_time_ms : 0)
        : (currentRow.finish_time_ms || 0);
      currentRacer = {
        id: currentRow.id,
        nickname: cu?.nickname || '选手',
        name: cu?.nickname || '选手',
        robotName: '',
        attempt: 1,
        remainingRaces: currentRow.remaining_races,
        avatarUrl: cu?.avatar_url || undefined,
        queueNumber: currentRow.queue_number,
        isCurrent: true,
        race_type: currentRow.race_type || undefined,
        status: currentRow.status,
        elapsed,
        pausedElapsed: currentRow.paused_elapsed_ms || 0,
        startTime: currentRow.start_time_ms,
      };
    }

    return res.json({ code: 0, message: 'ok', data: { queue, currentRacer } });
  } catch (e: any) {
    console.error('[Match] queue error:', e.message);
    return res.status(500).json({ code: 500, message: '获取队列失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/select-racer
 * 选号（从排队队列选下一个选手，状态 waiting→called）
 */
router.post('/match/select-racer', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;

    if (!racerId) {
      // 自动选第一个 waiting 的选手
      const first = await queryOpOne<RacerRow>(req,
        `SELECT id FROM race_queues WHERE status IN ('waiting','skipped') ORDER BY CASE WHEN status = 'skipped' THEN 0 ELSE 1 END, queue_number ASC LIMIT 1`, []
      );
      if (!first) {
        return res.status(400).json({ code: 400, message: '队列为空', data: null });
      }
      (req.body as any).racerId = first.id;
    }

    const rid = racerId || (req.body as any).racerId;

    // 如果已有当前选手在比赛，先放回队列
    await executeOp(req,
      `UPDATE race_queues SET status = 'waiting', start_time_ms = NULL, paused_elapsed_ms = 0
       WHERE status IN ('called','malfunction') AND id != $1`,
      [rid]
    );

    // 更新该选手状态为 called（$1 先出现，避免 expandParams 重排参数）
    await executeOp(req,
      `UPDATE race_queues SET status = 'called', start_time_ms = NULL, paused_elapsed_ms = 0, finish_time_ms = NULL, referee_id = $1
       WHERE id = $2`,
      [req.user!.userId, rid]
    );

    await broadcastAfterUpdate(req);

    return res.json({ code: 0, message: '已叫号', data: null });
  } catch (e: any) {
    console.error('[Match] select-racer error:', e.message);
    return res.status(500).json({ code: 500, message: '叫号失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/start
 * 开始比赛（called/暂停→racing，记录 start_time_ms）
 */
router.post('/match/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    const { racerId } = req.body;

    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    const row = await queryOpOne<RacerRow>(req,
      `SELECT id, status, paused_elapsed_ms FROM race_queues WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }

    // 从 paused_elapsed_ms 继续计时
    const adjustStart = now - (row.paused_elapsed_ms || 0);
    await executeOp(req,
      `UPDATE race_queues SET status = 'racing', start_time_ms = $1, paused_elapsed_ms = 0 WHERE id = $2`,
      [adjustStart, racerId]
    );

    await broadcastAfterUpdate(req);

    return res.json({ code: 0, message: '比赛开始', data: { startTime: now } });
  } catch (e: any) {
    console.error('[Match] start error:', e.message);
    return res.status(500).json({ code: 500, message: '开始比赛失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/pause
 * 暂停（记录 paused_elapsed_ms）
 */
router.post('/match/pause', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId, elapsed } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    const pausedMs = elapsed != null ? elapsed : 0;
    await executeOp(req,
      `UPDATE race_queues SET status = 'paused', paused_elapsed_ms = $1 WHERE id = $2 AND status = 'racing'`,
      [pausedMs, racerId]
    );

    return res.json({ code: 0, message: '已暂停', data: null });
  } catch (e: any) {
    console.error('[Match] pause error:', e.message);
    return res.status(500).json({ code: 500, message: '暂停失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/resume
 * 恢复（从 paused_elapsed_ms 继续）
 */
router.post('/match/resume', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    const row = await queryOpOne<RacerRow>(req,
      `SELECT paused_elapsed_ms FROM race_queues WHERE id = $1 AND status = 'paused'`,
      [racerId]
    );
    if (!row) {
      return res.status(400).json({ code: 400, message: '当前不处于暂停状态', data: null });
    }

    const adjustStart = Date.now() - (row.paused_elapsed_ms || 0);
    await executeOp(req,
      `UPDATE race_queues SET status = 'racing', start_time_ms = $1, paused_elapsed_ms = 0 WHERE id = $2`,
      [adjustStart, racerId]
    );

    await broadcastAfterUpdate(req);

    return res.json({ code: 0, message: '比赛恢复', data: null });
  } catch (e: any) {
    console.error('[Match] resume error:', e.message);
    return res.status(500).json({ code: 500, message: '恢复失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/end
 * 结束比赛（记录成绩到 race_queues.finish_time_ms，扣减次数）
 */
router.post('/match/end', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId, finishTimeMs, status: raceStatus } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    let row = await queryOpOne<RacerRow>(req,
      `SELECT id, user_id, venue_id, remaining_races FROM race_queues
       WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }

    // 从 common 库查 user 信息（users 表不在运营商隔离库）
    let userInfo: any = {};
    try {
      userInfo = await queryOne<any>('SELECT nickname, avatar_url FROM users WHERE id = $1', [row.user_id]) || {};
    } catch { /* ignore */ }
    row.nickname = userInfo.nickname || '';
    row.avatar_url = userInfo.avatar_url || '';

    const elapsed = finishTimeMs || 0;
    const finishStatus = raceStatus === 'timeout' ? 'timeout' : 'finished';
    const newRemaining = Math.max(0, row.remaining_races - 1);

    await executeOp(req,
      `UPDATE race_queues SET status = 'finished', finish_time_ms = $1, finish_status = $2,
       remaining_races = $3, start_time_ms = NULL, paused_elapsed_ms = 0
       WHERE id = $4`,
      [elapsed, finishStatus, newRemaining, racerId]
    );

    // 同步更新 checkins 状态为 completed（防止下次扫码被"已签到"挡住）
    await executeOp(req,
      `UPDATE checkins SET status = 'completed', updated_at = NOW()
       WHERE user_id = $1 AND venue_id = $2 AND status NOT IN ('completed', 'cancelled')
       ORDER BY created_at DESC LIMIT 1`,
      [row.user_id, row.venue_id]
    );

    // 同步写入 race_records（成绩记录）
    if (row.user_id && row.venue_id) {
      await executeOp(req,
        `INSERT INTO race_records (id, race_id, player_id, score, duration_seconds, status, started_at, finished_at, operator_id)
         VALUES ($1, NULL, $2, $3, $4, $5, NOW() - INTERVAL $6/1000 SECOND, NOW(), $7)`,
        [uuidv4(), row.user_id, elapsed, Math.round(elapsed / 1000), finishStatus, elapsed, row.nickname]
      );
    }

    // 同步写入 race_results
    await writeRaceResult(req, row.user_id, row.venue_id, row.nickname, elapsed, finishStatus);

    // 发放比赛积分（从 system_config 读取 season_race_points）
    try {
      const pointValue = await getConfigInt('cfg_season_race_points', 0).catch(() => 0);
      if (pointValue > 0) {
        const operatorId = (req.user as any)?.operatorId || '';
        // 1. 写入 points_transactions（运营商库）
        await executeOp(req,
          `INSERT INTO points_transactions (id, user_id, operator_id, points, type, remark)
           VALUES ($1, $2, $3, $4, 'race_reward', '比赛积分奖励')`,
          [uuidv4(), row.user_id, operatorId, pointValue]
        );
        // 2. 更新 users 表全局积分
        await execute(
          `UPDATE users SET points = COALESCE(points, 0) + $1, updated_at = NOW() WHERE id = $2`,
          [pointValue, row.user_id]
        );
        // 3. 更新赛季积分
        const season = await queryOne<{ id: string }>(
          `SELECT id FROM seasons WHERE status = 1 ORDER BY created_at DESC LIMIT 1`
        );
        if (season) {
          const seasonUser = await queryOne<{ id: string }>(
            `SELECT id FROM season_user_info WHERE user_id = $1 AND season_id = $2`,
            [row.user_id, season.id]
          );
          if (seasonUser) {
            await execute(
              `UPDATE season_user_info SET points = points + $1, updated_at = NOW() WHERE id = $2`,
              [pointValue, seasonUser.id]
            );
          } else {
            await execute(
              `INSERT INTO season_user_info (id, user_id, season_id, level, exp, points)
               VALUES ($1, $2, $3, 1, 0, $4)`,
              [uuidv4(), row.user_id, season.id, pointValue]
            );
          }
        }
      }
    } catch (pointErr: any) {
      console.error('[比赛积分] 发放失败:', pointErr?.message || pointErr);
    }

    await broadcastAfterUpdate(req);

    return res.json({
      code: 0,
      message: '比赛结束',
      data: { racerId, elapsed, status: finishStatus },
    });
  } catch (e: any) {
    console.error('[Match] end error:', e.message);
    return res.status(500).json({ code: 500, message: '结束比赛失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/re-enter
 * 当前选手再玩一次（重置为 waiting 状态，不清除成绩）
 */
router.post('/match/re-enter', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    await executeOp(req,
      `UPDATE race_queues SET status = 'waiting', start_time_ms = NULL, paused_elapsed_ms = 0,
       finish_time_ms = NULL, finish_status = NULL
       WHERE id = $1`,
      [racerId]
    );

    await broadcastAfterUpdate(req);

    return res.json({ code: 0, message: '已重新叫号', data: null });
  } catch (e: any) {
    console.error('[Match] re-enter error:', e.message);
    return res.status(500).json({ code: 500, message: '重新叫号失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/call-next
 * 完成当前选手，放回队列末尾（仅当 remaining_races > 0 时放回）
 */
router.post('/match/call-next', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    const row = await queryOpOne<RacerRow>(req,
      `SELECT id, venue_id, remaining_races FROM race_queues WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }

    if (row.remaining_races > 0) {
      // 获取当前最大排队号 + 1
      const maxQ = await queryOpOne<{ max_q: number }>(req,
        `SELECT COALESCE(MAX(queue_number), 0) as max_q FROM race_queues WHERE venue_id = $1`,
        [row.venue_id]
      );
      const nextQ = (maxQ?.max_q ?? 0) + 1;
      await executeOp(req,
        `UPDATE race_queues SET status = 'waiting', queue_number = $2, start_time_ms = NULL,
         paused_elapsed_ms = 0, finish_time_ms = NULL, finish_status = NULL
         WHERE id = $1`,
        [racerId, nextQ]
      );
    }
    // remaining_races == 0 时，清除该记录（所有次数用尽）

    await broadcastAfterUpdate(req);

    return res.json({ code: 0, message: '已呼叫下一位', data: null });
  } catch (e: any) {
    console.error('[Match] call-next error:', e.message);
    return res.status(500).json({ code: 500, message: '呼叫下一位失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/malfunction
 * 故障处理（保留次数，计时归零，重置为 waiting）
 */
router.post('/match/malfunction', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    const row = await queryOpOne<RacerRow>(req,
      `SELECT id, user_id FROM race_queues
       WHERE id = $1`,
      [racerId]
    );
    // 从 common 库查 user 信息
    let malfunctionUserInfo: any = {};
    if (row) {
      try {
        malfunctionUserInfo = await queryOne<any>('SELECT nickname, avatar_url FROM users WHERE id = $1', [row.user_id]) || {};
      } catch { /* ignore */ }
    }
    if (row) { row.nickname = malfunctionUserInfo.nickname || ''; row.avatar_url = malfunctionUserInfo.avatar_url || ''; }

    await executeOp(req,
      `UPDATE race_queues SET status = 'malfunction', start_time_ms = NULL,
       paused_elapsed_ms = 0, fault_reason = '机器狗故障'
       WHERE id = $1`,
      [racerId]
    );

    // 广播故障事件到大屏
    broadcastToScreen({
      event: 'racer_malfunction',
      data: {
        racerName: row?.nickname || '选手',
        race_status: 'malfunction',
        currentRacer: null,
      },
    });

    return res.json({ code: 0, message: '故障已登记', data: null });
  } catch (e: any) {
    console.error('[Match] malfunction error:', e.message);
    return res.status(500).json({ code: 500, message: '故障处理失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/forfeit
 * 弃赛（扣减次数，放回队首）
 */
router.post('/match/forfeit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    let row = await queryOpOne<RacerRow>(req,
      `SELECT id, user_id, venue_id, remaining_races FROM race_queues
       WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }
    // 从 common 库查 user 信息
    try {
      const ui = await queryOne<any>('SELECT nickname, avatar_url FROM users WHERE id = $1', [row.user_id]) || {};
      row.nickname = ui.nickname || '';
      row.avatar_url = ui.avatar_url || '';
    } catch { /* ignore */ }

    const newRemaining = Math.max(0, row.remaining_races - 1);

    if (newRemaining > 0) {
      // 放回队首
      // 先把当前所有 waiting 选手的 queue_number + 1 腾出位置
      await executeOp(req,
        `UPDATE race_queues SET queue_number = queue_number + 1
         WHERE venue_id = $1 AND status = 'waiting' AND id != $2`,
        [row.venue_id, racerId]
      );
      await executeOp(req,
        `UPDATE race_queues SET status = 'waiting', queue_number = 1, remaining_races = $2,
         start_time_ms = NULL, paused_elapsed_ms = 0, finish_time_ms = NULL, finish_status = 'forfeit'
         WHERE id = $1`,
        [racerId, newRemaining]
      );
    } else {
      // 次数用尽，标记为 forfeit
      await executeOp(req,
        `UPDATE race_queues SET status = 'forfeit', remaining_races = 0, finish_status = 'forfeit'
         WHERE id = $1`,
        [racerId]
      );
    }

    broadcastToScreen({
      event: 'racer_forfeit',
      data: {
        racerName: row.nickname || '选手',
        currentRacer: null,
      },
    });

    return res.json({ code: 0, message: '弃赛已记录', data: null });
  } catch (e: any) {
    console.error('[Match] forfeit error:', e.message);
    return res.status(500).json({ code: 500, message: '弃赛处理失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/invalidate
 * 标记成绩无效（裁判专用操作）
 */
router.post('/match/invalidate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    let row = await queryOpOne<RacerRow>(req,
      `SELECT id, user_id, finish_time_ms, finish_status FROM race_queues
       WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }
    // 从 common 库查 user info
    try {
      const ui = await queryOne<any>('SELECT nickname FROM users WHERE id = $1', [row.user_id]) || {};
      row.nickname = ui.nickname || '';
    } catch { /* ignore */ }

    await executeOp(req,
      `UPDATE race_queues SET finish_status = 'invalid', fault_reason = '成绩无效'
       WHERE id = $1`,
      [racerId]
    );

    // 同步标记 race_records 为 invalid
    await executeOp(req,
      `UPDATE race_records SET status = 'invalid' WHERE player_id = $1 AND status = 'finished' ORDER BY created_at DESC LIMIT 1`,
      [row.nickname]
    );

    broadcastToScreen({
      event: 'racer_invalid',
      data: {
        racerName: row.nickname || '选手',
        racerId,
      },
    });

    return res.json({ code: 0, message: '成绩已标记为无效', data: null });
  } catch (e: any) {
    console.error('[Match] invalidate error:', e.message);
    return res.status(500).json({ code: 500, message: '标记无效失败', data: null });
  }
});

/**
 * POST /api/v1/referees/match/skip
 * 跳过当前排队的选手（放到下一位后面）
 */
router.post('/match/skip', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { racerId } = req.body;
    if (!racerId) {
      return res.status(400).json({ code: 400, message: '缺少 racerId', data: null });
    }

    const row = await queryOpOne<RacerRow>(req,
      `SELECT id, venue_id FROM race_queues WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }

    // 保持原 queue_number，仅更新状态为 skipped
    await executeOp(req,
      `UPDATE race_queues SET status = 'skipped' WHERE id = $1`,
      [racerId]
    );

    await broadcastAfterUpdate(req);

    return res.json({ code: 0, message: '已跳过', data: null });
  } catch (e: any) {
    console.error('[Match] skip error:', e.message);
    return res.status(500).json({ code: 500, message: '跳过失败', data: null });
  }
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
    const ref = await queryOpOne<{ id: string; phone: string }>(req, 
      'SELECT id, phone FROM referees WHERE user_id = $1', [userId]
    );
    if (!ref) return res.status(401).json({ code: 401, message: '未找到裁判记录', data: null });
    const refereeId = ref.id;

    // 查询今日签到
    const todayCheckin = await queryOpOne<any>(req, 
      `SELECT id, checkin_at, checkout_at, venue_id FROM attendance
       WHERE referee_id = $1 AND date(checkin_at) = CURDATE() ORDER BY checkin_at DESC LIMIT 1`,
      [refereeId]
    );

    // 查询关联的赛场信息
    let venueName = '';
    let venueAddress = '';
    if (todayCheckin?.venue_id) {
      const venueRow = await queryOpOne<{ name: string; address: string }>(req, 
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
    const refRow = await queryOpOne<{ id: string; phone: string }>(req, 
      'SELECT id, phone FROM referees WHERE user_id = $1', [userId]
    );
    if (!refRow) {
      return res.status(400).json({ code: 400, message: '未找到裁判记录，请先完成注册', data: null });
    }
    const refereeId = refRow.id;
    const phone = refRow.phone || req.user!.openid?.replace('mock_openid_', '') || '13800138000';

    // 检查今日是否已签到
    const existing = await queryOpOne<any>(req, 
      `SELECT id, checkout_at FROM attendance
       WHERE referee_id = $1 AND date(checkin_at) = CURDATE()`,
      [refereeId]
    );

    if (existing && !existing.checkout_at) {
      return res.status(400).json({ code: 400, message: '今日已签到，请勿重复签到', data: null });
    }

    // 执行签到记录插入
    const id = uuidv4();
    const now = new Date().toLocaleString('zh-CN');
    await executeOp(req, 
      'INSERT INTO attendance (id, referee_id, venue_id, checkin_at) VALUES ($1, $2, $3, NOW())',
      [id, refereeId, finalVenueId]
    );

    // 标记赛场已激活
    setVenueActive(true);
    cachedVenueStatus = 'open';

    // 回写 venues 表，确保 REST API 也返回正确状态
    try { await executeOp(req, 'UPDATE venues SET status = \'open\' LIMIT 1'); } catch (_) {}

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
    const venueRow = await queryOpOne<{ name: string; address: string }>(req, 
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
    const ref = await queryOpOne<{ id: string }>(req, 
      'SELECT id FROM referees WHERE user_id = $1', [userId]
    );
    if (!ref) return res.status(401).json({ code: 401, message: '未找到裁判记录', data: null });
    const refereeId = ref.id;

    const now = new Date().toLocaleString('zh-CN');
    await executeOp(req, 
      `UPDATE attendance SET checkout_at = NOW() WHERE referee_id = $1 AND date(checkin_at) = CURDATE() AND checkout_at IS NULL`,
      [refereeId]
    );

    // 赛场标记为未激活
    setVenueActive(false);
    cachedVenueStatus = 'closed';

    // 回写 venues 表
    try { await executeOp(req, 'UPDATE venues SET status = \'closed\' LIMIT 1'); } catch (_) {}

    // 清空排队队列和当前选手，重置所有比赛状态（新玩家需重新扫码排队）
    try {
      await executeOp(req,
        `UPDATE race_queues SET status = 'waiting', start_time_ms = NULL, paused_elapsed_ms = 0,
         finish_time_ms = NULL, finish_status = NULL, fault_reason = NULL
         WHERE venue_id = $1 AND status NOT IN ('finished','forfeit','invalid')`,
        [cachedVenueId]
      );
    } catch (_) {}

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
    const validation = await validateActivationCode(activationCode);
    if (!validation.valid) {
      return res.status(400).json({ code: 400, message: '激活码无效或已过期，请刷新大屏二维码', data: null });
    }

    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ code: 401, message: '未登录', data: null });

    // 2. 从 referees 表查真实 referee_id
    const refRow = await queryOpOne<{ id: string; venue_id: string | null }>(req, 
      'SELECT id, venue_id FROM referees WHERE user_id = $1', [userId]
    );
    if (!refRow) {
      return res.status(400).json({ code: 400, message: '未找到裁判记录，请先完成注册', data: null });
    }

    // 3. 取激活码绑定的场地（如果大屏传了 venueId 则用它，否则取第一个）
    let venue: { id: string; name: string; address: string } | null = null;
    if (validation.venueId) {
      venue = await queryOpOne<{ id: string; name: string; address: string }>(req, 
        'SELECT id, name, COALESCE(address, \'\') as address FROM venues WHERE id = $1',
        [validation.venueId]
      );
    }
    if (!venue) {
      venue = await queryOpOne<{ id: string; name: string; address: string }>(req, 
        'SELECT id, name, COALESCE(address, \'\') as address FROM venues LIMIT 1'
      );
    }
    if (!venue) {
      return res.status(500).json({ code: 500, message: '没有可用赛场', data: null });
    }

    // 3.5 验证裁判是否已绑定该赛场
    if (refRow.venue_id && refRow.venue_id !== venue.id) {
      return res.status(403).json({ code: 403, message: '抱歉，您并没有绑定本赛场', data: null });
    }

    // 4. 查今日是否已签到且未签退
    const existing = await queryOpOne<any>(req, 
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
    const now = new Date().toLocaleString('zh-CN');
    await executeOp(req, 
      'INSERT INTO attendance (id, referee_id, user_id, venue_id, checkin_at) VALUES ($1, $2, $3, $4, NOW())',
      [attendanceId, refRow.id, userId, venue.id]
    );

    // 6. 更新 referees 表最后签到时间
    await executeOp(req, 'UPDATE referees SET last_checkin_at = NOW() WHERE id = $1', [refRow.id]);

    // 7. 标记赛场已激活
    setVenueActive(true);
    cachedVenueStatus = 'open';
    cachedVenueName = venue.name;
    cachedVenueId = venue.id;

    // 回写 venues 表
    try { await executeOp(req, 'UPDATE venues SET status = \'open\' WHERE id = $1', [venue.id]); } catch (_) {}

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
    const ref = await queryOpOne<{ id: string }>(req, 'SELECT id FROM referees WHERE user_id = $1', [userId]);
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

// ============================================================
// 内部辅助函数（DB 查询版）
// ============================================================

let cachedVenueName = '机器狗迷宫赛场';
let cachedVenueId = '';

export function getCachedVenueId(): string {
  return cachedVenueId;
}
let cachedVenueStatus = 'inactive';

export function setVenueActive(active: boolean) {
  // venActive 由签到/签退控制
}

export async function initVenueCache(): Promise<void> { return; }

/** 获取当前大屏数据（从 DB 异步查询） */
export function getCurrentScreenData() {
  // 由 WebSocket handler 调用，返回基础结构；具体值由 broadcastAfterUpdate 推送
  // 注意：leaderboard 这里只是空占位，实际数据由大屏重连时通过 get_screen_data 消息异步拉取
  console.log('[WS] getCurrentScreenData: venueStatus=' + cachedVenueStatus + ' venueId=' + cachedVenueId);
  return {
    race_status: 'inactive',
    venue_status: cachedVenueStatus,
    current_racer: null,
    elapsed_ms: 0,
    start_time: null,
    next_racer: null,
    queue: [],
    venue_name: cachedVenueName,
    venue_id: cachedVenueId,
    leaderboard: [],
    last_result: undefined,
    timestamp: new Date().toLocaleString('zh-CN'),
  };
}

/** 从 DB 查询 leaderboard 并填充到 screen_data（用于大屏重连恢复） */
export async function fetchLeaderboardFromDb(venueId: string): Promise<any[]> {
  try {
    const { queryOp, query } = require('../config/database');
    const [rows] = await Promise.all([
      queryOp(
        `SELECT rq.* FROM race_queues rq
         WHERE rq.venue_id = $1 AND rq.status = 'finished' AND rq.finish_status != 'invalid' AND DATE(rq.created_at) = CURDATE()
         ORDER BY rq.finish_time_ms ASC LIMIT 10`,
        [venueId]
      ),
    ]);

    const leaderboardRows: any[] = rows;
    if (!leaderboardRows?.length) return [];

    // 批量查 users
    const allUserIds = leaderboardRows.map((r: any) => r.user_id).filter(Boolean);
    const userMap = new Map<string, { nickname: string; avatar_url: string }>();
    if (allUserIds.length > 0) {
      const placeholders = allUserIds.map(() => '?').join(',');
      const userRows: any[] = await query(
        `SELECT id, nickname, avatar_url FROM users WHERE id IN (${placeholders})`,
        allUserIds
      );
      for (const u of (userRows || [])) {
        userMap.set(u.id, { nickname: u.nickname, avatar_url: u.avatar_url });
      }
    }

    return leaderboardRows.map((r: any, i: number) => ({
      rank: i + 1,
      name: userMap.get(r.user_id)?.nickname || '选手',
      avatar: userMap.get(r.user_id)?.avatar_url || undefined,
      elapsed: r.finish_time_ms || 0,
      status: r.finish_status || 'finished',
    }));
  } catch (e: any) {
    console.error('[Match] fetchLeaderboardFromDb error:', e.message);
    return [];
  }
}

/** 从 DB 查询当前状态并广播 screen_data 到大屏 */
export async function broadcastAfterUpdate(req: Request) {
  if (!cachedVenueId) return;

  try {
    const venueId = cachedVenueId;

    // 分两段查询：race_queues 在运营商库，users 在 common 库
    const queueRows = await queryOp<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('waiting','called','skipped')
       ORDER BY rq.queue_number ASC`,
      [venueId]
    );

    const currentRow = await queryOpOne<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('racing','paused')
       ORDER BY rq.created_at DESC LIMIT 1`,
      [venueId]
    );

    const lastFinished = await queryOpOne<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status = 'finished' AND rq.finish_status != 'invalid'
       ORDER BY rq.updated_at DESC LIMIT 1`,
      [venueId]
    );

    const leaderboardRows = await queryOp<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status = 'finished' AND rq.finish_status != 'invalid'
       ORDER BY rq.finish_time_ms ASC LIMIT 10`,
      [venueId]
    );

    // 收集所有 user_id，批量从 common 库查 users
    const allUserIds = [
      ...queueRows.map(r => r.user_id),
      ...(currentRow ? [currentRow.user_id] : []),
      ...(lastFinished ? [lastFinished.user_id] : []),
      ...leaderboardRows.map(r => r.user_id),
    ].filter(Boolean);
    const broadcastUserMap = new Map<string, { nickname: string; avatar_url: string }>();
    if (allUserIds.length > 0) {
      try {
        const placeholders = allUserIds.map(() => '?').join(',');
        const userRows: any[] = await query(
          `SELECT id, nickname, avatar_url FROM users WHERE id IN (${placeholders})`,
          allUserIds
        );
        for (const u of (userRows || [])) {
          broadcastUserMap.set(u.id, { nickname: u.nickname, avatar_url: u.avatar_url });
        }
      } catch (e: any) {
        console.warn('[Broadcast] query users from common DB failed:', e.message);
      }
    }
    // 将 user info 合并回 rows
    for (const r of queueRows) { const u = broadcastUserMap.get(r.user_id); if (u) { r.nickname = u.nickname; r.avatar_url = u.avatar_url; } }
    if (currentRow) { const u = broadcastUserMap.get(currentRow.user_id); if (u) { currentRow.nickname = u.nickname; currentRow.avatar_url = u.avatar_url; } }
    if (lastFinished) { const u = broadcastUserMap.get(lastFinished.user_id); if (u) { lastFinished.nickname = u.nickname; lastFinished.avatar_url = u.avatar_url; } }
    for (const r of leaderboardRows) { const u = broadcastUserMap.get(r.user_id); if (u) { r.nickname = u.nickname; r.avatar_url = u.avatar_url; } }

    const currentRacer = currentRow ? {
      nickname: currentRow.nickname || '选手',
      queue_number: currentRow.queue_number,
      avatar_url: currentRow.avatar_url || undefined,
    } : null;

    const elapsed_ms = !currentRow ? 0
      : currentRow.status === 'racing' && currentRow.start_time_ms
        ? Date.now() - (currentRow.start_time_ms || 0)
        : (currentRow.paused_elapsed_ms || 0);

    const raceStatus = currentRow?.status === 'racing' ? 'racing'
      : currentRow?.status === 'paused' ? 'paused'
      : queueRows.length > 0 ? 'waiting' : 'idle';

    const lastResult = lastFinished?.finish_time_ms != null ? {
      racerName: lastFinished.nickname || '选手',
      racerAvatar: lastFinished.avatar_url || undefined,
      elapsed: lastFinished.finish_time_ms,
    } : undefined;

    broadcastToScreen({
      race_status: raceStatus,
      current_racer: currentRacer,
      elapsed_ms,
      start_time: currentRow?.start_time_ms || null,
      next_racer: queueRows.length > 0 ? { nickname: queueRows[0].nickname || '选手', queue_number: queueRows[0].queue_number } : null,
      queue: queueRows.map(q => ({ queue_number: q.queue_number, nickname: q.nickname || '选手', status: q.status, avatar_url: q.avatar_url || undefined })),
      venue_name: cachedVenueName,
      venue_id: cachedVenueId,
      leaderboard: leaderboardRows.map((r, i) => ({
        rank: i + 1,
        name: r.nickname || '选手',
        avatar: r.avatar_url || undefined,
        elapsed: r.finish_time_ms || 0,
        status: r.finish_status || 'finished',
      })),
      last_result: lastResult,
      timestamp: new Date().toLocaleString('zh-CN'),
    });
  } catch (e: any) {
    console.error('[Match] broadcastAfterUpdate error:', e.message);
  }
}

/** 写入比赛成绩 */
async function writeRaceResult(req: Request, userId: string, venueId: string, nickname: string | undefined, elapsed: number, status: string) {
  try {
    const existing = await queryOpOne<{ id: string }>(req,
      `SELECT id FROM race_results WHERE user_id = $1 AND created_at > NOW() - INTERVAL 10 SECOND`,
      [userId]
    );
    if (!existing) {
      await executeOp(req,
        `INSERT INTO race_results (id, checkin_id, user_id, venue_id, referee_id, score_ms, status, race_type, finished_at)
         VALUES ($1, NULL, $2, $3, $4, $5, 'completed', 1, NOW())`,
        [uuidv4(), userId, venueId, req.user!.userId, elapsed]
      );
    }
  } catch (e: any) {
    console.error('[Match] writeRaceResult error:', e.message);
    // 不阻塞主流程
  }
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

    const referee = await queryOpOne<{ id: string; user_id: string }>(req, 
      'SELECT id, user_id FROM referees WHERE id = $1', [id]);
    if (!referee) return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null });

    await executeOp(req, 'UPDATE referees SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3', [name, phone, id]);
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

    const existing = await queryOpOne<{ id: string }>(req, 
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

    fields.push('updated_at = NOW()');
    values.push(id);

    await queryOp(req, 
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
