/**
 * 微信服务号 OAuth 网页授权登录
 *
 * 流程：
 * 1. 前端引导用户跳转微信 OAuth 授权页
 *    https://open.weixin.qq.com/connect/oauth2/authorize?appid=APPID&redirect_uri=REDIRECT_URI&response_type=code&scope=snsapi_userinfo&state=STATE#wechat_redirect
 * 2. 微信回调 redirect_uri 带上 code 参数
 * 3. 前端将 code 传给本接口 POST /api/v1/auth/wx-mp-login
 * 4. 后端用 code 换取 access_token + openid，拉取用户信息
 * 5. 创建或匹配已有用户，签发 JWT
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import {
  ApiResponse,
  WxMpLoginRequest,
  WxMpLoginResponse,
  WxOAuthAccessTokenResult,
  WxUserInfo,
  User,
  UserRole,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// 微信服务号 OAuth API 调用
// ============================================================

/**
 * 用 code 换取 access_token + openid
 */
async function getOAuthAccessToken(code: string): Promise<WxOAuthAccessTokenResult> {
  const { appId, appSecret } = config.wechatMp;

  if (!appId || !appSecret) {
    throw new Error('微信服务号未配置 (WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET)');
  }

  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;
  const resp = await fetch(url);
  const data = (await resp.json()) as WxOAuthAccessTokenResult;

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`微信 OAuth 授权失败: ${data.errmsg || '未知错误'} (errcode=${data.errcode})`);
  }

  return data;
}

/**
 * 刷新 access_token（用 refresh_token）
 */
async function refreshOAuthToken(refreshToken: string): Promise<WxOAuthAccessTokenResult> {
  const { appId } = config.wechatMp;
  const url = `https://api.weixin.qq.com/sns/oauth2/refresh_token?appid=${appId}&grant_type=refresh_token&refresh_token=${refreshToken}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as WxOAuthAccessTokenResult;

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`微信 refresh_token 失败: ${data.errmsg || '未知错误'}`);
  }

  return data;
}

/**
 * 拉取微信用户信息
 */
async function getUserInfo(accessToken: string, openid: string): Promise<WxUserInfo> {
  const url = `https://api.weixin.qq.com/sns/userinfo?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;
  const resp = await fetch(url);
  const data = (await resp.json()) as WxUserInfo & { errcode?: number; errmsg?: string };

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`拉取微信用户信息失败: ${data.errmsg || '未知错误'}`);
  }

  return data;
}

// ============================================================
// 用户操作辅助
// ============================================================

async function findUserByOpenid(openid: string): Promise<User | null> {
  return queryOne<User>(
    `SELECT id, openid, unionid, nickname, avatar_url, phone, gender, role, race_count,
            total_race_time_ms, best_score_ms, created_at, updated_at
     FROM users WHERE openid = $1`,
    [openid]
  );
}

