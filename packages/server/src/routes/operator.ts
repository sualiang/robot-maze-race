import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query, queryOne, execute, generateSecurePassword } from '../config/database';
import { authMiddleware, AuthPayload } from '../middleware/auth';
import pcaCodeData from '../pca-code.json';


const router = Router();

// ============================================================
// Operator 路由 — 运营商后台页面专用（需 operator/admin 角色）
// ============================================================

function operatorOnly(req: Request, res: Response, next: Function): void {
  if (req.user?.role !== 'operator' && req.user?.role !== 'admin') {
    res.status(403).json({ code: 403, message: '仅运营商可操作', data: null });
    return;
  }
  next();
}

/**
 * POST /api/v1/operator/login
 * 运营商手机号+密码登录
 * @body phone - 手机号（必填）
 * @body password - 密码（必填）
 * @returns token + user info
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ code: 400, message: '手机号和密码不能为空', data: null });
    }

    // 从 operators 表查询运营商
    const operator = await queryOne<{
      id: string;
      name: string;
      phone: string;
      email: string | null;
      status: string;
    }>(
      `SELECT id, name, phone, email, status FROM operators WHERE phone = $1`,
      [phone]
    );

    if (!operator) {
      return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
    }

    if (operator.status === 'disabled') {
      return res.status(403).json({ code: 403, message: '账号已被禁用', data: null });
    }

    // 使用 bcrypt 验证密码
    const operator2 = await queryOne<{ password_hash: string }>(
      'SELECT operator_password_hash as password_hash FROM operators WHERE id = $1',
      [operator.id]
    );
    const bcrypt = require('bcryptjs');
    if (!operator2 || !operator2.password_hash || !bcrypt.compareSync(password, operator2.password_hash)) {
      return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
    }

    // 获取角色权限 — 先从 operator_members 查，没有则从 operators.role 推算
    let permissions: string[] = ['*'];
    let roleName = '';
    const member = await queryOne<{ role: string }>(
      'SELECT role FROM operator_members WHERE operator_id = $1 LIMIT 1',
      [operator.id]
    );
    if (member && member.role) {
      const roleRec = await queryOne<{ permissions: string; role_name: string }>(
        'SELECT permissions, role_name FROM admin_roles WHERE name = $1',
        [member.role]
      );
      if (roleRec) {
        permissions = typeof roleRec.permissions === 'object' ? roleRec.permissions : JSON.parse(roleRec.permissions);
        roleName = roleRec.role_name;
      }
    }

    // 生成 JWT（使用统一的 JWT secret，fallback 到 config.default）
    const token = jwt.sign(
      { userId: operator.id, role: 'operator', phone: operator.phone, operatorId: operator.id, permissions },
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    // 获取关联的场馆
    const venue = await queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM venues WHERE operator_id = $1 LIMIT 1',
      [operator.id]
    );

    return res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: operator.id,
          nickname: operator.name,
          name: operator.name,
          phone: operator.phone,
          venueId: venue?.id || null,
          venueName: venue?.name || null,
          permissions,
          role_name: roleName,
          role_id: member?.role || '',
        },
      },
    });
  } catch (error: any) {
    console.error('[Operator] login error:', error.message);
    return res.status(500).json({ code: 500, message: '登录失败', data: null });
  }
});

// ============================================================
// 运营商 RBAC — 角色与成员管理
// ============================================================

/**
 * 定义运营商预置角色
 */
// 运营商角色列表（启动时从数据库加载）
let OPERATOR_ROLES: Array<{ key: string; name: string; permissions: string[] }> = [];

/**
 * GET /api/v1/operator/rbac/roles
 * 获取运营商预定义角色列表
 */
