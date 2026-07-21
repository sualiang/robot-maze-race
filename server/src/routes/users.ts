import { Router, Request, Response } from 'express';
import { queryOne, query, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import {
  ApiResponse,
  User,
  UpdateUserParams,
  PaginatedResult,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// Users 路由 — 用户信息管理
// ============================================================

/**
 * GET /api/v1/users
 * 获取用户列表（管理员专用）
 * @header Authorization: Bearer <token>
 * @query page - 页码，默认 1
 * @query pageSize - 每页数量，默认 20
 * @query role - 按角色筛选: player | referee | operator | admin
 * @returns PaginatedResult<User>
 */
router.get('/', authMiddleware, async (req: Request, res: Response<ApiResponse<PaginatedResult<User>>>) => {
  try {
    const { role, page: pageStr = '1', pageSize: pageSizeStr = '20' } = req.query;
    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params: any[] = [];

    if (role && (role as string) !== '') {
      whereClause = 'WHERE role = $1';
      params.push(role);
    }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    const users = await query<User>(
      `SELECT id, openid, unionid, nickname, avatar_url, phone, role,
              race_count, total_race_time_ms, best_score_ms,
              created_at, updated_at
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return res.json({
      code: 0,
      message: 'ok',
      data: { list: users, total, page, pageSize },
    });
  } catch (error: any) {
    console.error('[Users] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取用户列表失败', data: null as any });
  }
});

/**
 * GET /api/v1/users/:id
 * 获取用户详情
 * @param id - 用户 UUID
 * @returns User 完整信息
 */
router.get('/:id', async (req: Request, res: Response<ApiResponse<User>>) => {
  try {
    const { id } = req.params;

    const user = await queryOne<User>(
      `SELECT id, openid, unionid, nickname, avatar_url, phone, role,
              race_count, total_race_time_ms, best_score_ms,
              created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null as any });
    }

    return res.json({ code: 0, message: 'ok', data: user });
  } catch (error: any) {
    console.error('[Users] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取用户信息失败', data: null as any });
  }
});

/**
 * PUT /api/v1/users/:id
 * 更新个人信息（仅允许用户修改自己的信息）
 * @param id - 用户 UUID
 * @header Authorization: Bearer <token>
 * @body nickname - 昵称
 * @body avatar_url - 头像URL
 * @body phone - 手机号
 * @returns 更新后的 User
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<User>>) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.userId;
    const currentRole = req.user!.role;

    // 只能修改自己的信息，管理员除外
    if (currentUserId !== id && currentRole !== 'admin') {
      return res.status(403).json({ code: 403, message: '无权修改他人信息', data: null as any });
    }

    // 检查用户是否存在
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null as any });
    }

    const body = req.body as UpdateUserParams;
    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (body.nickname !== undefined) {
      fields.push(`nickname = $${paramIdx}`);
      values.push(body.nickname);
      paramIdx++;
    }

    if (body.avatar_url !== undefined) {
      fields.push(`avatar_url = $${paramIdx}`);
      values.push(body.avatar_url);
      paramIdx++;
    }

    if (body.phone !== undefined) {
      fields.push(`phone = $${paramIdx}`);
      values.push(body.phone);
      paramIdx++;
    }

    if (fields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null as any });
    }

    fields.push(`updated_at = $${paramIdx}`);
    values.push(new Date().toISOString());
    paramIdx++;

    values.push(id);

    await execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );
    const user = await queryOne<User>(
      'SELECT id, openid, unionid, nickname, avatar_url, phone, role, race_count, total_race_time_ms, best_score_ms, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );

    return res.json({ code: 0, message: '更新成功', data: user! });
  } catch (error: any) {
    console.error('[Users] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新个人信息失败', data: null as any });
  }
});

/**
 * POST /api/v1/users/:id/bind-phone
 * 绑定手机号（微信手机号解密）
 * @param id - 用户 UUID
 * @header Authorization: Bearer <token>
 * @body code - 微信 getPhoneNumber 返回的 code（新版接口）
 *            — 或 —
 * @body encrypted_data - 加密数据
 * @body iv - 加密向量
 * @body session_key - 微信 session_key（或服务端从 Redis/session 获取）
 * @returns 更新后的 User
 *
 * 说明：
 * 微信小程序获取手机号有两种方式：
 * 1. 新版：button open-type="getPhoneNumber" + @getphonenumber 回调
 *    拿到 code，服务端用 code + access_token 换取手机号
 * 2. 旧版：拿到 encryptedData + iv，用 session_key 解密
 *    本接口同时支持两种方式，优先处理新版 code
 */
