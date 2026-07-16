import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { hashSync } from '../config/bcrypt';
import { query, queryOne, generateSecurePassword } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// Admin RBAC 路由 — 角色和成员管理
// ============================================================

// ============================================================
// GET /api/v1/admin/rbac/roles
// 获取角色列表（总部 scope = 'admin'）
// ============================================================
router.get('/roles', authMiddleware, async (req: Request, res: Response) => {
  try {
    // HEX 绕过 mysql2 encoding 损坏 bug
    const rows = await query<any>(
      `SELECT id, name, HEX(label) AS label_hex, permissions, created_at
       FROM admin_roles
       WHERE scope = 'admin' AND id != 'role-super-admin'
       ORDER BY name ASC`
    );

    const result = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      label: r.label_hex ? Buffer.from(r.label_hex, 'hex').toString('utf8') : '',
      permissions: safeJsonParse(r.permissions, []),
      created_at: r.created_at,
    }));

    return res.json({ code: 0, message: 'ok', data: result });
  } catch (error: any) {
    console.error('[AdminRBAC] roles list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取角色列表失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/rbac/users
// 获取所有管理员账号列表（分页 + 搜索）
// ============================================================
router.get('/users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      search,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    // 总部管理员角色管理只显示 operator_id 为 null 的用户
    // 或 role_id 为 'role-admin'（总管理员，类似 13800000001 这种账号）
    conditions.push('(au.operator_id IS NULL OR au.role_id = $' + (params.length + 1) + ')');
    params.push('role-admin');

    if (search) {
      conditions.push(`(au.username LIKE $${params.length + 1} OR au.nickname LIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // 总数
    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM admin_users au ${whereClause}`,
      params.length > 0 ? params : undefined
    );
    const total = countResult?.count || 0;

    // 分页数据（JOIN admin_roles 获取角色名，不返回 password）
    // HEX 绕过 mysql2 encoding 损坏 bug
    const users = await query<any>(
      `SELECT au.id, au.username, au.nickname, au.email, au.phone,
              au.role_id, HEX(ar.label) AS role_name_hex, HEX(ar.label) AS role_label_hex,
              au.status, au.created_at, au.updated_at
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.id = au.role_id
       ${whereClause}
       ORDER BY au.created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const list = users.map((u: any) => ({
      ...u,
      role_name: u.role_name_hex ? Buffer.from(u.role_name_hex, 'hex').toString('utf8') : '',
      role_label: u.role_label_hex ? Buffer.from(u.role_label_hex, 'hex').toString('utf8') : '',
    }));

    return res.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  } catch (error: any) {
    console.error('[AdminRBAC] users list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取管理员列表失败', data: null });
  }
});

// ============================================================
// POST /api/v1/admin/rbac/users
// 创建管理员账号
// ============================================================
router.post('/users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { phone, role_id } = req.body;

    if (!phone) {
      return res.status(400).json({ code: 400, message: '手机号不能为空', data: null });
    }
    if (!role_id) {
      return res.status(400).json({ code: 400, message: '角色不能为空', data: null });
    }

    // 手机号唯一性校验
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM admin_users WHERE phone = $1',
      [phone]
    );
    if (existing) {
      return res.status(409).json({ code: 409, message: '手机号已存在', data: null });
    }

    // 校验 role 是否存在
    const role = await queryOne<{ id: string }>(
      'SELECT id FROM admin_roles WHERE id = $1',
      [role_id]
    );
    if (!role) {
      return res.status(400).json({ code: 400, message: '角色不存在', data: null });
    }

    // 生成随机密码 8位
    const plainPassword = generateSecurePassword();
    const hashedPassword = hashSync(plainPassword, 10);
    const id = uuidv4();

    await query(
      `INSERT INTO admin_users (id, username, password, nickname, email, phone, role_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, phone, hashedPassword, '', '', phone, role_id]
    );

    return res.status(201).json({
      code: 0,
      message: '管理员创建成功',
      data: {
        account: phone,
        password: plainPassword,
      }
    });
  } catch (error: any) {
    console.error('[AdminRBAC] create user error:', error.message);
    return res.status(500).json({ code: 500, message: '创建管理员失败', data: null });
  }
});

// ============================================================
// PUT /api/v1/admin/rbac/users/:id
// 编辑管理员账号
// ============================================================
router.put('/users/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nickname, email, phone, role_id, status, password } = req.body;

    const existing = await queryOne<{ id: string; username: string }>(
      'SELECT id, username FROM admin_users WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '管理员不存在', data: null });
    }

    // 如果传了 role_id，校验角色是否存在
    if (role_id) {
      const role = await queryOne<{ id: string }>(
        'SELECT id FROM admin_roles WHERE id = $1',
        [role_id]
      );
      if (!role) {
        return res.status(400).json({ code: 400, message: '角色不存在', data: null });
      }
    }

    const sets: string[] = [];
    const params: any[] = [];

    if (nickname !== undefined) { sets.push('nickname = $' + (params.length + 1)); params.push(nickname); }
    if (email !== undefined) { sets.push('email = $' + (params.length + 1)); params.push(email); }
    if (phone !== undefined) { sets.push('phone = $' + (params.length + 1)); params.push(phone); }
    if (role_id !== undefined) { sets.push('role_id = $' + (params.length + 1)); params.push(role_id); }
    if (status !== undefined) { sets.push('status = $' + (params.length + 1)); params.push(status); }
    if (password) {
      const hashed = hashSync(password, 10);
      sets.push('password = $' + (params.length + 1));
      params.push(hashed);
    }

    if (sets.length === 0) {
      return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    }

    sets.push("updated_at = NOW()");
    params.push(id);

    await query(
      `UPDATE admin_users SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );

    const updated = await queryOne<any>(
      `SELECT au.id, au.username, au.nickname, au.email, au.phone,
              au.role_id, HEX(ar.label) AS role_name_hex, HEX(ar.label) AS role_label_hex,
              au.status, au.created_at, au.updated_at
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.id = au.role_id
       WHERE au.id = $1`,
      [id]
    );

    if (updated) {
      updated.role_name = updated.role_name_hex ? Buffer.from(updated.role_name_hex, 'hex').toString('utf8') : '';
      updated.role_label = updated.role_label_hex ? Buffer.from(updated.role_label_hex, 'hex').toString('utf8') : '';
    }

    return res.json({ code: 0, message: '管理员更新成功', data: updated });
  } catch (error: any) {
    console.error('[AdminRBAC] update user error:', error.message);
    return res.status(500).json({ code: 500, message: '更新管理员失败', data: null });
  }
});

// ============================================================
// DELETE /api/v1/admin/rbac/users/:id
// 删除管理员账号（不允许删除最后一个超级管理员）
// ============================================================
router.delete('/users/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await queryOne<{ id: string; role_id: string }>(
      'SELECT id, role_id FROM admin_users WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '管理员不存在', data: null });
    }

    // 不允许删除自己
    if (id === req.user!.userId) {
      return res.status(400).json({ code: 400, message: '不能删除自己', data: null });
    }

    // 不允许删除最后一个超级管理员
    if (existing.role_id === 'role-super-admin') {
      const superAdminCount = await queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM admin_users WHERE role_id = 'role-super-admin'"
      );
      if (superAdminCount && superAdminCount.count <= 1) {
        return res.status(400).json({ code: 400, message: '不能删除最后一个超级管理员', data: null });
      }
    }

    await query('DELETE FROM admin_users WHERE id = $1', [id]);

    return res.json({ code: 0, message: '管理员已删除', data: null });
  } catch (error: any) {
    console.error('[AdminRBAC] delete user error:', error.message);
    return res.status(500).json({ code: 500, message: '删除管理员失败', data: null });
  }
});

// ============================================================
// POST /api/v1/admin/rbac/users/:id/reset-password
// 重置密码
// ============================================================
router.post('/users/:id/reset-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await queryOne<{ id: string; username: string }>(
      'SELECT id, username FROM admin_users WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '管理员不存在', data: null });
    }

    const plainPassword = generateSecurePassword();
    const hashed = hashSync(plainPassword, 10);
    console.log('[AdminRBAC] reset password:', { id, username: existing.username });
    await query(
      `UPDATE admin_users SET password = $1, first_login = 1, updated_at = NOW() WHERE id = $2`,
      [hashed, id]
    );
    console.log('[AdminRBAC] reset password done');

    return res.json({ code: 0, message: '密码重置成功', data: { account: existing.username, password: plainPassword } });
  } catch (error: any) {
    console.error('[AdminRBAC] reset password error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '密码重置失败: ' + error.message, data: null });
  }
});

/**
 * 安全解析 JSON 字符串，解析失败返回 fallback
 */
/**
 * 安全解析 JSON 字符串。
 * mysql2 解析 JSON 列时已自动返回 JS 对象，此时直接返回即可。
 */
function safeJsonParse(str: string | undefined | null | any[], fallback: any): any {
  if (Array.isArray(str)) return str;
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export default router;