router.get('/rbac/roles', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    // 运营商后台看到其可分配的角色：scope='operator' 或 scope='admin' 中非 super_admin 的角色
    // HEX(name/label) 绕过 mysql2 连接池 encoding 损坏 bug，JS 层 Buffer.from 解码
    const rows = await query<any>(
      `SELECT id AS \`key\`, HEX(name) AS name_hex, HEX(label) AS label_hex, permissions FROM admin_roles WHERE scope = 'operator' ORDER BY name ASC`
    );
    const result = rows.map((r: any) => {
      let perms: string[] = [];
      try { perms = typeof r.permissions === 'object' ? r.permissions : JSON.parse(r.permissions); } catch(e) { perms = []; }
      return {
        key: r.key,
        name: r.name_hex ? Buffer.from(r.name_hex, 'hex').toString('utf8') : '',
        label: r.label_hex ? Buffer.from(r.label_hex, 'hex').toString('utf8') : '',
        permissions: perms,
      };
    });
    return res.json({ code: 0, message: 'ok', data: result });
  } catch (error: any) {
    console.error('[OperatorRBAC] roles error:', error.message);
    return res.status(500).json({ code: 500, message: '获取角色列表失败', data: null });
  }
});

/**
 * GET /api/v1/operator/rbac/users
 * 获取该运营商下的所有管理员账号列表（分页 + 搜索）
 */
router.get('/rbac/users', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const {
      search,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['au.operator_id = ?'];
    const params: any[] = [operatorId];

    if (search) {
      conditions.push(`(au.name LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // 总数
    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM operator_members au ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // 分页数据（不返回 password）
    // HEX(name) 绕过 mysql2 连接池 encoding 损坏 bug，JS 层 Buffer.from 解码
    const users = await query<any>(
      `SELECT au.id, HEX(au.name) AS name_hex, au.phone,
              au.role as role_key, COALESCE(arr.label, '') as role_name, au.status, au.created_at
       FROM operator_members au
       LEFT JOIN admin_roles arr ON au.role = arr.name
       ${whereClause}
       ORDER BY au.created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // 映射角色名
    const roleMap: Record<string, string> = {};
    for (const r of OPERATOR_ROLES) {
      roleMap[r.key] = r.name;
    }

    const list = users.map((u: any) => {
      let nameStr = '';
      try {
        if (u.name_hex) {
          nameStr = Buffer.from(u.name_hex, 'hex').toString('utf8');
        }
      } catch { nameStr = u.name_hex || ''; }
      return {
        ...u,
        username: nameStr,
        nickname: nameStr,
        role_name: roleMap[u.role_key] || u.role_key,
      };
    });

    return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  } catch (error: any) {
    console.error('[OperatorRBAC] users list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取成员列表失败', data: null });
  }
});

/**
 * POST /api/v1/operator/rbac/users
 * 创建运营商管理员账号
 */
