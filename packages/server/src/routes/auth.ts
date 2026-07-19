import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { compareSync, hashSync } from '../config/bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { queryCommonOne } from '../db/router';
import { authMiddleware, optionalAuth, AuthPayload } from '../middleware/auth';
import { getAccessToken } from '../services/wechat-token';
import { getRedis } from '../config/redis';
import {
  ApiResponse,
  WxLoginRequest,
  WxLoginResponse,
  User,
  UserRole,
  CreateUserParams,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// Auth 路由 — 微信登录 & 用户认证
// ============================================================

/** 微信 code2Session 响应 */
interface WxCode2SessionResult {
  openid: string;
  session_key: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 调用微信 code2Session API
 */
async function wxCode2Session(code: string): Promise<WxCode2SessionResult> {
  const { appId, appSecret } = config.wechat;
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;
  
  const response = await fetch(url);
  const data = await response.json() as WxCode2SessionResult;
  
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`微信登录失败: ${data.errmsg || '未知错误'} (errcode=${data.errcode})`);
  }
  
  return data;
}

/**
 * 根据 openid 查询用户
 */
async function findUserByOpenid(openid: string): Promise<User | null> {
  return queryOne<User>(
    `SELECT id, openid, unionid, nickname, avatar_url, phone, gender, role, race_count,
            total_race_time_ms, best_score_ms, created_at, updated_at
     FROM users WHERE openid = $1`,
    [openid]
  );
}

/**
 * 创建新用户
 */
