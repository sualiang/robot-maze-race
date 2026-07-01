import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, generateSecurePassword } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();

// ============================================================
// Admin Operators 路由 — 运营商管理（RBAC 权限控制）
// ============================================================

interface Operator {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  status: string;
  venue_count: number;
  total_revenue: number;
  profit_share_rate: number;
  bank_account: string | null;
  bank_name: string | null;
  contact_person: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  company_address: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 查询字段列表 */
const SELECT_FIELDS = `id, name, phone, email, company_name, status,
  venue_count, total_revenue, profit_share_rate,
  bank_account, bank_name, contact_person,
  province, city, district, company_address,
  created_by, created_at, updated_at`;

/**
 * GET /api/v1/admin/operators
 * 运营商列表，支持 ?status=active|disabled 筛选
 * ops_admin 只能看到自己创建的运营商
 */
router.get('/', authMiddleware, checkPermission('operators:list'), async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (status === 'active' || status === 'disabled') {
      conditions.push('status = $' + (params.length + 1));
      params.push(status);
    }

    // ops_admin 数据隔离
    if (req.user?.admin_role_name === 'ops_admin' && req.user?.userId) {
      conditions.push('created_by = $' + (params.length + 1));
      params.push(req.user.userId);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const operators = await query<Operator>(
      `SELECT ${SELECT_FIELDS}
       FROM operators ${whereClause}
       ORDER BY created_at DESC`,
      params.length > 0 ? params : undefined
    );

    return res.json({ code: 0, message: 'ok', data: operators });
  } catch (error: any) {
    console.error('[AdminOperators] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取运营商列表失败', data: null });
  }
});

/**
 * GET /api/v1/admin/operators/:id
 * 运营商详情
 * ops_admin 只能查看自己创建的运营商
 */
router.get('/:id', authMiddleware, checkPermission('operators:read'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let query_sql = `SELECT ${SELECT_FIELDS} FROM operators WHERE id = $1`;
    const query_params: any[] = [id];

    // ops_admin 数据隔离
    if (req.user?.admin_role_name === 'ops_admin' && req.user?.userId) {
      query_sql += ' AND created_by = $2';
      query_params.push(req.user.userId);
    }

    const operator = await queryOne<Operator>(query_sql, query_params);

    if (!operator) {
      return res.status(404).json({ code: 404, message: '运营商不存在', data: null });
    }

    return res.json({ code: 0, message: 'ok', data: operator });
  } catch (error: any) {
    console.error('[AdminOperators] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取运营商详情失败', data: null });
  }
});

/**
 * POST /api/v1/admin/operators
 * 创建运营商
 * 自动记录创建者 ID（用于 ops_admin 数据隔离）
 */