router.post('/rbac/users', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { phone, role_key } = req.body;

    if (!role_key) {
      return res.status(400).json({ code: 400, message: '角色不能为空', data: null });
    }
    if (!phone) {
      return res.status(400).json({ code: 400, message: '手机号不能为空', data: null });
    }

    // 校验角色是否合法
    const validKeys = OPERATOR_ROLES.map(r => r.key);
    if (!validKeys.includes(role_key)) {
      return res.status(400).json({ code: 400, message: '无效的角色', data: null });
    }

    // 手机号唯一性校验
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM operator_members WHERE phone = ?',
      [phone]
    );
    if (existing) {
      return res.status(409).json({ code: 409, message: '手机号已存在', data: null });
    }

    // 生成随机密码（含大写、小写、数字，10位）
    const plainPassword = generateSecurePassword();
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);
    const id = uuidv4();

    await query(
      `INSERT INTO operator_members (id, name, password_hash, phone, role, operator_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, phone, hashedPassword, phone, role_key, operatorId]
    );

    // 查角色名称和权限说明（HEX 绕过 mysql2 encoding 损坏）
    let roleLabel = '';
    let rolePermissions: string[] = [];
    try {
      const roleInfo = await queryOne<any>('SELECT name, HEX(label) AS label_hex, permissions FROM admin_roles WHERE id = $1', [role_key]);
      if (roleInfo) {
        const label = roleInfo.label_hex ? Buffer.from(roleInfo.label_hex, 'hex').toString('utf8') : '';
        const labelShort: Record<string, string> = { ops_admin: '运营', finance_admin: '财务' };
        roleLabel = labelShort[roleInfo.name] || label || '';
        rolePermissions = roleInfo.permissions || [];
      }
    } catch {}

    return res.status(201).json({
      code: 0,
      message: '成员创建成功',
      data: {
        account: phone,
        password: plainPassword,
        role_name: roleLabel,
        role_permissions: rolePermissions,
      }
    });
  } catch (error: any) {
    console.error('[OperatorRBAC] create user error:', error.message);
    return res.status(500).json({ code: 500, message: '创建成员失败', data: null });
  }
});

/**
 * PUT /api/v1/operator/rbac/users/:id
 * 编辑运营商管理员账号
 */
router.put('/rbac/users/:id', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { id } = req.params;
    const { phone, role_key, status } = req.body;

    // 只能编辑自己运营商下的成员
    const existing = await queryOne<{ id: string; operator_id: string }>(
      'SELECT id, operator_id FROM operator_members WHERE id = ?',
      [id]
    );
    if (!existing || existing.operator_id !== operatorId) {
      return res.status(404).json({ code: 404, message: '成员不存在', data: null });
    }

    // 校验角色
    if (role_key) {
      const validKeys = OPERATOR_ROLES.map(r => r.key);
      if (!validKeys.includes(role_key)) {
        return res.status(400).json({ code: 400, message: '无效的角色', data: null });
      }
    }

    const sets: string[] = [];
    const params: any[] = [];

    if (phone !== undefined) { sets.push('phone = ?'); params.push(phone); }
    if (role_key !== undefined) { sets.push('role = ?'); params.push(role_key); }
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }

    if (sets.length === 0) {
      return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    }

    sets.push("updated_at = NOW()");
    params.push(id);

    await query(
      `UPDATE operator_members SET ${sets.join(', ')} WHERE id = ?`,
      params
    );

    const updated = await queryOne<any>(
      `SELECT au.id, au.name AS username, au.name AS nickname, au.phone,
              au.role as role_key, COALESCE(arr.label, '') as role_name, au.status, au.created_at
       FROM operator_members au
       LEFT JOIN admin_roles arr ON au.role = arr.name
       WHERE au.id = ?`,
      [id]
    );

    const roleMap: Record<string, string> = {};
    for (const r of OPERATOR_ROLES) {
      roleMap[r.key] = r.name;
    }
    if (updated) {
      updated.role_name = roleMap[updated.role_key] || updated.role_key;
    }

    return res.json({ code: 0, message: '成员更新成功', data: updated });
  } catch (error: any) {
    console.error('[OperatorRBAC] update user error:', error.message);
    return res.status(500).json({ code: 500, message: '更新成员失败', data: null });
  }
});

/**
 * DELETE /api/v1/operator/rbac/users/:id
 * 删除运营商管理员账号
 */
router.delete('/rbac/users/:id', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { id } = req.params;

    const existing = await queryOne<{ id: string; operator_id: string; role_id: string }>(
      'SELECT id, operator_id, role FROM operator_members WHERE id = ?' as any,
      [id]
    );
    if (!existing || existing.operator_id !== operatorId) {
      return res.status(404).json({ code: 404, message: '成员不存在', data: null });
    }

    // 不允许删除最后一个总管理员
    if ((existing as any).role === 'op_super_admin') {
      const adminCount = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM operator_members WHERE role = ? AND operator_id = ?',
        ['op_super_admin', operatorId]
      );
      if (adminCount && adminCount.count <= 1) {
        return res.status(400).json({ code: 400, message: '不能删除最后一个总管理员', data: null });
      }
    }

    await query('DELETE FROM operator_members WHERE id = ?', [id]);

    return res.json({ code: 0, message: '成员已删除', data: null });
  } catch (error: any) {
    console.error('[OperatorRBAC] delete user error:', error.message);
    return res.status(500).json({ code: 500, message: '删除成员失败', data: null });
  }
});

/**
 * POST /api/v1/operator/rbac/users/:id/reset-password
 * 重置密码
 */
router.post('/rbac/users/:id/reset-password', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { id } = req.params;

    const existing = await queryOne<{ id: string; operator_id: string; phone: string; username: string }>(
      'SELECT id, operator_id, phone, name FROM operator_members WHERE id = ?',
      [id]
    );
    if (!existing || existing.operator_id !== operatorId) {
      return res.status(404).json({ code: 404, message: '成员不存在', data: null });
    }

    const plainPassword = generateSecurePassword();
    const hashed = bcrypt.hashSync(plainPassword, 10);
    await query(
      `UPDATE operator_members SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
      [hashed, id]
    );

    return res.json({
      code: 0,
      message: '密码重置成功',
      data: { account: existing.phone || '', password: plainPassword }
    });
  } catch (error: any) {
    console.error('[OperatorRBAC] reset password error:', error.message);
    return res.status(500).json({ code: 500, message: '密码重置失败', data: null });
  }
});