async function createUser(params: CreateUserParams): Promise<User> {
  const id = uuidv4();
  await execute(
    `INSERT INTO users (id, openid, unionid, nickname, avatar_url, phone, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      params.openid,
      params.unionid || null,
      params.nickname,
      params.avatar_url || '',
      params.phone || '',
      params.role || UserRole.PLAYER,
    ]
  );
  
  return {
    id,
    openid: params.openid,
    unionid: params.unionid,
    nickname: params.nickname,
    avatar_url: params.avatar_url || '',
    phone: params.phone || '',
    role: (params.role || UserRole.PLAYER) as UserRole,
    race_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * 生成 JWT token
 */
function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      openid: user.openid,
      role: user.role,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );
}

/**
 * POST /api/v1/auth/wx-login
 * 微信一键登录
 * @param body.code - 微信 wx.login() 返回的 code
 * @param body.nickname - 用户昵称（可选，首次登录时使用）
 * @param body.avatar_url - 用户头像（可选）
 * @returns { token: string, user: User, is_new_user: boolean }
 */
router.post('/wx-login', async (req: Request, res: Response<ApiResponse<WxLoginResponse>>) => {
  try {
    const { code } = req.body as WxLoginRequest;

    if (!code) {
      return res.status(400).json({ code: 400, message: '缺少登录凭证 code', data: null as any });
    }

    // 1. 调用微信 code2Session 获取 openid
    let openid: string;
    let sessionKey: string;
    let unionid: string | undefined;

    // 模拟模式：本地开发 或 传了测试 code 或 微信未配置时
    if (code === 'dev-test-code' || !config.wechat.appId) {
      // 开发/测试模式：使用模拟数据
      openid = `dev_openid_${Date.now()}`;
      sessionKey = `dev_session_key_${Date.now()}`;
      unionid = undefined;
    } else {
      const wxResult = await wxCode2Session(code);
      openid = wxResult.openid;
      sessionKey = wxResult.session_key;
      unionid = wxResult.unionid;
    }

    // 2. 查询或创建用户
    let user = await findUserByOpenid(openid);

    if (!user) {
      const nickname = req.body.nickname || `玩家${Date.now().toString(36).slice(-6)}`;
      const avatarUrl = req.body.avatar_url || '';
      user = await createUser({
        openid,
        unionid,
        nickname,
        avatar_url: avatarUrl,
        role: UserRole.PLAYER,
      });

      // 新用户注册赠送参赛抵扣金（通过 system_config 控制开关和金额，默认 1000分=10元）
      await grantFreeEntryDeduction(req, user.id);
    }

    // 2a. is_new_user 依据 phone 是否有值判断（手机号是否已绑定）
    const isNewUser = !user.phone || user.phone.trim() === '';

    // 3. 生成 JWT token
    const token = generateToken(user);

    return res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        user,
        is_new_user: isNewUser,
      },
    });
  } catch (error: any) {
    console.error('[Auth] wx-login error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '登录失败', data: null as any });
  }
});

/**
 * POST /api/v1/auth/mp-login
 * 小程序手机号登录
 * @param body.code - 微信 wx.login() 返回的 code
 * @param body.phone - 用户手机号（可选，有则 UPDATE）
 * @returns { token, user }
 */
router.post('/mp-login', async (req: Request, res: Response) => {
  try {
    const { code, phone } = req.body;

    if (!code) {
      return res.status(400).json({ code: 400, message: '缺少登录凭证 code', data: null });
    }

    // phone 为可选，填了才校验格式
    if (phone && !/^\d{11}$/.test(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });
    }

    // 1. code → openid
    let openid: string;
    if (code === 'dev-test-code' || !config.wechat.appId) {
      openid = phone ? `dev_openid_${phone}` : `dev_openid_${Date.now()}`;
    } else {
      const wxResult = await wxCode2Session(code);
      openid = wxResult.openid;
    }

    // 2. 查 users 表，有则 UPDATE phone（如果提供了phone），无则 INSERT
    const existingUser = await findUserByOpenid(openid);

    let user: User;
    if (existingUser) {
      if (phone) {
        await execute(
          'UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2',
          [phone, existingUser.id]
        );
      }
      user = await findUserByOpenid(openid) as User;
    } else {
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      user = await createUser({
        openid,
        unionid: undefined,
        nickname: phone ? `玩家${phone.slice(-4)}` : `玩家${randomSuffix}`,
        avatar_url: '',
        phone: phone || '',
        role: UserRole.PLAYER,
      });
      // 新用户赠送参赛抵扣金
      await grantFreeEntryDeduction(req, user.id);
    }

    // 3. 签发 JWT
    const token = generateToken(user);

    return res.json({
      code: 0,
      message: '登录成功',
      data: { token, user, is_new_user: !existingUser },
    });
  } catch (error: any) {
    console.error('[Auth] mp-login error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '登录失败', data: null });
  }
});

/**
 * POST /api/v1/auth/admin-login
 * 管理员密码登录（RBAC 版）
 * @param body.username - 管理员用户名
 * @param body.password - 管理员密码
 * @returns { token, user }
 */
router.post('/admin-login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '缺少用户名或密码', data: null });
    }

    // 允许用 username 或 phone 登录
    let user = await queryOne<any>(
      `SELECT au.id, au.username, au.password, au.nickname, au.email, au.phone,
              au.role_id, au.status, ar.label as role_name, ar.name as admin_role_name, ar.permissions,
              au.first_login
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.id = au.role_id
       WHERE au.username = $1`,
      [username]
    );
    // 如果 username 没查到，尝试用 phone 查询
    if (!user) {
      user = await queryOne<any>(
        `SELECT au.id, au.username, au.password, au.nickname, au.email, au.phone,
                au.role_id, au.status, ar.label as role_name, ar.name as admin_role_name, ar.permissions,
                au.first_login
         FROM admin_users au
         LEFT JOIN admin_roles ar ON ar.id = au.role_id
         WHERE au.phone = $1`,
        [username]
      );
    }

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误', data: null });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ code: 403, message: '账号已被禁用', data: null });
    }

    // 使用 bcrypt 验证密码
    console.log('[AUTH-D] body password:', JSON.stringify(password), 'type:', typeof password, 'len:', password.length);
    console.log('[AUTH-D] db password hash:', user.password?.substring(0, 15), '... len:', user.password?.length, 'starts2b:', user.password?.startsWith?.('$2b$'));
    const cmpResult = compareSync(password, user.password);
    console.log('[AUTH-D] compareSync result:', cmpResult);
    if (!cmpResult) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误', data: null });
    }

    // 解析权限数组（兼容 mysql2 JSON 自动解析导致的 object 类型）
    let permissions: string[] = [];
    try {
      if (typeof user.permissions === 'object' && user.permissions !== null) {
        permissions = Array.isArray(user.permissions) ? user.permissions : [];
      } else {
        permissions = JSON.parse(user.permissions || '[]');
      }
    } catch {
      permissions = [];
    }

    // 内置超级管理员（admin）直接给全权限，不依赖 admin_roles 表
    if (user.username === 'admin' || permissions.includes('*')) {
      permissions = ['*'];
    }

    // 如果有运营商角色，从 operator_members 获取 operatorId
    let operatorId: string | undefined;
    if (['op_super_admin', 'op_admin', 'op_finance'].includes(user.role_id)) {
      const member = await queryOne<{ operator_id: string }>(
        'SELECT operator_id FROM operator_members WHERE id = $1',
        [user.id]
      );
      if (member) {
        operatorId = member.operator_id;
      }
    }

    // 生成 JWT（包含 admin 权限信息）
    const payload: AuthPayload & { admin_role_id?: string; admin_role_name?: string; permissions?: string[] } = {
      userId: user.id,
      openid: '',
      role: 'admin',
      admin_role_id: user.role_id,
      admin_role_name: user.admin_role_name,
      permissions,
      ...(operatorId ? { operatorId } : {}),
    };

    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

    return res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        first_login: user.first_login == 1,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          phone: user.phone,
          role_id: user.role_id,
          role_name: user.role_name,
          permissions,
          first_login: user.first_login == 1,
          operator_name: user.nickname || user.username || '',
        },
      },
    });
  } catch (error: any) {
    console.error('[Auth] admin-login error:', error.message);
    return res.status(500).json({ code: 500, message: '登录失败', data: null });
  }
});

/**
/**
 * POST /api/v1/auth/operator-login
 * 运营商子账号登录（前端兼容别名路由）
 * 功能与 POST /login + role='operator_member' 完全相同
 * @param body.phone - 手机号
 * @param body.password - 密码
 */
router.post('/operator-login', async (req: Request, res: Response) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ code: 400, message: '缺少手机号或密码', data: null });
  }

  try {
    // 分两步查：先查 operator_members（公共库），再补查 admin_roles 和 operators
    const member = await queryOne<any>(
      `SELECT id, password, name, phone, role_id, status, operator_id, first_login
       FROM operator_members WHERE phone = $1`,
      [phone]
    );

    if (!member) {
      return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
    }

    // 补查角色信息
    const roleRow = member.role_id
      ? await queryOne<any>(`SELECT label as role_name, name as admin_role_name, permissions FROM admin_roles WHERE name = $1`, [member.role_id])
      : null;
    if (roleRow) {
      member.role_name = roleRow.role_name;
      member.admin_role_name = roleRow.admin_role_name;
      member.permissions = roleRow.permissions;
    }
    // 补查运营商信息
    const opRow = member.operator_id
      ? await queryOne<any>(`SELECT name as operator_name, company_name FROM operators WHERE id = $1`, [member.operator_id])
      : null;
    if (opRow) {
      member.operator_name = opRow.operator_name;
      member.company_name = opRow.company_name || null;
    }

    if (member.status === 'disabled') {
      return res.status(403).json({ code: 403, message: '账号已被禁用', data: null });
    }

    if (!compareSync(password, member.password)) {
      return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
    }

    // 解析权限数组
    let permissions: string[] = [];
    try {
      if (typeof member.permissions === 'object' && member.permissions !== null) {
        permissions = Array.isArray(member.permissions) ? member.permissions : [];
      } else {
        permissions = JSON.parse(member.permissions || '[]');
      }
    } catch {
      permissions = [];
    }

    if (member.role_id === 'op_super_admin') {
      permissions = ['*'];
    }

    const firstLogin = member.first_login === 1;

    const payload: any = {
      userId: member.id,
      openid: '',
      role: 'operator',
      operatorId: member.operator_id,
      admin_role_name: member.admin_role_name,
      permissions,
    };

    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

    return res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: member.id,
          nickname: member.name,
          phone: member.phone,
          role_id: member.role_id,
          role_name: member.role_name,
          permissions,
          operator_id: member.operator_id,
          operator_name: member.operator_name,
          company_name: member.company_name || null,
          firstLogin,
        },
      },
    });
  } catch (error: any) {
    console.error('[Auth] operator-login error:', error.message);
    return res.status(500).json({ code: 500, message: '登录失败', data: null });
  }
});

/**
 * POST /api/v1/auth/login
 * 统一登录
 * - role='operator': 运营商超管（查 operator_members 表，phone + password）
 * - role='operator_member': 运营商子账号（查 operator_members 表，phone + password）
 * - 无 role / 其他: 裁判/玩家（查 referees 表 / users 表，phone + password）
 * @param body.username - 手机号（role='operator'时传入 username 字段）
 * @param body.phone - 手机号（role='operator_member' 或无 role 时）
 * @param body.password - 密码（必填）
 * @param body.role - 角色：operator | operator_member | 不传/其他
 * @returns { token, user }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, phone, password, role } = req.body;

    if (role === 'operator') {
      // ===== 运营商超管登录（统一走 operator_members 表） =====
      // 前台传入 username 即手机号（operator_username 字段已废除）
      const loginPhone = username || phone;
      if (!loginPhone || !password) {
        return res.status(400).json({ code: 400, message: '缺少手机号或密码', data: null });
      }

      const member = await queryOne<any>(
        `SELECT om.id, om.password, om.name as nickname, om.phone, om.role_id, om.status,
                om.operator_id, om.first_login,
                o.name as operator_name, o.company_name
         FROM operator_members om
         LEFT JOIN operators o ON o.id = om.operator_id
         WHERE om.phone = $1 AND om.role_id = 'op_super_admin'`,
        [loginPhone]
      );

      if (!member) {
        return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
      }

      if (member.status === 'disabled') {
        return res.status(403).json({ code: 403, message: '账号已被禁用', data: null });
      }

      if (!compareSync(password, member.password)) {
        return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
      }

      const passwordChangeRequired = member.first_login === 1;

      const payload: AuthPayload & { passwordChangeRequired?: boolean; permissions?: string[] } = {
        userId: member.id,
        openid: '',
        role: 'operator',
        operatorId: member.operator_id,
        permissions: ['*'],
      };

      const token = jwt.sign(
        { ...payload, passwordChangeRequired },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );

      return res.json({
        code: 0,
        message: '登录成功',
        data: {
          token,
          user: {
            id: member.id,
            operatorId: member.operator_id,
            username: member.phone,
            nickname: member.nickname || member.phone,
            phone: member.phone,
            operator_name: member.operator_name || '',
            company_name: member.company_name || null,
            role_name: '运营商超管',
            role: 'operator',
            permissions: ['*'],
            passwordChangeRequired,
            firstLogin: member.first_login === 1,
          },
        },
      });
    }

    if (role === 'operator_member') {
      // ===== 运营商子账号登录（operator_members 表） =====
      if (!phone || !password) {
        return res.status(400).json({ code: 400, message: '缺少手机号或密码', data: null });
      }

      const member = await queryOne<any>(
        `SELECT id, password, name, phone, role_id, status, operator_id, first_login
         FROM operator_members WHERE phone = $1`,
        [phone]
      );

      if (!member) {
        return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
      }

      // 补查角色信息
      const roleRow2 = member.role_id
        ? await queryOne<any>(`SELECT label as role_name, name as admin_role_name, permissions FROM admin_roles WHERE name = $1`, [member.role_id])
        : null;
      if (roleRow2) {
        member.role_name = roleRow2.role_name;
        member.admin_role_name = roleRow2.admin_role_name;
        member.permissions = roleRow2.permissions;
      }
      // 补查运营商信息
      const opRow2 = member.operator_id
        ? await queryOne<any>(`SELECT name as operator_name, company_name FROM operators WHERE id = $1`, [member.operator_id])
        : null;
      if (opRow2) {
        member.operator_name = opRow2.operator_name;
        member.company_name = opRow2.company_name || null;
      }

      if (member.status === 'disabled') {
        return res.status(403).json({ code: 403, message: '账号已被禁用', data: null });
      }

      if (!compareSync(password, member.password)) {
        return res.status(401).json({ code: 401, message: '手机号或密码错误', data: null });
      }

      // 解析权限数组（兼容 mysql2 JSON 自动解析导致的 object 类型）
      let permissions: string[] = [];
      try {
        if (typeof member.permissions === 'object' && member.permissions !== null) {
          permissions = Array.isArray(member.permissions) ? member.permissions : [];
        } else {
          permissions = JSON.parse(member.permissions || '[]');
        }
      } catch {
        permissions = [];
      }

      // 运营商超管（op_super_admin）自动给全权限
      if (member.role_id === 'op_super_admin') {
        permissions = ['*'];
      }

      const firstLogin = member.first_login === 1;

      const payload: AuthPayload & { operatorId?: string; admin_role_name?: string; permissions?: string[] } = {
        userId: member.id,
        openid: '',
        role: 'operator',
        operatorId: member.operator_id,
        admin_role_name: member.admin_role_name,
        permissions,
      };

      const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

      return res.json({
        code: 0,
        message: '登录成功',
        data: {
          token,
          user: {
            id: member.id,
            nickname: member.name,
            phone: member.phone,
            role_id: member.role_id,
            role_name: member.role_name,
            permissions,
            operator_id: member.operator_id,
            operator_name: member.operator_name,
            company_name: member.company_name || null,
            firstLogin,
            passwordChangeRequired: firstLogin,
          },
        },
      });
    }

    // ===== 裁判登录（仅微信OAuth，不支持手机号+密码） =====
    if (!phone || !password) {
      return res.status(400).json({ code: 400, message: '缺少手机号或密码', data: null });
    }

    // 检查是否是裁判手机号（referees 在 operator 库）
    const refereePhone = await queryOpOne<{ id: string; phone: string; nickname: string }>(req,
      'SELECT id, phone, name FROM referees WHERE phone = $1',
      [phone]
    );

    if (refereePhone) {
      return res.status(400).json({
        code: 400,
        message: '裁判请使用微信授权登录，不支持手机号+密码登录',
        data: null
      });
    }

    // ===== 玩家登录（users 表） =====
    const playerUser = await queryOne<{
      id: string;
      phone: string;
      nickname: string;
      password: string;
      role: string;
      race_count: number;
      avatar_url: string;
      gender: string;
      first_login: number;
    }>(
      `SELECT id, phone, nickname, password, role, race_count, avatar_url, gender, first_login FROM users WHERE phone = $1 AND role = 'player'`,
      [phone]
    );

    if (playerUser) {
      // 开发阶段：玩家手机号登录免密
      // 无论前端传什么密码都放行，密码列仅作预留

      const payload = {
        userId: playerUser.id,
        openid: 'plr_' + playerUser.id,
        role: 'player' as const,
        firstLogin: playerUser.first_login === 1
      };
      const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
      return res.json({
        code: 0,
        message: '登录成功',
        data: {
          token,
          user: {
            id: playerUser.id,
            nickname: playerUser.nickname || '玩家',
            avatarUrl: playerUser.avatar_url || '',
            gender: playerUser.gender || '',
            role: 'player',
            raceCount: playerUser.race_count || 0
          }
        }
      });
    }

    // 所有合法角色分支均未匹配 → 返回 401
    return res.status(401).json({
      code: 401,
      message: '手机号未注册，请联系运营商开通账号',
      data: null
    });
  } catch (error: any) {
    return res.status(500).json({ code: 500, message: '登录失败', data: null });
  }
});

/**
 * GET /api/v1/auth/me
 * 获取当前登录用户信息
 * @header Authorization: Bearer <token>
 * @returns 当前用户完整信息
 */
router.get('/me', authMiddleware, async (req: Request, res: Response<ApiResponse<User>>) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // 管理员用户：从 admin_users 表查询
    if (userRole === 'admin') {
      const admin = await queryOne<any>(
        `SELECT au.id, au.username, au.nickname, au.email, au.phone,
                au.role_id, au.status, ar.label as role_name, ar.name as admin_role_name, ar.permissions,
                au.first_login
         FROM admin_users au
         LEFT JOIN admin_roles ar ON ar.id = au.role_id
         WHERE au.id = $1`,
        [userId]
      );
      if (!admin) {
        return res.status(404).json({ code: 404, message: '管理员不存在', data: null as any });
      }
      let permissions: string[] = [];
      try { permissions = typeof admin.permissions === 'object' ? admin.permissions : JSON.parse(admin.permissions || '[]'); } catch { permissions = []; }
      if (admin.username === 'admin' || permissions.includes('*')) {
        permissions = ['*'];
      }
      return res.json({
        code: 0, message: 'ok',
        data: {
          id: admin.id,
          username: admin.username,
          nickname: admin.nickname || admin.username,
          email: admin.email,
          phone: admin.phone,
          role_id: admin.role_id,
          role_name: admin.role_name || admin.label,
          permissions,
          first_login: admin.first_login == 1,
        } as any,
      });
    }

    // 运营商成员：从 operator_members 表查询（已迁至公共库）
    if (userRole === 'operator') {
      const member = await queryOne<any>(
        `SELECT om.id, om.operator_id, om.phone, om.name, om.role_id, om.status,
                o.name as operator_name, o.company_name
         FROM operator_members om
         LEFT JOIN operators o ON o.id = om.operator_id
         WHERE om.id = $1`,
        [userId]
      );
      if (member && (member.status === 1 || member.status === 'active')) {
        // 超管自动给全权限，普通成员从 admin_roles 查
        let permissions: string[] = [];
        if (member.role_id === 'op_super_admin') {
          permissions = ['*'];
        } else {
          try {
            const roleResult = await queryOne<any>(
              `SELECT permissions FROM admin_roles WHERE name = $1`,
              [member.role_id]
            );
            if (roleResult?.permissions) {
              permissions = typeof roleResult.permissions === 'object'
                ? roleResult.permissions
                : JSON.parse(roleResult.permissions || '[]');
            }
          } catch {}
        }
        return res.json({
          code: 0, message: 'ok',
          data: {
            id: member.id,
            operatorId: member.operator_id,
            username: member.name,
            nickname: member.name,
            phone: member.phone,
            role_name: member.role_id === 'op_super_admin' ? '运营商超管' : (member.role_id || '成员'),
            admin_role_name: member.role_id,
            operator_name: member.operator_name || '',
            company_name: member.company_name || null,
            role: 'operator',
            permissions,
          } as any,
        });
      }

      // member 查不到 → 继续往下走 404
    }

    // 普通用户 / 裁判：从 users 表查询
    const user = await queryOne<User>(
      `SELECT id, openid, unionid, nickname, avatar_url, phone, role, race_count,
              total_race_time_ms, best_score_ms, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null as any });
    }

    return res.json({ code: 0, message: 'ok', data: user });
  } catch (error: any) {
    console.error('[Auth] me error:', error.message);
    return res.status(500).json({ code: 500, message: '获取用户信息失败', data: null as any });
  }
});

