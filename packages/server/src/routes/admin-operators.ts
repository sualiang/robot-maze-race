import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, queryOp, queryOpOne, executeOp, execute, transaction, generateSecurePassword, createOperatorDatabase, getBaseOptions, closeOperatorPool } from '../config/database';
import mysql from 'mysql2/promise';
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
    const defaultProfitSetting = await queryOne<any>(
      `SELECT setting_value AS \`value\` FROM settings WHERE setting_key = 'default_profit_share_rate'`
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

    // 运营商管理后台登录使用的是运营商端（operator login），不应该在 admin_users 中创建记录
    // 之前这里错误地为运营商创建了 role-admin 权限的 admin_users 账号，
    // 导致运营商可以用自己的手机号直接登录总部后台——严重安全漏洞
    // 已删除此段代码（2026-07-17）

    // Card 4: 自动创建独立数据库 + 执行 schema
    const dbName = `op_${id}`;
    let createDbWarning: string | undefined;
    try {
      await createOperatorDatabase(dbName);
      // 注册到 operators_registry（公共库）
      await query(
        `INSERT INTO operators_registry (id, operator_id, db_name, operator_name)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), id, dbName, name]
      );
      console.log(`[AdminOp] Operator DB created: ${dbName}`);
    } catch (dbErr: any) {
      console.warn('[AdminOp] Failed to create operator DB, operator will still work but needs manual DB setup:', dbErr?.message);
      createDbWarning = '独立数据库创建失败，运营商基本功能不受影响，请通知管理员手动建库';
    }

    const response: any = {
      code: 0,
      message: '运营商创建成功',
      data: {
        account: phone,
        password: plainPassword,
        operator_id: id,
      },
    };
    if (createDbWarning) {
      response.warning = createDbWarning;
    }

    return res.status(201).json(response);
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
    const defProfitSetting = await queryOne<any>(
      `SELECT setting_value AS \`value\` FROM settings WHERE setting_key = 'default_profit_share_rate'`
    );
    const defaultProfitRate = defProfitSetting ? parseInt(defProfitSetting.value, 10) : 80;

    // MySQL 不支持 RETURNING，先 UPDATE 再 SELECT
    await query(
      `UPDATE operators
       SET name = $1, phone = $2, contact_phone = $3, email = $4, company_name = $5,
           profit_share_rate = $6, bank_account = $7, bank_name = $8,
           contact_person = $9, status = $10,
           province = $11, city = $12, district = $13, company_address = $14,
           updated_at = NOW()
       WHERE id = $15`,
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

    // MySQL 不支持 RETURNING，手动 SELECT 返回更新后的数据
    const updated = await queryOne<Operator>(
      `SELECT ${SELECT_FIELDS} FROM operators WHERE id = $1`,
      [id]
    );
    
    return res.json({ code: 0, message: '运营商更新成功', data: updated! });
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

    // MySQL 不支持 RETURNING，先 UPDATE 再 SELECT
    await query(
      `UPDATE operators SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, id]
    );
    const operator = await queryOne<Operator>(
      `SELECT ${SELECT_FIELDS} FROM operators WHERE id = $1`,
      [id]
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

    // 先确认运营商存在
    const operator = await queryOne<{ id: string; operator_username: string }>(
      'SELECT id, operator_username FROM operators WHERE id = $1',
      [id]
    );
    if (!operator) {
      return res.status(404).json({ code: 404, message: '运营商不存在', data: null });
    }

    const plainPassword = generateSecurePassword();
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);

    // 尝试更新 admin_users（可能没有 operator_id 关联，改用 operator_username 匹配）
    const adminUser = await queryOne<{ id: string }>(
      'SELECT id FROM admin_users WHERE operator_id = $1 OR username = $2 ORDER BY created_at ASC LIMIT 1',
      [id, operator.operator_username]
    );
    if (adminUser) {
      await query(
        'UPDATE admin_users SET password = $1, first_login = 1 WHERE id = $2',
        [hashedPassword, adminUser.id]
      );
    }

    // 更新 operators 表的密码
    await query(
      'UPDATE operators SET operator_password_hash = $1, password_change_required = 1 WHERE id = $2',
      [hashedPassword, id]
    );

    return res.json({
      code: 0,
      message: '密码重置成功',
      data: { account: operator.operator_username, password: plainPassword }
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

    // 1) 先查运营商库中需要清理的数据
    const venuesRs = await queryOp<any[]>(req, 'SELECT id FROM venues WHERE operator_id = $1', [id]);
    const venueIds = (venuesRs || []).map((r: any) => r.id);
    const refRs = await queryOp<any[]>(req, 'SELECT user_id FROM referees WHERE operator_id = $1', [id]);
    const refereeUserIds = (refRs || []).map((r: any) => r.user_id);

    // 2) 删除运营商库中的数据（独立DB，不用事务）
    await queryOp(req, 'DELETE FROM operator_sessions WHERE operator_id = $1', [id]);
    for (const vid of venueIds) {
      await queryOp(req, 'UPDATE referees SET venue_id = NULL WHERE venue_id = $1', [vid]);
      await queryOp(req, 'DELETE FROM races WHERE venue_id = $1', [vid]);
      await queryOp(req, 'DELETE FROM race_records WHERE venue_id = $1', [vid]);
      await queryOp(req, 'DELETE FROM race_attendance WHERE venue_id = $1', [vid]);
    }
    await queryOp(req, 'DELETE FROM venues WHERE operator_id = $1', [id]);
    await queryOp(req, 'DELETE FROM referees WHERE operator_id = $1', [id]);
    await queryOp(req, 'DELETE FROM race_packages WHERE operator_id = $1', [id]);
    await queryOp(req, 'DELETE FROM ticket_redemptions WHERE operator_id = $1', [id]);

    // 3) 事务中删除公共库的数据
    await transaction(async (tx: any) => {
      await tx.query('DELETE FROM admin_users WHERE operator_id = $1', [id]);
      try { await tx.query('DELETE FROM auth_sessions WHERE operator_id = $1', [id]); } catch { /* ignore */ }
      try { await tx.query('DELETE FROM client_logs WHERE operator_id = $1', [id]); } catch { /* ignore */ }
      await tx.execute('DELETE FROM operator_members WHERE operator_id = $1', [id]);
      for (const uid of refereeUserIds) {
        await tx.query('UPDATE users SET role = NULL WHERE id = $1', [uid]);
      }
      await tx.query('DELETE FROM operators WHERE id = $1', [id]);
    });

    // 4) 先读 registry 获取 db_name（删前快照），再删除 registry + DROP 运营商独立库（事务外）
    let dbName = `op_${id}`; // fallback
    try {
      const regRow = await queryOne<{ db_name: string }>(
        'SELECT db_name FROM operators_registry WHERE operator_id = $1',
        [id]
      );
      if (regRow && regRow.db_name) {
        dbName = regRow.db_name;
      }
    } catch (e: any) {
      console.error('[AdminOperators] DROP: failed to read db_name from registry:', e.message);
    }
    try {
      await execute('DELETE FROM operators_registry WHERE operator_id = $1', [id]);
    } catch (e: any) {
      console.error('[AdminOperators] delete registry error:', e.message);
    }

    // DROP DATABASE（raw connection，事务外，失败不影响主流程）
    try {
      const baseOpts = getBaseOptions();
      const adminConn = await mysql.createConnection({
        host: baseOpts.host,
        port: baseOpts.port,
        user: baseOpts.user,
        password: baseOpts.password,
        charset: baseOpts.charset,
      });
      try {
        await adminConn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``);
        console.log(`[AdminOperators] Dropped operator DB: ${dbName}`);
      } finally {
        await adminConn.end();
      }
      // 关闭连接池
      await closeOperatorPool(dbName);
    } catch (e: any) {
      console.error('[AdminOperators] DROP DATABASE error (operator data already deleted):', e.message);
    }

    return res.json({ code: 0, message: '删除成功', data: null });
  } catch (error: any) {
    console.error('[AdminOperators] delete error:', error.message);
    if (error.message) {
      console.error('[AdminOperators] delete detail:', error.message.substring(0, 500));
    }
    return res.status(500).json({ code: 500, message: '删除运营商失败: ' + (error.message || '数据库执行异常'), data: null });
  }
});

export default router;