/**
 * GET /api/v1/operator/dashboard
 * 运营商仪表盘数据
 * @query venueId - 场馆 ID（必填）
 * @returns venue info + today stats
 */
router.get('/dashboard', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const venueId = req.query.venueId as string;

    if (!venueId) {
      return res.status(400).json({ code: 400, message: '缺少场馆 ID', data: null });
    }

    // 获取场馆信息
    const venue = await queryOne<{
      id: string;
      name: string;
      address: string;
      status: string;
    }>(
      'SELECT id, name, address, status FROM venues WHERE id = $1',
      [venueId]
    );

    // 获取今日统计数据
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const todayPlayers = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT ra.player_id) as count
       FROM race_attendance ra
       JOIN races r ON r.id = ra.race_id
       WHERE r.venue_id = $1 AND date(ra.check_in_at) = $2`,
      [venueId, today]
    );

    const raceStats = await queryOne<{
      total: number;
      completed: number;
      total_score: number;
    }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN rr.status = 'finished' THEN 1 ELSE 0 END) as completed,
         COALESCE(SUM(rr.score), 0) as total_score
       FROM race_records rr
       JOIN races r ON r.id = rr.race_id
       WHERE r.venue_id = $1 AND date(rr.created_at) = $2`,
      [venueId, today]
    );

    const totalCount = raceStats?.total || 0;
    const completedCount = raceStats?.completed || 0;
    const completionRate = totalCount > 0 ? completedCount / totalCount : 0;
    const totalScore = typeof raceStats?.total_score === 'number' ? raceStats.total_score : parseInt(String(raceStats?.total_score || '0'), 10);
    const avgScore = completedCount > 0 ? totalScore / completedCount : 0;

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        venue: venue || { name: '', address: '', status: 'open' },
        stats: {
          todayPlayers: parseInt(todayPlayers?.count || '0', 10),
          completionRate,
          avgScore,
        },
      },
    });
  } catch (error: any) {
    console.error('[Operator] dashboard error:', error.message);
    return res.status(500).json({ code: 500, message: '获取仪表盘数据失败', data: null });
  }
});

/**
 * GET /api/v1/operator/profile
 * 获取运营商个人信息
 */