/**
 * POST /api/v1/auth/refresh
 * 刷新 token
 * @header Authorization: Bearer <token>
 * @returns 新的 token
 */
router.post('/refresh', authMiddleware, async (req: Request, res: Response<ApiResponse<{ token: string }>>) => {
  try {
    const payload = req.user!;
    const userId = payload.userId;
    const userRole = payload.role;

    // 管理员用户：从 admin_users 表查询，重新生成完整 admin JWT
    if (userRole === 'admin') {
      const admin = await queryOne<any>(
        `SELECT au.id, au.username, au.nickname, au.email, au.phone,
                au.role_id, au.status, ar.label as role_name, ar.name as admin_role_name, ar.permissions,
                au.first_login
         FROM admin_users au
         LEFT JOIN admin_roles ar ON ar.id = au.role_id
         WHERE au.id = $1`,
        [userId]
      );
      if (!admin) {
        return res.status(404).json({ code: 404, message: '管理员不存在', data: null as any });
      }
      let permissions: string[] = [];
      try { permissions = typeof admin.permissions === 'object' ? admin.permissions : JSON.parse(admin.permissions || '[]'); } catch { permissions = []; }
      if (admin.username === 'admin' || permissions.includes('*')) {
        permissions = ['*'];
      }
      let operatorId: string | undefined;
      if ((payload as any).operatorId) {
        operatorId = (payload as any).operatorId;
      }
      const newToken = jwt.sign(
        {
          userId: admin.id,
          openid: '',
          role: 'admin',
          admin_role_id: admin.role_id,
          admin_role_name: admin.admin_role_name,
          permissions,
          ...(operatorId ? { operatorId } : {}),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );
      return res.json({ code: 0, message: 'token 已刷新', data: { token: newToken } });
    }

    // 运营商成员：从 operator_members 表查询
    if (userRole === 'operator' && (payload as any).operatorId) {
      const member = await queryOne<any>(
        `SELECT m.id, m.phone, m.name, m.role_id, m.status, m.operator_id,
                ar.label as role_name, ar.name as admin_role_name, ar.permissions,
                m.first_login
         FROM operator_members m
         LEFT JOIN admin_roles ar ON ar.name = m.role_id
         WHERE m.id = $1`,
        [userId]
      );
      if (member) {
        let permissions: string[] = [];
        try { permissions = typeof member.permissions === 'object' ? member.permissions : JSON.parse(member.permissions || '[]'); } catch { permissions = []; }
        const passwordChangeRequired = member.first_login === 1;
        const newToken = jwt.sign(
          {
            userId: member.id,
            openid: '',
            role: 'operator',
            operatorId: member.operator_id,
            admin_role_id: member.role_id,
            admin_role_name: member.admin_role_name || member.role_name,
            permissions,
            passwordChangeRequired,
          },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn as any }
        );
        return res.json({ code: 0, message: 'token 已刷新', data: { token: newToken } });
      }
    }

    // 运营商超管/子账号：从 operator_members 表查询
    if (userRole === 'operator') {
      const op = await queryOne<any>(
        `SELECT om.id, om.operator_id, om.phone, om.name, om.role_id, om.status,
                o.name as operator_name, o.company_name
         FROM operator_members om
         LEFT JOIN operators o ON o.id = om.operator_id
         WHERE om.id = $1`,
        [userId]
      );
      if (op) {
        const newToken = jwt.sign(
          {
            userId: op.id,
            openid: '',
            role: 'operator',
            operatorId: op.operator_id,
            operator_name: op.operator_name,
            permissions: op.role_id === 'op_super_admin' ? ['*'] : [],
          },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn as any }
        );
        return res.json({ code: 0, message: 'token 已刷新', data: { token: newToken } });
      }
    }

    // 裁判：从 referees + users 表查询
    if (userRole === 'referee') {
      const referee = await queryOpOne<any>(req, 
        `SELECT r.id, r.user_id, u.id as uid, u.openid, u.role
         FROM referees r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.user_id = $1 OR r.id = $1`,
        [userId]
      );
      if (referee) {
        const newToken = jwt.sign(
          {
            userId: referee.user_id || userId,
            openid: referee.openid || '',
            role: 'referee',
          },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn as any }
        );
        return res.json({ code: 0, message: 'token 已刷新', data: { token: newToken } });
      }
    }

    // 普通用户/玩家：从 users 表查询
    const user = await queryOne<User>(
      `SELECT id, openid, role FROM users WHERE id = $1`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null as any });
    }

    const token = generateToken(user);
    return res.json({ code: 0, message: 'token 已刷新', data: { token } });
  } catch (error: any) {
    console.error('[Auth] refresh error:', error.message);
    return res.status(500).json({ code: 500, message: '刷新 token 失败', data: null as any });
  }
});