async function createUserFromWx(params: {
  openid: string;
  unionid?: string;
  nickname: string;
  avatar_url: string;
  phone?: string;
  gender?: string;
}): Promise<User> {
  const id = uuidv4();
  await execute(
    `INSERT INTO users (id, openid, unionid, nickname, avatar_url, phone, gender, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      params.openid,
      params.unionid || null,
      params.nickname,
      params.avatar_url || '',
      params.phone || '',
      params.gender || '',
      UserRole.PLAYER,
    ]
  );

  return {
    id,
    openid: params.openid,
    unionid: params.unionid,
    nickname: params.nickname,
    avatar_url: params.avatar_url || '',
    phone: params.phone || '',
    role: UserRole.PLAYER,
    race_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, openid: user.openid, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );
}

// ============================================================
// 路由
// ============================================================

/**
 * POST /api/v1/auth/wx-mp-login
 * 微信服务号 OAuth 网页授权登录
 *
 * 前端流程：
 * 1. 构造授权 URL 跳转
 * 2. 回调拿到 code
 * 3. 调用此接口完成登录
 *
 * @param body.code - 微信 OAuth 返回的 code
 * @param body.phone - 手机号（可选，绑定已有手机号账户）
 * @param body.nickname - 用户昵称（可选，首次登录时覆盖微信昵称）
 * @param body.avatar_url - 用户头像（可选）
 */
router.post('/wx-mp-login', async (req: Request, res: Response<ApiResponse<WxMpLoginResponse>>) => {
  try {
    const { code, phone: reqPhone, nickname: reqNickname, avatar_url: reqAvatarUrl } = req.body as WxMpLoginRequest;

    if (!code) {
      return res.status(400).json({ code: 400, message: '缺少授权 code', data: null as any });
    }

    let openid: string;
    let unionid: string | undefined;
    let wxNickname = reqNickname || '';
    let wxAvatarUrl = reqAvatarUrl || '';

    // ===== OAuth callback 免 code 登录（openid 已通过 callback 验证写入 DB） =====
    if (typeof code === 'string' && code.startsWith('__oauth_')) {
      openid = code.replace('__oauth_', '');
      unionid = undefined;
      if (!wxNickname) wxNickname = 'ref_' + openid.slice(-6);
      console.log('[WxMpLogin] OAuth免code: openid=' + openid);

    // ===== 开发/测试模式 =====
    } else if (code === 'dev-mp-test-code' || code === 'dev-test-code' || !config.wechatMp.appId) {
      openid = `mp_dev_openid_${Date.now()}`;
      unionid = undefined;
      if (!wxNickname) wxNickname = `测试玩家${Date.now().toString(36).slice(-6)}`;
      console.log('[WxMpLogin] 使用开发测试模式, openid:', openid);
    } else {
      // ===== 生产模式：微信 OAuth =====
      // 1. code → access_token + openid
      const oauthResult = await getOAuthAccessToken(code);
      openid = oauthResult.openid;
      unionid = oauthResult.unionid;

      // 2. 拉取用户信息（snsapi_userinfo scope 下）
      if (!wxNickname && oauthResult.access_token) {
        try {
          const userInfo = await getUserInfo(oauthResult.access_token, openid);
          wxNickname = userInfo.nickname;
          wxAvatarUrl = userInfo.headimgurl;
          if (userInfo.unionid) unionid = userInfo.unionid;
        } catch (e: any) {
          // userinfo 拉取失败不阻断登录，使用默认昵称
          console.warn('[WxMpLogin] 拉取用户信息失败:', e.message);
          if (!wxNickname) wxNickname = `用户${openid.slice(-6)}`;
        }
      }
    }

    // ===== 查找或创建用户 =====
    let user = await findUserByOpenid(openid);
    let isNewUser = false;

    if (!user) {
      // 尝试手机号绑定：已有手机号账户 → 绑定新的服务号 openid
      if (reqPhone) {
        user = await queryOne<User>(
          `SELECT id, openid, unionid, nickname, avatar_url, phone, gender, role, race_count,
                  total_race_time_ms, best_score_ms, created_at, updated_at
           FROM users WHERE phone = $1 AND role = 'player'`,
          [reqPhone]
        );
        if (user) {
          // 绑定 openid，不覆盖原有 openid（保留小程序登录）
          await execute(
            `UPDATE users SET unionid = COALESCE(NULLIF($1, ''), unionid), mp_openid = $2, updated_at = NOW() WHERE id = $3`,
            [unionid || null, openid, user.id]
          );
          console.log('[WxMpLogin] 服务号 openid 已绑定到手机号账户:', reqPhone, 'userId:', user.id);

          // 更新头像昵称（如果微信拉到了更新）
          if (wxNickname && (!user.nickname || user.nickname.startsWith('玩家'))) {
            await execute('UPDATE users SET nickname = $1, avatar_url = $2 WHERE id = $3', [wxNickname, wxAvatarUrl, user.id]);
            user.nickname = wxNickname;
            user.avatar_url = wxAvatarUrl;
          }
        }
      }
    }

    if (!user) {
      // 创建新用户
      const finalNickname = wxNickname || `玩家${Date.now().toString(36).slice(-6)}`;
      user = await createUserFromWx({
        openid,
        unionid,
        nickname: finalNickname,
        avatar_url: wxAvatarUrl,
        phone: reqPhone || '',
      });
      isNewUser = true;

      // 新用户注册赠送参赛抵扣金
      await grantFreeEntryDeduction(req, user.id);
    } else {
      // 已有用户更新头像昵称（如果新拉取的更优）
      if (wxNickname && wxNickname !== user.nickname && !user.nickname.startsWith('玩家')) {
        // 只在用户没有自定义昵称时更新
      } else if (wxNickname && (!user.nickname || user.nickname.startsWith('玩家'))) {
        await execute('UPDATE users SET nickname = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3', [wxNickname, wxAvatarUrl || user.avatar_url, user.id]);
        user.nickname = wxNickname;
        user.avatar_url = wxAvatarUrl || user.avatar_url;
      }
    }

    // 签发 JWT
    const token = generateToken(user);

    return res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          openid: user.openid,
          unionid: user.unionid,
          nickname: user.nickname,
          avatar_url: user.avatar_url,
          phone: user.phone,
          role: user.role,
        },
        is_new_user: isNewUser,
      },
    });
  } catch (error: any) {
    console.error('[WxMpLogin] error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '登录失败', data: null as any });
  }
});

/**
 * POST /api/v1/auth/wx-mp-bind
 * 已登录用户绑定微信服务号 openid
 *
 * @header Authorization: Bearer <token>
 * @param body.code - 微信 OAuth code
 */
router.post('/wx-mp-bind', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ code: 401, message: '未登录', data: null });
    }

    let payload: any;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      return res.status(401).json({ code: 401, message: '登录已过期', data: null });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ code: 400, message: '缺少授权 code', data: null });
    }

    let openid: string;
    let unionid: string | undefined;

    if (code === 'dev-mp-test-code' || !config.wechatMp.appId) {
      openid = `mp_dev_bind_${payload.userId}`;
    } else {
      const oauthResult = await getOAuthAccessToken(code);
      openid = oauthResult.openid;
      unionid = oauthResult.unionid;
    }

    // 检查 openid 是否已被其他用户绑定
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE mp_openid = $1 AND id != $2',
      [openid, payload.userId]
    );
    if (existing) {
      return res.status(409).json({ code: 409, message: '该微信已被其他账户绑定', data: null });
    }

    await execute(
      'UPDATE users SET mp_openid = $1, unionid = COALESCE(NULLIF($2, \'\'), unionid), updated_at = NOW() WHERE id = $3',
      [openid, unionid || null, payload.userId]
    );

    return res.json({ code: 0, message: '微信绑定成功', data: null });
  } catch (error: any) {
    console.error('[WxMpBind] error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '绑定失败', data: null });
  }
});

/**
 * 新用户注册赠送参赛抵扣金
 * 从 system_config 读取配置
 */
async function grantFreeEntryDeduction(req: Request, userId: string): Promise<void> {
  try {
    const cfgRow = await queryOne<{ value: string }>(
      `SELECT value FROM system_config WHERE \`key\` = $1`,
      ['register_deduction_cents']
    );
    let deductionCents = 1000;
    if (cfgRow && cfgRow.value) {
      const parsed = parseInt(cfgRow.value, 10);
      if (!isNaN(parsed) && parsed >= 0) deductionCents = parsed;
    }

    if (deductionCents <= 0) {
      console.log('[WxMpLogin] 注册赠送参赛抵扣金已关闭（deductionCents=0），跳过');
      return;
    }

    const deductionId = uuidv4();
    await executeOp(req, 
      `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, expires_at, created_at)
       VALUES ($1, $2, $3, 'register_reward', 'available', DATE_ADD(NOW(), INTERVAL 365 DAY), NOW())`,
      [deductionId, userId, deductionCents]
    );
    console.log('[WxMpLogin] 注册赠送参赛抵扣金:', userId, 'amount:', deductionCents / 100, '元');
  } catch (err: any) {
    console.error('[WxMpLogin] 注册赠送参赛抵扣金失败:', err?.message || err);
  }
}

export default router;