router.get('/profile', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    const operator = await queryOne<{
      id: string;
      name: string;
      phone: string;
      email: string | null;
      company_name: string | null;
      status: string;
    }>(
      'SELECT id, name, phone, email, company_name, status FROM operators WHERE id = $1',
      [operatorId]
    );

    if (!operator) {
      // Fallback: return from auth user info
      return res.json({
        code: 0,
        message: 'ok',
        data: {
          user: {
            nickname: (req.user as any)?.phone || '运营商',
            name: (req.user as any)?.phone || '运营商',
            phone: (req.user as any)?.phone || '',
          },
        },
      });
    }

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        user: {
          nickname: operator.name,
          name: operator.name,
          phone: operator.phone,
          email: operator.email,
          companyName: operator.company_name,
        },
      },
    });
  } catch (error: any) {
    console.error('[Operator] profile error:', error.message);
    return res.status(500).json({ code: 500, message: '获取个人信息失败', data: null });
  }
});

/**
 * GET /api/v1/operator/venues
 * 获取运营商管理的场馆列表
 */
router.get('/venues', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    const rows = await query<any>(
      `SELECT id, name, address, city, district, status, open_time, close_time,
              max_queue_size as max_capacity, city, district
       FROM venues WHERE operator_id = $1
       ORDER BY created_at DESC`,
      [operatorId]
    );

    const list = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      city: r.city,
      district: r.district,
      status: r.status,
    }));

    return res.json({
      code: 0,
      message: 'ok',
      data: { list, venues: list },
    });
  } catch (error: any) {
    console.error('[Operator] venues list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取场馆列表失败', data: { list: [] } });
  }
});

/**
 * GET /api/v1/operator/venue/:id
 * 获取运营商单个场馆信息及配置
 */
router.get('/venue/:id', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const venueId = req.params.id;

    const venue = await queryOne<any>(
      `SELECT id, name, address, city, district, status, open_time, close_time,
              max_queue_size as max_capacity, description, maze_config, created_at, updated_at
       FROM venues WHERE id = $1`,
      [venueId]
    );

    if (!venue) {
      return res.status(404).json({ code: 404, message: '场馆不存在', data: null });
    }

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        venue: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          status: venue.status,
          mazeConfig: venue.maze_config,
        },
      },
    });
  } catch (error: any) {
    console.error('[Operator] venue detail error:', error.message);
    return res.status(500).json({ code: 500, message: '获取场馆信息失败', data: null });
  }
});

/**
 * PUT /api/v1/operator/venue/:id
 * 更新运营商单个场馆设置
 */
router.put('/venue/:id', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const venueId = req.params.id;
    const { name, address, mazeConfig } = req.body;

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM venues WHERE id = $1',
      [venueId]
    );

    if (!existing) {
      return res.status(404).json({ code: 404, message: '场馆不存在', data: null });
    }

    await query(
      `UPDATE venues SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        maze_config = COALESCE($3, maze_config),
        updated_at = $4
       WHERE id = $5`,
      [name || null, address || null, mazeConfig || null, new Date().toISOString(), venueId]
    );

    return res.json({
      code: 0,
      message: '保存成功',
      data: null,
    });
  } catch (error: any) {
    console.error('[Operator] venue update error:', error.message);
    return res.status(500).json({ code: 500, message: '保存失败', data: null });
  }
});

/**
 * PUT /api/v1/operator/venue/:id/status
 * 切换场馆营业/关闭状态
 */
