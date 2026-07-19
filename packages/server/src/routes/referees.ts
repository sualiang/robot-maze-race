import { Router, Request, Response } from 'express';
import { Pool as MysqlPool } from 'mysql2/promise';
import { broadcastToScreen, validateActivationCode } from '../ws/handler';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { hashSync } from '../config/bcrypt';
import { query, queryOne, execute, getOperatorPool } from '../config/database';
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
 * @body operator_id - admin 创建时必填，指定目标运营商 ID（operator 角色忽略此参数）
 * @returns 创建的裁判信息 + 系统生成的登录密码
 */
router.post('/create-by-operator', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可创建裁判', data: null });
    }

    const { name, phone, venue_id, operator_id } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ code: 400, message: '请填写裁判姓名和手机号', data: null });
    }

    // 随机生成 8 位数字密码
    const generatedPassword = Math.floor(10000000 + Math.random() * 90000000).toString();

    // 解析目标运营商 ID
    const targetOperatorId = operator_id || req.user?.operatorId;
    if (!targetOperatorId) {
      return res.status(400).json({ code: 400, message: 'admin 创建裁判需指定 operator_id', data: null });
    }

    // 校验 operator_id 对应的运营商库存在
    const opRegistry = await queryOne<{ db_name: string; operator_name: string }>(
      'SELECT db_name, operator_name FROM operators_registry WHERE operator_id = $1',
      [targetOperatorId]
    );
    if (!opRegistry || !opRegistry.db_name) {
      return res.status(400).json({ code: 400, message: '指定的运营商不存在或无独立数据库', data: null });
    }


    const opPool = getOperatorPool(opRegistry.db_name);

    // 检查手机号是否已被注册为裁判（在运营商隔离库）
    const [existingRows] = await opPool.execute(
      'SELECT id FROM referees WHERE phone = ?',
      [phone]
    );
    if ((existingRows as any[])?.length > 0) {
      return res.status(400).json({ code: 400, message: '该手机号已被注册为裁判', data: null });
    }

    // 检查手机号是否已存在 users 表
    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE phone = $1',
      [phone]
    );

    let userId: string;
    // 创建 users 记录（裁判支持手机号+密码登录）
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
    const hashedPwd = hashSync(generatedPassword, 10);
    await opPool.execute(
      `INSERT INTO referees (id, user_id, phone, password, is_first_login, venue_id, name, operator_id)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      [refereeId, userId, phone, hashedPwd, venue_id || null, name, targetOperatorId]
    );

    return res.json({
      code: 0,
      message: '裁判创建成功',
      data: {
        id: refereeId,
        user_id: userId,
        name,
        phone,
        password: generatedPassword,  // 明文返回给运营商展示
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
      operator_id,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;
    const role = req.user!.role;

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
    }

    // operator: 只看自己的运营商 + venue 过滤
    if (role === 'operator') {
      const owneOpId = (req.user as any)?.operatorId
        || (await queryOne<{ operator_id: string }>(
          'SELECT operator_id FROM operator_members WHERE id = $1',
          [req.user!.userId]
        ))?.operator_id
        || req.user!.userId;

      const operatorVenues = await refQueryOp<{ id: string }>(req,
        'SELECT id FROM venues WHERE operator_id = $1',
        [owneOpId]
      );
      const venueIds = operatorVenues.map((v) => v.id);
      if (venueIds.length > 0) {
        const ph = venueIds.map((_, i) => `$${paramIdx + i}`).join(', ');
        conditions.push(`(r.venue_id IN (${ph}) OR r.venue_id IS NULL)`);
        params.push(...venueIds);
        paramIdx += venueIds.length;
      } else {
        conditions.push('r.venue_id IS NULL');
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // admin: 遍历所有运营商库汇总（或按 ?operator_id 指定单个）
    // operator: 走 resolveOperatorDb 单库查询
    const isAdmin = role === 'admin';

    if (isAdmin) {
      // 收集所有目标运营商库的 db_name
      let targetDbNames: string[] = [];
      if (operator_id && (operator_id as string) !== '') {
        const opReg = await queryOne<{ db_name: string }>(
          'SELECT db_name FROM operators_registry WHERE operator_id = $1',
          [operator_id as string]
        );
        if (opReg?.db_name) targetDbNames = [opReg.db_name];
      } else {
        const allRegs = await query<{ db_name: string }>(
          'SELECT db_name FROM operators_registry WHERE db_name IS NOT NULL'
        );
        targetDbNames = allRegs.map((r: any) => r.db_name).filter(Boolean);
      }

      if (targetDbNames.length === 0) {
        return res.json({ code: 0, message: 'ok', data: { list: [], total: 0, page, pageSize } });
      }

      // 从每个运营商库拉 referees
      type RawRow = any;
      const allRows: RawRow[] = [];
      for (const dbName of targetDbNames) {
        try {
          const pool = getOperatorPool(dbName);
          const [countRows] = await pool.execute(
            `SELECT COUNT(*) as count FROM referees r ${whereClause.replace(/\$(\d+)/g, '?')}`,
            params
          ) as any[];
          if (((countRows as any[])?.[0]?.count || 0) > 0) {
            const [rows] = await pool.execute(
              `SELECT r.id, r.user_id, r.venue_id, r.status,
                      r.name, r.phone, r.id_number, r.cert_image,
                      r.last_checkin_at, r.created_at, r.updated_at,
                      r.apply_remark, r.review_remark, r.reviewed_at, r.operator_id,
                      v.name as venue_name
               FROM referees r
               LEFT JOIN venues v ON r.venue_id = v.id
               ${whereClause.replace(/\$(\d+)/g, '?')}
               ORDER BY r.created_at DESC`,
              params
            ) as any[];
            allRows.push(...(rows || []));
          }
        } catch { /* skip unreachable DB */ }
      }

      // JS 层排序 + 分页
      allRows.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const total = allRows.length;
      const paged = allRows.slice(offset, offset + pageSize);

      // 组装用户/运营商名称
      const userIds = [...new Set(paged.map((r: any) => r.user_id).filter(Boolean))];
      const opIds = [...new Set(paged.map((r: any) => r.operator_id).filter(Boolean))];
      const userMap: Record<string, any> = {};
      const opMap: Record<string, any> = {};

      if (userIds.length > 0) {
        try {
          const users = await query<any>(
            `SELECT id, nickname, avatar_url FROM users WHERE id IN (${userIds.map((_, i) => `$${i + 1}`).join(', ')})`,
            userIds
          );
          users.forEach((u: any) => { userMap[u.id] = u; });
        } catch { /* ignore */ }
      }
      if (opIds.length > 0) {
        try {
          const ops = await query<any>(
            `SELECT id, name FROM operators WHERE id IN (${opIds.map((_, i) => `$${i + 1}`).join(', ')})`,
            opIds
          );
          ops.forEach((o: any) => { opMap[o.id] = o; });
        } catch { /* ignore */ }
      }

      const list: RefereeWithUser[] = paged.map((r: any) => ({
        ...r,
        nickname: userMap[r.user_id]?.nickname || null,
        avatar_url: userMap[r.user_id]?.avatar_url || null,
        operator_name: opMap[r.operator_id]?.name || null,
      }));

      return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
    }

    // ---- operator 路径（直接用 JWT operatorId 连 op_* 库，不依赖 resolveOperatorDb） ----

    const opPool = await getOpPoolFromJwt(req);
    if (!opPool) {
      return res.json({ code: 0, message: 'ok', data: { list: [], total: 0, page, pageSize } });
    }

    const mysqlWhere = whereClause.replace(/\$(\d+)/g, '?');
    const [countRows] = await opPool.execute(
      `SELECT COUNT(*) as count FROM referees r ${mysqlWhere}`,
      params
    ) as any[];
    const total = parseInt((countRows as any[])?.[0]?.count || '0', 10);

    const [rows] = await opPool.execute(
      `SELECT r.id, r.user_id, r.venue_id, r.status,
              r.name,
              r.phone, r.id_number, r.cert_image,
              r.last_checkin_at, r.created_at, r.updated_at,
              r.apply_remark, r.review_remark, r.reviewed_at, r.operator_id,
              v.name as venue_name
       FROM referees r
       LEFT JOIN venues v ON r.venue_id = v.id
       ${mysqlWhere}
       ORDER BY r.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ) as any[];

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

    const list: RefereeWithUser[] = rows.map((r: any) => ({
      ...r,
      nickname: userMap[r.user_id]?.nickname || null,
      avatar_url: userMap[r.user_id]?.avatar_url || null,
      operator_name: opMap[r.operator_id]?.name || null,
    }));

    return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
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

    const referee = await refQueryOpOne<RefereeWithUser>(req, 
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

    const row = await refQueryOpOne<any>(req, 
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
    const venue = await refQueryOpOne<{ id: string }>(req, 
      'SELECT id FROM venues WHERE id = $1',
      [venue_id]
    );
    if (!venue) {
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null as any });
    }

    await refExecuteOp(req, 
      'UPDATE referees SET venue_id = $1, updated_at = NOW() WHERE id = $2',
      [venue_id, id]
    );
    const referee = await refQueryOpOne<Referee>(req, 
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
    const ref = await refQueryOpOne<{ user_id: string }>(req, 
      'SELECT user_id FROM referees WHERE id = $1', [id]
    );

    const result = await refExecuteOp(req, 
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
    const referee = await refQueryOpOne<{ id: string; user_id: string }>(req, 
      'SELECT id, user_id FROM referees WHERE id = $1',
      [id]
    );

    if (!referee) {
      return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null });
    }

    // 更新裁判表
    console.log('[Referees] status change:', { id, status, user_id: referee.user_id });
    await refExecuteOp(req, 'UPDATE referees SET status = $1 WHERE id = $2', [status, id]);
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
      const ref = await refQueryOpOne<{ venue_id: string }>(req,
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
    const queueRows = await refQueryOp<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('waiting','called','skipped')
       ORDER BY rq.queue_number ASC`,
      [vid]
    );

    const currentRow = await refQueryOpOne<RacerRow>(req,
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
      const first = await refQueryOpOne<RacerRow>(req,
        `SELECT id FROM race_queues WHERE status IN ('waiting','skipped') ORDER BY CASE WHEN status = 'skipped' THEN 0 ELSE 1 END, queue_number ASC LIMIT 1`, []
      );
      if (!first) {
        return res.status(400).json({ code: 400, message: '队列为空', data: null });
      }
      (req.body as any).racerId = first.id;
    }

    const rid = racerId || (req.body as any).racerId;

    // 如果已有当前选手在比赛，先放回队列
    await refExecuteOp(req,
      `UPDATE race_queues SET status = 'waiting', start_time_ms = NULL, paused_elapsed_ms = 0
       WHERE status IN ('called','malfunction') AND id != $1`,
      [rid]
    );

    // 更新该选手状态为 called（$1 先出现，避免 expandParams 重排参数）
    await refExecuteOp(req,
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

    const row = await refQueryOpOne<RacerRow>(req,
      `SELECT id, status, paused_elapsed_ms FROM race_queues WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }

    // 从 paused_elapsed_ms 继续计时
    const adjustStart = now - (row.paused_elapsed_ms || 0);
    await refExecuteOp(req,
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
    await refExecuteOp(req,
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

    const row = await refQueryOpOne<RacerRow>(req,
      `SELECT paused_elapsed_ms FROM race_queues WHERE id = $1 AND status = 'paused'`,
      [racerId]
    );
    if (!row) {
      return res.status(400).json({ code: 400, message: '当前不处于暂停状态', data: null });
    }

    const adjustStart = Date.now() - (row.paused_elapsed_ms || 0);
    await refExecuteOp(req,
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

    let row = await refQueryOpOne<RacerRow>(req,
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

    await refExecuteOp(req,
      `UPDATE race_queues SET status = 'finished', finish_time_ms = $1, finish_status = $2,
       remaining_races = $3, start_time_ms = NULL, paused_elapsed_ms = 0
       WHERE id = $4`,
      [elapsed, finishStatus, newRemaining, racerId]
    );

    // 同步写入 race_records（成绩记录）
    if (row.user_id && row.venue_id) {
      await refExecuteOp(req,
        `INSERT INTO race_records (id, race_id, player_id, score, duration_seconds, status, started_at, finished_at, operator_id)
         VALUES ($1, NULL, $2, $3, $4, $5, NOW() - INTERVAL $6/1000 SECOND, NOW(), $7)`,
        [uuidv4(), row.user_id, elapsed, Math.round(elapsed / 1000), finishStatus, elapsed, row.nickname]
      );
    }

    // 同步写入 race_results
    await writeRaceResult(req, row.user_id, row.venue_id, row.nickname, elapsed, finishStatus);

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

    await refExecuteOp(req,
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

    const row = await refQueryOpOne<RacerRow>(req,
      `SELECT id, venue_id, remaining_races FROM race_queues WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }

    if (row.remaining_races > 0) {
      // 获取当前最大排队号 + 1
      const maxQ = await refQueryOpOne<{ max_q: number }>(req,
        `SELECT COALESCE(MAX(queue_number), 0) as max_q FROM race_queues WHERE venue_id = $1`,
        [row.venue_id]
      );
      const nextQ = (maxQ?.max_q ?? 0) + 1;
      await refExecuteOp(req,
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

    const row = await refQueryOpOne<RacerRow>(req,
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

    await refExecuteOp(req,
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

    let row = await refQueryOpOne<RacerRow>(req,
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
      await refExecuteOp(req,
        `UPDATE race_queues SET queue_number = queue_number + 1
         WHERE venue_id = $1 AND status = 'waiting' AND id != $2`,
        [row.venue_id, racerId]
      );
      await refExecuteOp(req,
        `UPDATE race_queues SET status = 'waiting', queue_number = 1, remaining_races = $2,
         start_time_ms = NULL, paused_elapsed_ms = 0, finish_time_ms = NULL, finish_status = 'forfeit'
         WHERE id = $1`,
        [racerId, newRemaining]
      );
    } else {
      // 次数用尽，标记为 forfeit
      await refExecuteOp(req,
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

    let row = await refQueryOpOne<RacerRow>(req,
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

    await refExecuteOp(req,
      `UPDATE race_queues SET finish_status = 'invalid', fault_reason = '成绩无效'
       WHERE id = $1`,
      [racerId]
    );

    // 同步标记 race_records 为 invalid
    await refExecuteOp(req,
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

    const row = await refQueryOpOne<RacerRow>(req,
      `SELECT id, venue_id FROM race_queues WHERE id = $1`,
      [racerId]
    );
    if (!row) {
      return res.status(404).json({ code: 404, message: '选手未在队列中', data: null });
    }

    // 保持原 queue_number，仅更新状态为 skipped
    await refExecuteOp(req,
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
    const ref = await refQueryOpOne<{ id: string; phone: string }>(req, 
      'SELECT id, phone FROM referees WHERE user_id = $1', [userId]
    );
    if (!ref) return res.status(401).json({ code: 401, message: '未找到裁判记录', data: null });
    const refereeId = ref.id;

    // 查询今日签到
    const todayCheckin = await refQueryOpOne<any>(req, 
      `SELECT id, checkin_at, checkout_at, venue_id FROM attendance
       WHERE referee_id = $1 AND date(checkin_at) = CURDATE() ORDER BY checkin_at DESC LIMIT 1`,
      [refereeId]
    );

    // 查询关联的赛场信息
    let venueName = '';
    let venueAddress = '';
    if (todayCheckin?.venue_id) {
      const venueRow = await refQueryOpOne<{ name: string; address: string }>(req, 
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
    const refRow = await refQueryOpOne<{ id: string; phone: string }>(req, 
      'SELECT id, phone FROM referees WHERE user_id = $1', [userId]
    );
    if (!refRow) {
      return res.status(400).json({ code: 400, message: '未找到裁判记录，请先完成注册', data: null });
    }
    const refereeId = refRow.id;
    const phone = refRow.phone || req.user!.openid?.replace('mock_openid_', '') || '13800138000';

    // 检查今日是否已签到
    const existing = await refQueryOpOne<any>(req, 
      `SELECT id, checkout_at FROM attendance
       WHERE referee_id = $1 AND date(checkin_at) = CURDATE()`,
      [refereeId]
    );

    if (existing && !existing.checkout_at) {
      return res.json({ code: 200, message: '今日已签到，请勿重复签到', data: null });
    }

    // 执行签到记录插入
    const id = uuidv4();
    const now = new Date().toLocaleString('zh-CN');
    await refExecuteOp(req, 
      'INSERT INTO attendance (id, referee_id, venue_id, checkin_at) VALUES ($1, $2, $3, NOW())',
      [id, refereeId, finalVenueId]
    );

    // 标记赛场已激活
    setVenueActive(true);
    cachedVenueStatus = 'open';

    // 回写 venues 表，确保 REST API 也返回正确状态
    try { await refExecuteOp(req, 'UPDATE venues SET status = \'open\' LIMIT 1'); } catch (_) {}

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
    const venueRow = await refQueryOpOne<{ name: string; address: string }>(req, 
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

    // 直接用 JWT operatorId 连 op_* 库
    const pool = await getOpPoolFromJwt(req);
    if (!pool) {
      console.error('[check-out] getOpPoolFromJwt returned null, userId=', userId, 'operatorId=', (req.user as any)?.operatorId);
      return res.status(401).json({ code: 401, message: '未找到裁判记录', data: null });
    }

    // 从 referees 表查真实 referee_id
    const [refRows] = await pool.execute(
      'SELECT id FROM referees WHERE user_id = ? OR id = ? LIMIT 1', [userId, userId]
    ) as any[];
    const ref = (refRows as any[])?.[0];
    if (!ref) return res.status(401).json({ code: 401, message: '未找到裁判记录', data: null });
    const refereeId = ref.id;

    const now = new Date().toLocaleString('zh-CN');
    await pool.execute(
      'UPDATE attendance SET checkout_at = NOW() WHERE referee_id = ? AND date(checkin_at) = CURDATE() AND checkout_at IS NULL',
      [refereeId]
    );

    // 赛场标记为未激活
    setVenueActive(false);
    cachedVenueStatus = 'closed';

    // 回写 venues 表
    try { await pool.execute('UPDATE venues SET status = ? LIMIT 1', ['closed']); } catch (_) {}

    // 清空排队队列和当前选手
    try {
      await pool.execute(
        'UPDATE race_queues SET status = ?, start_time_ms = NULL, paused_elapsed_ms = 0, finish_time_ms = NULL, finish_status = NULL, fault_reason = NULL WHERE venue_id = ? AND status NOT IN (?,?,?)',
        ['waiting', cachedVenueId, 'finished', 'forfeit', 'invalid']
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
/**
 * POST /attendance/check-in-direct
 * 比赛专用直接签到 — 不依赖激活码/Redis
 * 裁判已登录 + venueId 匹配即可签到
 */
// ==================== op 库查询包装（从 JWT 取 operatorId 连库） ====================

async function refQueryOp<T>(req: Request, sql: string, params?: any[]): Promise<T[]> {
  const pool = await getOpPoolFromJwt(req);
  if (!pool) return [];
  sql = sql.replace(/\$(\d+)/g, '?');
  const [rows] = await pool.execute(sql, params || []) as any[];
  return rows as T[];
}

async function refQueryOpOne<T>(req: Request, sql: string, params?: any[]): Promise<T | null> {
  const pool = await getOpPoolFromJwt(req);
  if (!pool) return null;
  sql = sql.replace(/\$(\d+)/g, '?');
  const [rows] = await pool.execute(sql, params || []) as any[];
  return (rows as any[])?.length > 0 ? rows[0] as T : null;
}

async function refExecuteOp(req: Request, sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  const pool = await getOpPoolFromJwt(req);
  if (!pool) return { changes: 0, lastInsertRowid: 0 };
  sql = sql.replace(/\$(\d+)/g, '?');
  const [result] = await pool.execute(sql, params || []) as any;
  return { changes: result.affectedRows ?? 0, lastInsertRowid: result.insertId ?? 0 };
}

// ==================== 从 JWT 获取 op 库连接池 ====================

async function getOpPoolFromJwt(req: Request): Promise<MysqlPool | null> {
  const jwt = req.user as any;
  const opId = jwt?.operatorId;

  // 裁判 JWT 里没有 operatorId，遍历所有运营商库查找 referees 表
  // referees 表在 op_* 库里，不在 common 库
  if (!opId && jwt?.role === 'referee' && jwt?.userId) {
    try {
      const common = getCommonPool();
      const [allOps] = await common.query<any[]>(
        `SELECT db_name, operator_id FROM operators_registry WHERE db_name IS NOT NULL`
      );
      if (allOps && allOps.length > 0) {
        for (const opReg of allOps) {
          if (!opReg.db_name) continue;
          try {
            const pool = getOperatorPool(opReg.db_name);
            const [rows] = await pool.execute(
              `SELECT operator_id FROM referees WHERE user_id = ? LIMIT 1`,
              [jwt.userId]
            );
            if (rows && Array.isArray(rows) && rows.length > 0 && rows[0].operator_id) {
              return pool;
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* fall through */ }
    return null;
  }

  if (!opId) return null;

  // 1) 查询 operators_registry 获取真正的 db_name
  try {
    const regRow = await queryOne<{ db_name: string }>(
      'SELECT db_name FROM operators_registry WHERE operator_id = $1',
      [opId]
    );
    if (regRow?.db_name) {
      return getOperatorPool(regRow.db_name);
    }
  } catch { /* fall through if registry unavailable */ }

  // 2) fallback: 直接用 op_{operatorId}
  try { return getOperatorPool('op_' + opId); } catch { return null; }
}

router.post('/attendance/check-in-direct', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { venueId } = req.body;
    if (!venueId) {
      return res.status(400).json({ code: 400, message: '缺少 venueId', data: null });
    }

    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ code: 401, message: '未登录', data: null });

    // 裁判接口直接用 JWT operatorId 连接，不依赖 resolveOperatorDb
    const pool = await getOpPoolFromJwt(req);
    if (!pool) return res.status(400).json({ code: 400, message: '未找到裁判记录', data: null });

    // 1. 查 referee
    const [refRows] = await pool.execute(
      'SELECT id, venue_id FROM referees WHERE user_id = ? OR id = ?', [userId, userId]
    ) as any[];
    const refRow: { id: string; venue_id: string | null } | null = (refRows as any[])?.[0] || null;
    if (!refRow) {
      return res.status(400).json({ code: 400, message: '未找到裁判记录', data: null });
    }

    // 2. 验证 venueId 与裁判绑定一致
    if (refRow.venue_id && refRow.venue_id !== venueId) {
      return res.status(403).json({ code: 403, message: '场地不匹配', data: null });
    }

    // 3. 查 venue
    const [venueRows] = await pool.execute(
      'SELECT id, name, COALESCE(address, \'\') as address FROM venues WHERE id = ?', [venueId]
    ) as any[];
    const venue = (venueRows as any[])?.[0] || null;
    if (!venue) {
      return res.status(404).json({ code: 404, message: '场地不存在', data: null });
    }

    // 4. 查今日是否已签到且未签退
    const [attRows] = await pool.execute(
      'SELECT id FROM attendance WHERE referee_id = ? AND date(checkin_at) = CURDATE() AND checkout_at IS NULL LIMIT 1',
      [refRow.id]
    ) as any[];
    if ((attRows as any[])?.[0]) {
      return res.json({ code: 200, message: '今日已签到，请先签退', data: null });
    }

    // 5. 写入签到记录
    const attendanceId = uuidv4();
    await pool.execute(
      'INSERT INTO attendance (id, referee_id, user_id, venue_id, checkin_at) VALUES (?, ?, ?, ?, NOW())',
      [attendanceId, refRow.id, userId, venue.id]
    );
    await pool.execute('UPDATE referees SET last_checkin_at = NOW() WHERE id = ?', [refRow.id]);

    // 6. 标记赛场已激活
    setVenueActive(true);
    cachedVenueStatus = 'open';
    cachedVenueName = venue.name;
    cachedVenueId = venue.id;
    try { await pool.execute('UPDATE venues SET status = \'open\' WHERE id = ?', [venue.id]); } catch (_) {}

    // 7. 广播
    broadcastToScreen({ type: 'activated', data: { venue_name: venue.name, venue_id: venue.id } });
    broadcastToScreen({ type: 'screen_data', data: getCurrentScreenData() });

    return res.json({
      code: 0,
      message: '签到成功',
      data: { attendanceId, venueId: venue.id, venueName: venue.name },
    });
  } catch (error: any) {
    console.error('[Direct签到] 失败:', error.message);
    return res.status(500).json({ code: 500, message: '签到失败', data: null });
  }
});

router.post('/attendance/check-in-by-qr', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { activationCode, venueId: bodyVenueId } = req.body;

    const userId = req.user!.userId;
    if (!userId) return res.status(401).json({ code: 401, message: '未登录', data: null });

    // 裁判接口直接用 JWT operatorId 连接，不依赖 resolveOperatorDb
    const pool = await getOpPoolFromJwt(req);
    if (!pool) {
      console.log('[QR签到] getOpPoolFromJwt 返回 null, userId=' + userId + ', operatorId=' + (req.user as any)?.operatorId);
      return res.status(400).json({ code: 400, message: '未找到裁判记录，请先完成注册', data: null });
    }

    // 1. 从 referees 表查真实 referee_id + 绑定的 venue_id
    const [refRows] = await pool.execute(
      'SELECT id, venue_id FROM referees WHERE user_id = ? OR id = ?', [userId, userId]
    ) as any[];
    const refRow: { id: string; venue_id: string | null } | null = (refRows as any[])?.[0] || null;
    if (!refRow) {
      console.log('[QR签到] referees 表未查到 userId=' + userId);
      return res.status(400).json({ code: 400, message: '未找到裁判记录，请先完成注册', data: null });
    }

    // 2. 确定签到场地（优先级：激活码 > body venueId > 裁判绑定的 venue_id）
    let venueId: string | null = null;
    let venue: { id: string; name: string; address: string } | null = null;
    let usedFallback = false;

    // 尝试验证激活码（Redis）
    if (activationCode) {
      try {
        const validation = await validateActivationCode(activationCode);
        if (validation.valid && validation.venueId) {
          venueId = validation.venueId;
        }
      } catch (e: any) {
        console.warn('[QR签到] Redis 激活码验证异常:', e.message);
      }
    }

    // 降级1: body 直接传 venueId
    if (!venueId && bodyVenueId) {
      venueId = bodyVenueId;
      usedFallback = true;
      console.log('[QR签到] 降级：使用 body venueId');
    }

    // 降级2: 用裁判绑定的 venue_id
    if (!venueId && refRow.venue_id) {
      venueId = refRow.venue_id;
      usedFallback = true;
      console.log('[QR签到] 降级：使用裁判绑定 venue_id');
    }

    // 从 DB 查 venue 信息
    if (venueId) {
      const [vRows] = await pool.execute(
        'SELECT id, name, COALESCE(address, \'\') as address FROM venues WHERE id = ?',
        [venueId]
      ) as any[];
      venue = (vRows as any[])?.[0] || null;
    }

    // 最终降级：取第一个场地
    if (!venue) {
      const [vRows] = await pool.execute(
        'SELECT id, name, COALESCE(address, \'\') as address FROM venues LIMIT 1'
      ) as any[];
      venue = (vRows as any[])?.[0] || null;
      if (venue) {
        usedFallback = true;
        console.log('[QR签到] 降级：使用第一个可用场地');
      }
    }

    if (!venue) {
      console.log('[QR签到] 无可用赛场, usedFallback=' + usedFallback + ', refRow.venue_id=' + (refRow.venue_id || 'null'));
      return res.status(500).json({ code: 500, message: '没有可用赛场', data: null });
    }

    console.log('[QR签到] 最终 venue=' + venue.id + ' (' + venue.name + '), usedFallback=' + usedFallback + ', refRow.venue_id=' + (refRow.venue_id || 'null'));

    // 验证裁判是否已绑定该赛场（降级时跳过严格校验）
    if (!usedFallback && refRow.venue_id && refRow.venue_id !== venue.id) {
      console.log('[QR签到] 场地不匹配: ref.venue_id=' + refRow.venue_id + ' vs venue.id=' + venue.id);
      return res.status(403).json({ code: 403, message: '抱歉，您并没有绑定本赛场', data: null });
    }

    // 4. 查今日是否已签到且未签退
    const [attRows] = await pool.execute(
      'SELECT id FROM attendance WHERE referee_id = ? AND date(checkin_at) = CURDATE() AND checkout_at IS NULL LIMIT 1',
      [refRow.id]
    ) as any[];
    if ((attRows as any[])?.[0]) {
      console.log('[QR签到] 今日已签到, refRow.id=' + refRow.id);
      return res.json({ code: 200, message: '今日已签到，请先签退', data: null });
    }

    // 5. 写入 attendance 签到记录
    const attendanceId = uuidv4();
    const now = new Date().toLocaleString('zh-CN');
    await pool.execute(
      'INSERT INTO attendance (id, referee_id, user_id, venue_id, checkin_at) VALUES (?, ?, ?, ?, NOW())',
      [attendanceId, refRow.id, userId, venue.id]
    );

    // 6. 更新 referees 表最后签到时间
    await pool.execute('UPDATE referees SET last_checkin_at = NOW() WHERE id = ?', [refRow.id]);

    // 7. 标记赛场已激活
    setVenueActive(true);
    cachedVenueStatus = 'open';
    cachedVenueName = venue.name;
    cachedVenueId = venue.id;

    // 回写 venues 表
    try { await pool.execute('UPDATE venues SET status = \'open\' WHERE id = ?', [venue.id]); } catch (_) {}

    // 8. 广播大屏激活
    broadcastToScreen({
      type: 'activated',
      data: { venue_name: venue.name, venue_id: venue.id },
    });

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
    const ref = await refQueryOpOne<{ id: string }>(req, 'SELECT id FROM referees WHERE user_id = $1', [userId]);
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
let cachedVenueStatus = 'inactive';

export function setVenueActive(active: boolean) {
  // venActive 由签到/签退控制
}

export async function initVenueCache(): Promise<void> { return; }

/** 获取当前大屏数据（从 DB 异步查询） */
export function getCurrentScreenData() {
  // 由 WebSocket handler 调用，返回基础结构；具体值由 broadcastAfterUpdate 推送
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

/** 从 DB 查询当前状态并广播 screen_data 到大屏 */
async function broadcastAfterUpdate(req: Request) {
  if (!cachedVenueId) return;

  try {
    const venueId = cachedVenueId;

    // 分两段查询：race_queues 在运营商库，users 在 common 库
    const queueRows = await refQueryOp<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('waiting','called','skipped')
       ORDER BY rq.queue_number ASC`,
      [venueId]
    );

    const currentRow = await refQueryOpOne<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('racing','paused')
       ORDER BY rq.created_at DESC LIMIT 1`,
      [venueId]
    );

    const lastFinished = await refQueryOpOne<RacerRow>(req,
      `SELECT rq.* FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status = 'finished' AND rq.finish_status != 'invalid'
       ORDER BY rq.updated_at DESC LIMIT 1`,
      [venueId]
    );

    const leaderboardRows = await refQueryOp<RacerRow>(req,
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
    const existing = await refQueryOpOne<{ id: string }>(req,
      `SELECT id FROM race_results WHERE user_id = $1 AND created_at > NOW() - INTERVAL 10 SECOND`,
      [userId]
    );
    if (!existing) {
      await refExecuteOp(req,
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

    const referee = await refQueryOpOne<{ id: string; user_id: string }>(req, 
      'SELECT id, user_id FROM referees WHERE id = $1', [id]);
    if (!referee) return res.status(404).json({ code: 404, message: '裁判记录不存在', data: null });

    await refExecuteOp(req, 'UPDATE referees SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3', [name, phone, id]);
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

    const existing = await refQueryOpOne<{ id: string }>(req, 
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

    await refQueryOp(req, 
      `UPDATE referees SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    return res.json({ code: 0, message: '裁判信息已更新', data: null });
  } catch (error: any) {
    console.error('[Referees] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新裁判信息失败', data: null });
  }
});


/**
 * POST /api/v1/referees/register
 * 裁判注册（运营商后台专用）
 * @header Authorization: Bearer <operator_token>
 * @body phone - 手机号（必填，11位）
 * @body name - 姓名（必填）
 * @returns 裁判信息 + 系统生成的登录密码
 */
router.post('/register', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { phone, name } = req.body;
    const operatorId = (req.user as any)?.operatorId;

    if (!operatorId) {
      return res.status(400).json({ code: 400, message: '缺少运营商ID', data: null });
    }
    if (!phone || !name) {
      return res.status(400).json({ code: 400, message: '请填写手机号和姓名', data: null });
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });
    }

    // 查找运营商库
    const opRegistry = await queryOne<{ db_name: string; operator_name: string }>(
      'SELECT db_name, operator_name FROM operators_registry WHERE operator_id = $1',
      [operatorId]
    );
    if (!opRegistry || !opRegistry.db_name) {
      return res.status(400).json({ code: 400, message: '指定的运营商不存在', data: null });
    }

    const opPool = getOperatorPool(opRegistry.db_name);

    // 检查手机号是否已被注册（当前运营商库）
    const [existingRefs] = await opPool.execute(
      'SELECT id FROM referees WHERE phone = ?',
      [phone]
    );
    if ((existingRefs as any[])?.length > 0) {
      return res.status(400).json({ code: 400, message: '该手机号已被注册为裁判', data: null });
    }

    // 随机生成 8 位数字密码
    const generatedPassword = Math.floor(10000000 + Math.random() * 90000000).toString();

    // 创建/更新 users 记录
    let userId: string;
    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE phone = $1',
      [phone]
    );
    if (!existingUser) {
      userId = uuidv4();
      await execute(
        `INSERT INTO users (id, openid, nickname, phone, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'ref_' + phone, name, phone, 'referee']
      );
    } else {
      userId = existingUser.id;
      await execute(
        `UPDATE users SET nickname = $1, role = $2, updated_at = NOW() WHERE id = $3`,
        [name, 'referee', userId]
      );
    }

    const refereeId = uuidv4();
    const hashedPwd = hashSync(generatedPassword, 10);
    await opPool.execute(
      `INSERT INTO referees (id, user_id, phone, password, is_first_login, name, operator_id)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [refereeId, userId, phone, hashedPwd, name, operatorId]
    );

    return res.status(201).json({
      code: 0,
      message: '裁判注册成功',
      data: {
        id: refereeId,
        user_id: userId,
        name,
        phone,
        password: generatedPassword,
        operator_id: operatorId,
      },
    });
  } catch (error: any) {
    console.error('[Referees] register error:', error.message);
    return res.status(500).json({ code: 500, message: '注册失败: ' + error.message, data: null });
  }
});
export default router;