/**
 * POST /api/v1/auth/admin/change-password
 * 修改密码（支持总部后台管理员 和 裁判用户）
 * - 管理员：查 admin_users 表，更新 admin_users
 * - 裁判：通过 referees.user_id 找到 users 表记录，更新 users
 * @header Authorization: Bearer <token>
 * @body oldPassword - 旧密码
 * @body newPassword - 新密码
 * @body confirmPassword - 确认新密码
 */
router.post('/admin/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空', data: null });
    }

    if (!newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({ code: 400, message: '密码需至少8位，包含大小写字母和数字', data: null });
    }

    if (userRole === 'referee') {
      // 裁判改密：通过 referee userId 找到对应的 users 记录
      const referee = await queryOpOne<{ id: string; user_id: string }>(req, 
        'SELECT id, user_id FROM referees WHERE user_id = $1',
        [userId]
      );
      if (!referee) {
        return res.status(404).json({ code: 404, message: '裁判账号不存在', data: null });
      }

      const userRecord = await queryOne<{ id: string; password: string }>(
        'SELECT id, password FROM users WHERE id = $1',
        [referee.user_id]
      );
      if (!userRecord) {
        return res.status(404).json({ code: 404, message: '用户账号不存在', data: null });
      }

      // 验证旧密码
      if (!compareSync(oldPassword, userRecord.password)) {
        return res.status(401).json({ code: 401, message: '旧密码错误', data: null });
      }

      // 更新密码，清除首次登录标记
      const hashedPassword = hashSync(newPassword, 10);
      const now2 = new Date();
      const mysqlDt2 = now2.getFullYear() + '-' +
        String(now2.getMonth() + 1).padStart(2, '0') + '-' +
        String(now2.getDate()).padStart(2, '0') + ' ' +
        String(now2.getHours()).padStart(2, '0') + ':' +
        String(now2.getMinutes()).padStart(2, '0') + ':' +
        String(now2.getSeconds()).padStart(2, '0');
      await query(
        'UPDATE users SET password = $1, first_login = 0, updated_at = $2 WHERE id = $3',
        [hashedPassword, mysqlDt2, referee.user_id]
      );

      return res.json({ code: 0, message: '密码修改成功', data: { token: null } });
    }

    // 从 admin_users 表查询
    const admin = await queryOne<{ id: string; password: string }>(
      'SELECT id, password FROM admin_users WHERE id = $1',
      [userId]
    );

    if (!admin) {
      return res.status(404).json({ code: 404, message: '管理员账号不存在', data: null });
    }

    // 验证旧密码
    if (!compareSync(oldPassword, admin.password)) {
      return res.status(401).json({ code: 401, message: '旧密码错误', data: null });
    }

    // 更新密码，并清除首次登录标记
    const hashedPassword = hashSync(newPassword, 10);
    const now = new Date();
    const mysqlDatetime = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');
    await query(
      'UPDATE admin_users SET password = $1, first_login = 0, updated_at = $2 WHERE id = $3',
      [hashedPassword, mysqlDatetime, userId]
    );

    // 生成新 token
    const token = jwt.sign(
      { userId, role: req.user!.role || 'admin' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    );

    // 查 admin 最新信息
    const adminUserInfo = await queryOne<any>(
      `SELECT au.id, au.username, au.nickname, au.phone, ar.label as role_name, ar.name as admin_role_name, ar.permissions, au.first_login
       FROM admin_users au
       LEFT JOIN admin_roles ar ON ar.id = au.role_id
       WHERE au.id = $1`,
      [userId]
    );

    return res.json({
      code: 0, message: '密码修改成功',
      data: {
        token,
        user: adminUserInfo ? {
          id: adminUserInfo.id,
          username: adminUserInfo.username,
          nickname: adminUserInfo.nickname || adminUserInfo.username,
          phone: adminUserInfo.phone,
          role_name: adminUserInfo.role_name || '超级管理员',
          role: 'admin',
          permissions: adminUserInfo.permissions ? (typeof adminUserInfo.permissions === 'object' ? adminUserInfo.permissions : JSON.parse(adminUserInfo.permissions)) : ['*'],
          first_login: false,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('[Auth] admin change-password error:', error.message);
    return res.status(500).json({ code: 500, message: '密码修改失败', data: null });
  }
});

/**
 * POST /api/v1/auth/admin/first-login-setup
 * 首次登录设置：设置用户名 + 修改密码
 * body: { username: string (可选), password: string }
 */
router.post('/admin/first-login-setup', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { username, password } = req.body;

    // 至少提供一个设置项
    if (!username && !password) {
      return res.status(400).json({ code: 400, message: '请设置用户名或修改密码', data: null });
    }

    // 如果设置了用户名，校验唯一性
    if (username) {
      if (username.length < 2) {
        return res.status(400).json({ code: 400, message: '用户名至少2个字符', data: null });
      }
      const existing = await queryOne<{ id: string }>(
        'SELECT id FROM admin_users WHERE username = $1 AND id != $2',
        [username, userId]
      );
      if (existing) {
        return res.status(409).json({ code: 409, message: '用户名已被使用', data: null });
      }
    }

    // 如果设置了密码，校验长度
    if (password && password.length < 6) {
      return res.status(400).json({ code: 400, message: '密码至少6位', data: null });
    }

    const sets: string[] = [];
    const params: any[] = [];

    if (username) {
      sets.push('username = $' + (params.length + 1));
      params.push(username);
    }
    if (password) {
      const hashed = hashSync(password, 10);
      sets.push('password = $' + (params.length + 1));
      params.push(hashed);
    }

    // 设置 first_login = 0
    sets.push('first_login = 0');
    params.push(userId);

    await query(
      `UPDATE admin_users SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );

    return res.json({ code: 0, message: '设置成功', data: null });
  } catch (error: any) {
    console.error('[Auth] first-login-setup error:', error.message);
    return res.status(500).json({ code: 500, message: '设置失败', data: null });
  }
});

/**
 * POST /api/v1/auth/member/change-password
 * 运营商角色成员（admin_users 表中 operator_id 非空的记录）修改密码
 * 也支持总部管理员修改密码
 * @header Authorization: Bearer <token>
 * @body oldPassword - 旧密码
 * @body newPassword - 新密码
 */
router.post('/member/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空', data: null });
    }
    if (!newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({ code: 400, message: '密码需至少8位，包含大小写字母和数字', data: null });
    }

    // 统一从 operator_members 表查询（唯一登录表）
    const user = await queryOne<{ id: string; password: string }>(
      'SELECT id, password FROM operator_members WHERE id = $1',
      [userId]
    );
    if (!user) {
      return res.status(404).json({ code: 404, message: '账号不存在', data: null });
    }

    if (!compareSync(oldPassword, user.password)) {
      return res.status(401).json({ code: 401, message: '旧密码错误', data: null });
    }

    const hashedPassword = hashSync(newPassword, 10);

    // 更新 operator_members 表
    await execute(
      "UPDATE operator_members SET password = $1, first_login = 0, updated_at = NOW() WHERE id = $2",
      [hashedPassword, userId]
    );

    // 生成新 token
    const tokenPayload: any = { userId, role: 'member' };
    if ((req.user as any).operatorId) {
      tokenPayload.operatorId = (req.user as any).operatorId;
    }
    if ((req.user as any).operator_name) {
      tokenPayload.operator_name = (req.user as any).operator_name;
    }
    const token = jwt.sign(
      tokenPayload,
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    );

    // 查用户最新信息并返回
    let userInfo: any = null;
    const m = await queryOne<any>(
      `SELECT m.id, m.operator_id, m.phone, m.name as nickname, m.status, ar.label as role_name, ar.permissions
       FROM operator_members m
       LEFT JOIN admin_roles ar ON ar.name = m.role_id
       WHERE m.id = $1`,
      [userId]
    );
    if (m) {
      userInfo = {
        id: m.id,
        operatorId: m.operator_id,
        phone: m.phone,
        nickname: m.nickname,
        role_name: m.role_name,
        role: 'operator',
        permissions: m.permissions ? (typeof m.permissions === 'object' ? m.permissions : JSON.parse(m.permissions)) : [],
      };
    }

    return res.json({
      code: 0, message: '密码修改成功',
      data: { token, user: userInfo },
    });
  } catch (error: any) {
    console.error('[Auth] member change-password error:', error.message);
    return res.status(500).json({ code: 500, message: '密码修改失败', data: null });
  }
});

/**
 * POST /api/v1/auth/register
 * 玩家快速注册（手机号+密码）
 */
router.post('/register', async (req: Request, res: Response) => {
  const { phone, password, nickname } = req.body;

  if (!phone || phone.length < 11) {
    return res.status(400).json({ code: 400, message: '请填写正确的手机号', data: null });
  }

  try {
    // 检查是否已注册
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE phone = $1`,
      [phone]
    );

    if (existing) {
      return res.status(400).json({ code: 400, message: '该手机号已注册，请直接登录', data: null });
    }

    const userId = uuidv4();
    const hash = password ? hashSync(password, 10) : '';
    const displayName = nickname || '玩家_' + phone.slice(-4);

    await query(
      `INSERT INTO users (id, openid, phone, nickname, password, role, race_count, avatar_url, first_login, register_coupon_granted, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'player', 3, '', 0, 1, NOW(), NOW())`,
      [userId, 'plr_' + phone, phone, displayName, hash]
    );

    // 注册成功赠送参赛抵扣金（通过 system_config 控制开关和金额）
    await grantFreeEntryDeduction(req, userId);

    const user: User = {
      id: userId,
      openid: 'plr_' + phone,
      phone: phone,
      nickname: displayName,
      role: 'player' as UserRole,
      avatar_url: '',
      race_count: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const token = generateToken(user);

    return res.json({
      code: 0,
      message: '注册成功',
      data: {
        token,
        user: {
          id: userId,
          nickname: displayName,
          avatarUrl: '',
          role: 'player',
          raceCount: 3,
        },
      },
    });
  } catch (error: any) {
    console.error('[Auth] register error:', error.message);
    return res.status(500).json({ code: 500, message: '注册失败', data: null });
  }
});

/**
 * 新用户注册赠送参赛抵扣金
 * 通过 system_config 控制开关和金额
 * key='register_deduction_cents' default=1000（10元）
 * 发放记录写入 entry_deductions，source='register_reward'
 */
async function grantFreeEntryDeduction(req: Request, userId: string): Promise<void> {
  try {
    // 从 system_config 读取配置，默认 1000分=10元
    const cfgRow = await queryOne<{ value: string }>(
      `SELECT value FROM system_config WHERE \`key\` = 'register_deduction_cents'`
    );
    let deductionCents = 1000; // 默认 10 元
    if (cfgRow && cfgRow.value) {
      const parsed = parseInt(cfgRow.value, 10);
      if (!isNaN(parsed) && parsed >= 0) deductionCents = parsed;
    }

    if (deductionCents <= 0) {
      console.log('[Auth] 注册赠送参赛抵扣金已关闭（deductionCents=0），跳过');
      return;
    }

    const deductionId = uuidv4();
    await executeOp(req, 
      `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, expires_at, created_at)
       VALUES ($1, $2, $3, 'register_reward', 'available', DATE_ADD(NOW(), INTERVAL 365 DAY), NOW())`,
      [deductionId, userId, deductionCents]
    );
    console.log('[Auth] 注册赠送参赛抵扣金:', userId, 'amount:', deductionCents / 100, '元, id:', deductionId);
  } catch (err: any) {
    console.error('[Auth] 注册赠送参赛抵扣金失败:', err?.message || err);
  }
}

/**
 * POST /api/v1/auth/decrypt-phone
 * 微信手机号解密 — 用 code 换取手机号
 * Auth: Bearer Token
 * Body: { code: string }  // 来自 <button open-type="getPhoneNumber">
 * Response: { phone: string }
 *
 * 流程：
 * 1. 用 getAccessToken() 获取服务号 access_token
 * 2. 调用微信 getuserphonenumber 接口换取手机号
 * 3. 解析 phone_info.purePhoneNumber（不带区号）
 * 4. 更新当前登录用户的 phone 字段
 */
router.post('/decrypt-phone', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ code: 400, message: '缺少 code 参数', data: null });
    }

    // 1. 获取小程序 access_token（小程序的 getPhoneNumber 需要小程序 token）
    const mpTokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.wechat.appId}&secret=${config.wechat.appSecret}`;
    const mpTokenResp = await fetch(mpTokenUrl);
    const mpTokenData = await mpTokenResp.json() as any;
    if (mpTokenData.errcode) {
      throw new Error(`获取小程序 access_token 失败: ${mpTokenData.errmsg} (errcode=${mpTokenData.errcode})`);
    }
    const accessToken = mpTokenData.access_token;

    // 2. 调用微信接口换取手机号
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = (await resp.json()) as any;

    if (data.errcode !== 0) {
      throw new Error(
        `获取手机号失败: ${data.errmsg || '未知错误'} (errcode=${data.errcode})`
      );
    }

    const phoneInfo = data.phone_info;
    const phone = phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || '';

    if (!phone) {
      return res.status(400).json({ code: 400, message: '未能解析手机号', data: null });
    }

    // 3. 更新当前用户的手机号
    const userId = req.user!.userId;
    await execute(
      `UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2`,
      [phone, userId]
    );

    return res.json({ code: 0, message: '手机号解密成功', data: { phone } });
  } catch (error: any) {
    console.error('[Auth] decrypt-phone error:', error.message);
    return res.status(500).json({
      code: 500,
      message: error.message || '手机号解密失败',
      data: null,
    });
  }
});

/**
 * POST /api/v1/auth/upload-avatar
 * 上传头像（base64），返回图片 URL
 */
router.post('/upload-avatar', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ code: 400, message: '缺少图片数据', data: null });
    }

    const matches = String(image).match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ code: 400, message: '图片格式不合法', data: null });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    const url = `/uploads/${filename}`;
    return res.json({ code: 0, message: '上传成功', data: { url } });
  } catch (error: any) {
    console.error('[Auth] upload-avatar error:', error.message);
    return res.status(500).json({ code: 500, message: '头像上传失败', data: null });
  }
});

/**
 * GET /api/v1/auth/mp-oauth/authorize
 * 微信服务号 OAuth 授权入口 — 302 跳转到微信授权页面
 * 前端点击"微信授权登录"按钮后跳转至此，由后端拼接完整授权 URL 并重定向
 * @query scope - snsapi_base（静默）| snsapi_userinfo（弹窗，默认）
 * @query redirect - 回调路径
 */
router.get('/mp-oauth/authorize', (req: Request, res: Response) => {
  const { appId } = config.wechatMp;

  if (!appId) {
    return res.status(500).json({ code: 500, message: '微信服务号未配置', data: null });
  }

  // 支持 scope query 参数（snsapi_base / snsapi_userinfo）
  const scope = (req.query.scope as string) || 'snsapi_userinfo';

  // 支持自定义回调路径（通过 redirect 参数）
  const customRedirect = req.query.redirect as string | undefined;
  const redirectPath = customRedirect || '/referee/login';
  const redirectUri = encodeURIComponent(`https://dog.amberrobot.com.cn${redirectPath}`);

  // state 传递回调地址，OAuth 回调后前端可以根据 state 决定跳转路径
  const stateParam = customRedirect
    ? `referee_invite_${encodeURIComponent(customRedirect)}`
    : 'referee_login';

  const wxAuthUrl =
    `https://open.weixin.qq.com/connect/oauth2/authorize?` +
    `appid=${appId}&` +
    `redirect_uri=${redirectUri}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `state=${stateParam}#wechat_redirect`;

  res.redirect(wxAuthUrl);
});