router.put('/venue/:id/status', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const venueId = req.params.id;
    const { status } = req.body;

    if (!status || !['open', 'closed', 'maintenance'].includes(status)) {
      return res.status(400).json({ code: 400, message: '无效的状态值', data: null });
    }

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM venues WHERE id = $1',
      [venueId]
    );

    if (!existing) {
      return res.status(404).json({ code: 404, message: '场馆不存在', data: null });
    }

    await query(
      `UPDATE venues SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, new Date().toISOString(), venueId]
    );

    return res.json({
      code: 0,
      message: '场馆状态已更新',
      data: { id: venueId, status },
    });
  } catch (error: any) {
    console.error('[Operator] venue status error:', error.message);
    return res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// ============================================================
// 运营商财务额外端点
// ============================================================

/**
 * GET /api/v1/operator/finance/revenue
 * 营收明细
 */
router.get('/finance/revenue', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };

    // 查询该运营商下的每日营收统计
    const rows = await query<any>(
      `SELECT
         DATE(o.created_at) as date,
         COUNT(DISTINCT o.id) as order_count,
         COALESCE(SUM(o.amount_cents), 0) as revenue,
         COALESCE(SUM(s.commission_cents), 0) as settlement,
         CASE
           WHEN COALESCE(SUM(o.amount_cents), 0) = 0 THEN 'pending'
           ELSE 'settled'
         END as status
       FROM orders o
       LEFT JOIN settlements s ON s.order_id = o.id
       WHERE o.operator_id = $1
         AND (($2) IS NULL OR o.created_at >= $2)
         AND (($3) IS NULL OR o.created_at <= $3)
       GROUP BY DATE(o.created_at)
       ORDER BY date DESC`,
      [operatorId, start_date || null, end_date || null]
    );

    return res.json({
      code: 0,
      message: 'ok',
      data: { list: rows },
    });
  } catch (error: any) {
    console.error('[OperatorFinance] revenue error:', error.message);
    return res.status(500).json({ code: 500, message: '获取营收明细失败', data: { list: [] } });
  }
});

/**
 * GET /api/v1/operator/finance/settlements
 * 结算记录
 */
router.get('/finance/settlements', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    const rows = await query<any>(
      `SELECT id, order_id, amount_cents as amount, commission_cents, status, settled_at, created_at
       FROM settlements WHERE operator_id = $1
       ORDER BY created_at DESC`,
      [operatorId]
    );

    const list = rows.map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      period: r.created_at,
      amount: r.amount,
      commission_cents: r.commission_cents,
      status: r.status,
      settled_at: r.settled_at,
      created_at: r.created_at,
    }));

    return res.json({
      code: 0,
      message: 'ok',
      data: { list },
    });
  } catch (error: any) {
    console.error('[OperatorFinance] settlements error:', error.message);
    return res.status(500).json({ code: 500, message: '获取结算记录失败', data: { list: [] } });
  }
});

/**
 * GET /api/v1/operator/finance/payments
 * 支付流水
 */
router.get('/finance/payments', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));

    const rows = await query<any>(
      `SELECT o.id, o.order_no, o.amount_cents as amount, o.payment_method, o.status, o.paid_at, o.created_at
       FROM orders o
       WHERE o.operator_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [operatorId, pageSize]
    );

    const list = rows.map((r: any) => ({
      id: r.id,
      order_no: r.order_no,
      amount: r.amount,
      channel: r.payment_method || 'wechat_pay',
      status: r.status,
      paid_at: r.paid_at,
      created_at: r.created_at,
    }));

    return res.json({
      code: 0,
      message: 'ok',
      data: { list },
    });
  } catch (error: any) {
    console.error('[OperatorFinance] payments error:', error.message);
    return res.status(500).json({ code: 500, message: '获取支付流水失败', data: { list: [] } });
  }
});

/**
 * POST /api/v1/operator/finance/withdraw
 * 发起提现
 */