router.post('/:id/bind-phone', authMiddleware, async (req: Request, res: Response<ApiResponse<User>>) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.userId;
    const currentRole = req.user!.role;

    // 只能绑定自己的手机号
    if (currentUserId !== id && currentRole !== 'admin') {
      return res.status(403).json({ code: 403, message: '无权操作', data: null as any });
    }

    const { code, encrypted_data, iv, session_key } = req.body;
    let phone = '';

    // 方式 1：新版接口（code 换取手机号）
    if (code) {
      phone = await wxGetPhoneNumberByCode(code);
    }
    // 方式 2：旧版接口（encryptedData + iv + sessionKey 解密）
    else if (encrypted_data && iv && session_key) {
      phone = await wxDecryptPhoneNumber(encrypted_data, iv, session_key);
    } else {
      return res.status(400).json({
        code: 400,
        message: '请提供 code（新版），或 encrypted_data + iv + session_key（旧版）',
        data: null as any,
      });
    }

    // 更新数据库
    await execute(
      'UPDATE users SET phone = $1, updated_at = $2 WHERE id = $3',
      [phone, new Date().toISOString(), id]
    );
    const user = await queryOne<User>(
      'SELECT id, openid, unionid, nickname, avatar_url, phone, role, race_count, total_race_time_ms, best_score_ms, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null as any });
    }

    return res.json({ code: 0, message: '手机号绑定成功', data: user });
  } catch (error: any) {
    console.error('[Users] bind-phone error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '绑定手机号失败', data: null as any });
  }
});

// ============================================================
// 微信手机号解密工具函数
// ============================================================

/**
 * 新版微信小程序获取手机号：用 code 换取
 * POST https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=ACCESS_TOKEN
 */
async function wxGetPhoneNumberByCode(code: string): Promise<string> {
  const accessToken = await getWxAccessToken();
  const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  
  const data = await response.json() as any;

  if (data.errcode !== 0) {
    throw new Error(`获取手机号失败: ${data.errmsg || '未知错误'}`);
  }

  const phoneInfo = data.phone_info;
  // purePhoneNumber 是没有区号的手机号（国内11位）
  return phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || '';
}

/**
 * 旧版微信小程序：encryptedData + iv + sessionKey 解密手机号
 * 使用 AES-128-CBC 解密
 */
async function wxDecryptPhoneNumber(
  encryptedData: string,
  iv: string,
  sessionKey: string
): Promise<string> {
  try {
    const crypto = await import('crypto');
    
    const sessionKeyBuffer = Buffer.from(sessionKey, 'base64');
    const encryptedDataBuffer = Buffer.from(encryptedData, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');

    const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKeyBuffer, ivBuffer);
    decipher.setAutoPadding(true);

    let decoded = decipher.update(encryptedDataBuffer, undefined, 'utf8');
    decoded += decipher.final('utf8');

    const data = JSON.parse(decoded);
    return data.purePhoneNumber || data.phoneNumber || '';
  } catch (err: any) {
    throw new Error(`手机号解密失败: ${err.message}`);
  }
}

/**
 * 获取微信 access_token（带简单内存缓存）
 */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getWxAccessToken(): Promise<string> {
  const now = Date.now();

  // 缓存有效期内直接返回
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 300000) {
    return cachedAccessToken.token;
  }

  const { appId, appSecret } = require('../config').config.wechat;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  
  const response = await fetch(url);
  const data = await response.json() as any;

  if (data.errcode) {
    throw new Error(`获取 access_token 失败: ${data.errmsg}`);
  }

  // 提前 5 分钟过期
  const expiresIn = (data.expires_in - 300) * 1000;
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + expiresIn,
  };

  return data.access_token;
}

export default router;