/**
 * GET /api/v1/auth/mp-oauth
 * 微信服务号 OAuth 回调 — 用 code 换 openid，查/建用户，返回 JWT
 * @query code - 微信 OAuth 授权回调携带的 code
 * @returns { token, user }
 */
router.get('/mp-oauth', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ code: 400, message: '缺少授权码 code', data: null });
    }

    // 1. 用 code 换取 access_token 和 openid
    let openid: string;
    let unionid: string | undefined;

    // 模拟模式
    if (code === 'dev-test-code' || !config.wechatMp.appId) {
      openid = `mp_dev_openid_${Date.now()}`;
      unionid = undefined;
    } else {
      const { appId, appSecret } = config.wechatMp;
      const wxUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;

      const wxResp = await fetch(wxUrl);
      const wxData = (await wxResp.json()) as any;

      if (wxData.errcode) {
        console.error('[Auth] mp-oauth 微信返回错误:', wxData);
        return res.status(400).json({
          code: 400,
          message: `微信授权失败: ${wxData.errmsg || '未知错误'}`,
          data: null,
        });
      }

      openid = wxData.openid;
      unionid = wxData.unionid;
    }

    if (!openid) {
      return res.status(400).json({ code: 400, message: '未能获取 openid', data: null });
    }

    // 2. 查找或创建用户
    let user = await findUserByOpenid(openid);
    let isNewUser = false;
    let refereeId: string | null = null;

    if (!user) {
      const nickname = `裁判${Date.now().toString(36).slice(-6)}`;
      user = await createUser({
        openid,
        unionid,
        nickname,
        role: UserRole.REFEREE,
      });
      isNewUser = true;
    } else {
      // 判断 is_new_user：该 openid 是否已有关联的 referee 记录
      const existingReferee = await queryOpOne<{ id: string }>(req, 
        'SELECT id FROM referees WHERE user_id = $1',
        [user.id]
      );
      if (existingReferee) {
        refereeId = existingReferee.id;
      } else {
        isNewUser = true;
      }
    }

    // 3. 生成 JWT
    const token = generateToken(user);

    return res.json({
      code: 0,
      message: '登录成功',
      data: { token, user, is_new_user: isNewUser, referee_id: refereeId },
    });
  } catch (error: any) {
    console.error('[Auth] mp-oauth error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '登录失败', data: null });
  }
});