router.post('/finance/withdraw', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ code: 400, message: '无效的提现金额', data: null });
    }

    // 汇总待结算金额检查
    const pending = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM settlements WHERE operator_id = $1 AND status = 'settled'`,
      [operatorId]
    );

    if (!pending || pending.total < amount) {
      return res.status(400).json({
        code: 400,
        message: `可提现余额不足，当前可提现 ¥${((pending?.total || 0) / 100).toFixed(2)}`,
        data: null,
      });
    }

    // 创建提现记录
    await query(
      `UPDATE settlements SET status = 'withdrawn', settled_at = $1
       WHERE operator_id = $2 AND status = 'settled'
       AND amount_cents <= $3`,
      [new Date().toISOString(), operatorId, amount]
    );

    return res.json({
      code: 0,
      message: '提现申请已提交',
      data: null,
    });
  } catch (error: any) {
    console.error('[OperatorFinance] withdraw error:', error.message);
    return res.status(500).json({ code: 500, message: '提现失败', data: null });
  }
});

/**
 * GET /api/v1/operator/finance/export
 * 导出财务报表
 */
router.get('/finance/export', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    const rows = await query<any>(
      `SELECT
         DATE(rr.created_at) as date,
         v.name as venue_name,
         r.name as race_name,
         u.nickname as player_name,
         o.amount_cents as amount,
         o.status
       FROM venues v
       JOIN races r ON r.venue_id = v.id
       JOIN race_records rr ON rr.race_id = r.id
       JOIN users u ON rr.player_id = u.id
       LEFT JOIN orders o ON o.user_id = rr.player_id
       WHERE v.operator_id = $1
       ORDER BY rr.created_at DESC`,
      [operatorId]
    );

    // Build CSV
    const header = 'Date,Venue,Race,Player,Amount,Status\n';
    const csvRows = rows.map((r: any) =>
      `${r.date || ''},${r.venue_name || ''},${r.race_name || ''},${r.player_name || ''},${r.amount || 0},${r.status || ''}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=finance-${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(header + csvRows);
  } catch (error: any) {
    console.error('[OperatorFinance] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

/**
 * POST /api/v1/operator/profile/change-password
 * 运营商修改密码（前端兼容别名路由，与 /change-password 功能相同）
 * @body oldPassword - 当前密码
 * @body newPassword - 新密码
 * @returns { token } 新的 JWT token
 */
router.post('/profile/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空', data: null });
    }

    if (!newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({ code: 400, message: '密码需至少8位，包含大小写字母和数字', data: null });
    }

    if (newPassword === oldPassword) {
      return res.status(400).json({ code: 400, message: '新密码不能与旧密码相同', data: null });
    }

    // 查出运营商账号
    const operator = await queryOne<{
      id: string;
      operator_password_hash: string;
      password_change_required: number;
    }>(
      'SELECT id, operator_password_hash, password_change_required FROM operators WHERE id = $1',
      [userId]
    );

    if (!operator) {
      return res.status(404).json({ code: 404, message: '运营商账号不存在', data: null });
    }

    // 验证旧密码
    if (operator.operator_password_hash) {
      if (!bcrypt.compareSync(oldPassword, operator.operator_password_hash)) {
        return res.status(401).json({ code: 401, message: '旧密码错误', data: null });
      }
    }

    // 更新密码
    const newHash = bcrypt.hashSync(newPassword, 10);
    await query(
      `UPDATE operators SET operator_password_hash = $1, password_change_required = 0,
       updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    // 重新签发 token（去掉 passwordChangeRequired 标记）
    const payload: AuthPayload = {
      userId: operator.id,
      openid: '',
      role: 'operator',
      operatorId: operator.id,
    };
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

    return res.json({
      code: 0,
      message: '密码修改成功',
      data: { token },
    });
  } catch (error: any) {
    console.error('[Operator] profile/change-password error:', error.message);
    return res.status(500).json({ code: 500, message: '密码修改失败', data: null });
  }
});

/**
 * POST /api/v1/operator/change-password
 * 运营商修改密码（首次登录强制修改/主动修改）
 * @body oldPassword - 当前密码
 * @body newPassword - 新密码（长度>=6）
 * @returns { token } 新的 JWT token
 */
router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空', data: null });
    }

    if (!newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({ code: 400, message: '密码需至少8位，包含大小写字母和数字', data: null });
    }

    if (newPassword === oldPassword) {
      return res.status(400).json({ code: 400, message: '新密码不能与旧密码相同', data: null });
    }

    // 查出运营商账号
    const operator = await queryOne<{
      id: string;
      operator_password_hash: string;
      password_change_required: number;
    }>(
      'SELECT id, operator_password_hash, password_change_required FROM operators WHERE id = $1',
      [userId]
    );

    if (!operator) {
      return res.status(404).json({ code: 404, message: '运营商账号不存在', data: null });
    }

    // 验证旧密码
    if (operator.operator_password_hash) {
      if (!bcrypt.compareSync(oldPassword, operator.operator_password_hash)) {
        return res.status(401).json({ code: 401, message: '旧密码错误', data: null });
      }
    }

    // 更新密码
    const newHash = bcrypt.hashSync(newPassword, 10);
    await query(
      `UPDATE operators SET operator_password_hash = $1, password_change_required = 0,
       updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    // 重新签发 token（去掉 passwordChangeRequired 标记）
    const payload: AuthPayload = {
      userId: operator.id,
      openid: '',
      role: 'operator',
      operatorId: operator.id,
    };
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

    return res.json({
      code: 0,
      message: '密码修改成功',
      data: { token },
    });
  } catch (error: any) {
    console.error('[Operator] change-password error:', error.message);
    return res.status(500).json({ code: 500, message: '密码修改失败', data: null });
  }
});