router.post('/', authMiddleware, checkPermission('operators:create'), async (req: Request, res: Response) => {
  try {
    const {
      name,
      phone,
      contact_phone,
      email,
      company_name,
      profit_share_rate,
      bank_account,
      bank_name,
      contact_person,
      province,
      city,
      district,
      company_address,
    } = req.body;

    // 基础格式校验
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ code: 400, message: '运营商名称不能为空', data: null });
    }
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确（需11位手机号）', data: null });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确', data: null });
    }
    if (profit_share_rate != null && (typeof profit_share_rate !== 'number' || profit_share_rate < 0 || profit_share_rate > 100)) {
      return res.status(400).json({ code: 400, message: '分润比例需在0-100之间', data: null });
    }

    const id = uuidv4();
    const createdBy = req.user?.userId || null;

    // 检查手机号唯一性
    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM operators WHERE phone = $1',
      [phone]
    );
    if (existingUser) {
      return res.status(400).json({ code: 400, message: '该手机号已被使用', data: null });
    }

    // 读取系统默认分润比例
    const defaultProfitSetting = await queryOne<{ value: string }>(
      `SELECT value FROM settings WHERE \`key\` = 'default_profit_share_rate'`
    );
    const defaultProfitRate = defaultProfitSetting ? parseInt(defaultProfitSetting.value, 10) : 80;

    // 生成随机密码 8位
    const plainPassword = generateSecurePassword();
    const passwordHash = bcrypt.hashSync(plainPassword, 10);
    // 运营商用手机号作为登录账号
    const operatorUsername = phone;

    await query(
      `INSERT INTO operators (id, name, phone, contact_phone, email, company_name,
        profit_share_rate, bank_account, bank_name, contact_person,
        province, city, district, company_address, created_by,
        operator_username, operator_password_hash, password_change_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        id,
        name,
        phone || null,
        contact_phone || null,
        email || null,
        company_name || null,
        profit_share_rate ?? defaultProfitRate,
        bank_account || null,
        bank_name || null,
        contact_person || null,
        province || null,
        city || null,
        district || null,
        company_address || null,
        createdBy,
        operatorUsername,
        passwordHash,
        1,
      ]
    );

    // 同步创建 admin_users 账号（运营商角色的 admin 角色）
    const operatorAdminRoleId = 'role-admin';
    const adminUserId = uuidv4();
    await query(
      `INSERT INTO admin_users (id, username, password, nickname, phone, role_id, operator_id, status, first_login)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        adminUserId,
        operatorUsername,
        passwordHash,
        name,
        phone,
        operatorAdminRoleId,
        id,
        'active',
        1,
      ]
    );

    return res.status(201).json({
      code: 0,
      message: '运营商创建成功',
      data: {
        account: phone,
        password: plainPassword,
        operator_id: id,
      },
    });
  } catch (error: any) {
    console.error('[AdminOperators] create error:', error.message);
    return res.status(500).json({ code: 500, message: '创建运营商失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/operators/:id
 * 全量更新运营商信息
 * ops_admin 只能编辑自己创建的运营商
 */
router.put('/:id', authMiddleware, checkPermission('operators:edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      contact_phone,
      email,
      company_name,
      profit_share_rate,
      bank_account,
      bank_name,
      contact_person,
      province,
      city,
      district,
      company_address,
    } = req.body;

    // 基础格式校验
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确（需11位手机号）', data: null });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确', data: null });
    }
    if (profit_share_rate != null && (typeof profit_share_rate !== 'number' || profit_share_rate < 0 || profit_share_rate > 100)) {
      return res.status(400).json({ code: 400, message: '分润比例需在0-100之间', data: null });
    }

    // ops_admin 数据隔离
    let check_sql = 'SELECT id FROM operators WHERE id = $1';
    const check_params: any[] = [id];
    if (req.user?.admin_role_name === 'ops_admin' && req.user?.userId) {
      check_sql += ' AND created_by = $2';
      check_params.push(req.user.userId);
    }

    const existing = await queryOne<{ id: string }>(check_sql, check_params);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '运营商不存在', data: null });
    }

    // 读取系统默认分润比例
    const defProfitSetting = await queryOne<{ value: string }>(
      `SELECT value FROM settings WHERE \`key\` = 'default_profit_share_rate'`
    );
    const defaultProfitRate = defProfitSetting ? parseInt(defProfitSetting.value, 10) : 80;

    const operator = await queryOne<Operator>(
      `UPDATE operators
       SET name = $1, phone = $2, contact_phone = $3, email = $4, company_name = $5,
           profit_share_rate = $6, bank_account = $7, bank_name = $8,
           contact_person = $9, status = $10,
           province = $11, city = $12, district = $13, company_address = $14,
           updated_at = NOW()
       WHERE id = $15
       RETURNING ${SELECT_FIELDS}`,
      [
        name,
        phone || null,
        contact_phone || null,
        email || null,
        company_name || null,
        profit_share_rate ?? (defaultProfitRate || 80),
        bank_account || null,
        bank_name || null,
        contact_person || null,
        req.body.status || 'active',
        province || null,
        city || null,
        district || null,
        company_address || null,
        id,
      ]
    );

    // 注意：PUT 编辑时不会覆盖 operator_username / operator_password_hash

    return res.json({ code: 0, message: '运营商更新成功', data: operator! });
  } catch (error: any) {
    console.error('[AdminOperators] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新运营商失败', data: null });
  }
});

/**
 * PATCH /api/v1/admin/operators/:id
 * 部分更新（启用/禁用运营商）
 * body: { status: 'active' | 'disabled' }
 */