/**
 * GET /api/v1/auth/mp-oauth/subscribe-status
 * 检查当前用户是否已关注微信服务号
 * @header Authorization: Bearer <token>
 * @returns { subscribed: boolean }
 */
router.get('/mp-oauth/subscribe-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await queryOne<{ mp_openid: string; openid: string }>(
      'SELECT mp_openid, openid FROM users WHERE id = $1',
      [userId]
    );

    if (!user) {
      return res.json({ code: 0, message: 'ok', data: { subscribed: false } });
    }

    // 如果 mp_openid 有值，说明已关注服务号
    const subscribed = !!(user.mp_openid && user.mp_openid.trim() !== '');

    return res.json({ code: 0, message: 'ok', data: { subscribed } });
  } catch (error: any) {
    console.error('[Auth] subscribe-status error:', error.message);
    return res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/auth/scan-login-status
 * 扫码登录状态轮询接口
 * 前端扫码后每隔 1.5s 轮询，等待 OAuth 回调写入 Redis
 * @param state - 扫码时前端生成的随机 state
 */
router.get('/scan-login-status', async (req: Request, res: Response) => {
  try {
    const { state } = req.query;
    if (!state || typeof state !== 'string') {
      return res.status(400).json({ code: 400, message: '缺少 state 参数', data: null });
    }

    const redis = await getRedis();
    const key = `scan_login:${state}`;
    const openid = await redis.get(key);

    if (!openid) {
      return res.json({ code: 0, message: 'pending', data: { status: 'pending' } });
    }

    // 删除 Redis key（一次性有效）
    await redis.del(key);

    // 用 openid 走 wx-mp-login 逻辑完成登录
    // 先检查该 openid 是否有裁判身份
    const referee = await queryOpOne<{ id: string; name: string }>(req,
      `SELECT r.id, r.name FROM referees r
       INNER JOIN users u ON r.user_id = u.id
       WHERE u.openid = $1 LIMIT 1`,
      [openid]
    );

    if (!referee) {
      return res.json({
        code: 0,
        message: 'not_registered',
        data: { status: 'not_registered', openid },
      });
    }

    // 生成 JWT token（复用 wx-mp-login 逻辑）
    const payload = {
      userId: referee.id,
      openid,
      role: 'referee' as const,
    };
    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });

    return res.json({
      code: 0,
      message: '登录成功',
      data: {
        status: 'success',
        token,
        user: { id: referee.id, name: referee.name, openid },
      },
    });
  } catch (error: any) {
    console.error('[Auth] scan-login-status error:', error.message);
    return res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

export default router;