/**
 * GET /api/v1/operator/regions
 * 返回全国省市区 JSON 数据（供前端 Cascader 使用）
 */
router.get('/regions', async (_req: Request, res: Response) => {
  try {
    return res.json({ code: 0, message: 'ok', data: pcaCodeData });
  } catch (error: any) {
    console.error('[Operator] regions error:', error.message);
    return res.status(500).json({ code: 500, message: '获取地区数据失败', data: null });
  }
});

/**
 * GET /api/v1/operator/settings
 * 运营商获取全局系统配置（只读，仅返回运营商需要的配置项）
 */
router.get('/profit-share-rate', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const row = await queryOne<{ value: string }>(
      `SELECT setting_value AS value FROM settings WHERE setting_key = 'default_profit_share_rate'`
    );
    return res.json({
      code: 0,
      message: 'ok',
      data: { rate: parseInt(row?.value || '80', 10) },
    });
  } catch (error: any) {
    console.error('[Operator] profit-share-rate error:', error.message);
    return res.status(500).json({ code: 500, message: '获取分润比例失败', data: null });
  }
});

router.get('/settings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const configs = await query<{ key: string; value: string }>(
      "SELECT `key`, value FROM system_config WHERE `key` IN ('cfg_max_queue_size')"
    );
    const data: Record<string, any> = {};
    for (const c of configs) {
      const key = c.key.replace(/^cfg_/, '');
      const num = Number(c.value);
      data[key] = isNaN(num) ? c.value : num;
    }
    return res.json({ code: 0, message: 'ok', data });
  } catch (error: any) {
    console.error('[Operator] settings error:', error.message);
    return res.status(500).json({ code: 500, message: '获取系统配置失败', data: null });
  }
});

// 初始化：从数据库加载运营商角色列表
async function initOperatorRoles() {
  try {
    // HEX 绕过 mysql2 encoding 损坏 bug
    const rows = await query<any>(
      `SELECT id AS \`key\`, HEX(label) AS name_hex, HEX(label) AS label_hex, permissions FROM admin_roles WHERE scope = 'operator' ORDER BY name ASC`
    );
    OPERATOR_ROLES = rows.map((r: any) => ({
      key: r.key,
      name: r.name_hex ? Buffer.from(r.name_hex, 'hex').toString('utf8') : '',
      label: r.label_hex ? Buffer.from(r.label_hex, 'hex').toString('utf8') : '',
      permissions: (() => { try { return typeof r.permissions === 'object' ? r.permissions : JSON.parse(r.permissions); } catch(e) { return []; } })()
    }));
    console.log('[Operator] 已加载', OPERATOR_ROLES.length, '个运营商角色');
  } catch (e: any) {
    console.warn('[Operator] 初始化角色列表失败:', e.message);
  }
}
initOperatorRoles();

// ============================================================
export default router;