router.patch('/:id', authMiddleware, checkPermission('operators:edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'disabled'].includes(status)) {
      return res.status(400).json({ code: 400, message: '状态值无效（active/disabled）', data: null });
    }

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM operators WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '运营商不存在', data: null });
    }

    const operator = await queryOne<Operator>(
      `UPDATE operators SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${SELECT_FIELDS}`,
      [status, id]
    );

    return res.json({ code: 0, message: '运营商状态已更新', data: operator! });
  } catch (error: any) {
    console.error('[AdminOperators] patch error:', error.message);
    return res.status(500).json({ code: 500, message: '更新运营商状态失败', data: null });
  }
});

// ============================================================
// DELETE /api/v1/admin/operators/:id
// 删除运营商（仅 super_admin 可操作）
// ============================================================
// POST /api/v1/admin/operators/:id/reset-password
// 重置运营商管理员密码
router.post('/:id/reset-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 查找该运营商的 admin_users
    const adminUser = await queryOne<{ id: string; username: string }>(
      'SELECT id, username FROM admin_users WHERE operator_id = $1 ORDER BY created_at ASC LIMIT 1',
      [id]
    );
    if (!adminUser) {
      return res.status(404).json({ code: 404, message: '未找到该运营商的账号', data: null });
    }

    const plainPassword = generateSecurePassword();
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);

    await query(
      'UPDATE admin_users SET password = $1, first_login = 1 WHERE id = $2',
      [hashedPassword, adminUser.id]
    );

    return res.json({
      code: 0,
      message: '密码重置成功',
      data: { account: adminUser.username, password: plainPassword }
    });

  } catch (error: any) {
    console.error('[AdminOperators] reset-password error:', error.message);
    return res.status(500).json({ code: 500, message: '密码重置失败', data: null });
  }
});

router.delete('/:id', authMiddleware, checkPermission('operators:delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM operators WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '运营商不存在', data: null });
    }

    // 级联删除运营商关联的所有数据
    await query('DELETE FROM admin_users WHERE operator_id = $1', [id]);
    await query('DELETE FROM auth_sessions WHERE operator_id = $1', [id]);
    await query('DELETE FROM operator_members WHERE operator_id = $1', [id]);
    await query('DELETE FROM operator_sessions WHERE operator_id = $1', [id]);
    await query('DELETE FROM client_logs WHERE operator_id = $1', [id]);

    // 删除场馆及相关数据
    const venuesRs = await query<{ id: string }>('SELECT id FROM venues WHERE operator_id = $1', [id]);
    const venueIds = (venuesRs || []).map((r: any) => r.id);
    for (const vid of venueIds) {
      await query('UPDATE referees SET venue_id = NULL WHERE venue_id = $1', [vid]);
      await query('DELETE FROM races WHERE venue_id = $1', [vid]);
      await query('DELETE FROM race_records WHERE venue_id = $1', [vid]);
      await query('DELETE FROM race_attendance WHERE venue_id = $1', [vid]);
    }
    await query('DELETE FROM venues WHERE operator_id = $1', [id]);

    // 删除裁判（保留 users 记录但置空 role）
    const refRs = await query<{ user_id: string }>('SELECT user_id FROM referees WHERE operator_id = $1', [id]);
    const refereeUserIds = (refRs || []).map((r: any) => r.user_id);
    await query('DELETE FROM referees WHERE operator_id = $1', [id]);
    for (const uid of refereeUserIds) {
      await query('UPDATE users SET role = NULL WHERE id = $1', [uid]);
    }

    // 删除参赛包、票务
    await query('DELETE FROM race_packages WHERE operator_id = $1', [id]);
    await query('DELETE FROM user_tickets WHERE operator_id = $1', [id]);
    await query('DELETE FROM ticket_redemptions WHERE operator_id = $1', [id]);

    // 最后删除运营商本身
    await query('DELETE FROM operators WHERE id = $1', [id]);

    return res.json({ code: 0, message: '删除成功', data: null });
  } catch (error: any) {
    console.error('[AdminOperators] delete error:', error.message);
    return res.status(500).json({ code: 500, message: '删除运营商失败', data: null });
  }
});

export default router;
