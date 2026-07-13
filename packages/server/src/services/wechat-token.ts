/**
 * 微信服务号 access_token 管理
 *
 * 使用微信服务号 AppID/Secret 获取全局 access_token，
 * 缓存并提前 5 分钟自动刷新，避免频繁请求微信接口。
 *
 * 接口: GET https://api.weixin.qq.com/cgi-bin/token
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Get_access_token.html
 */
import { config } from '../config';

/** 缓存的 access_token */
let cachedToken: string | null = null;
/** 过期时间戳（毫秒） */
let expiresAt = 0;

/**
 * 获取微信服务号 access_token
 *
 * - 缓存有效期内直接返回
 * - 过期前 5 分钟自动刷新
 * - 发生错误时抛出异常
 *
 * @returns access_token 字符串
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // 缓存有效（提前 5 分钟 = 300_000ms 刷新）
  if (cachedToken && now < expiresAt - 300_000) {
    return cachedToken;
  }

  const appId = process.env.WECHAT_MP_APP_ID || config.wechatMp?.appId || '';
  const secret = process.env.WECHAT_MP_APP_SECRET || config.wechatMp?.appSecret || '';

  if (!appId || !secret) {
    throw new Error('微信服务号未配置（WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET）');
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`;

  const resp = await fetch(url);
  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    errcode?: number;
    errmsg?: string;
  };

  if (data.errcode && data.errcode !== 0) {
    throw new Error(
      `获取 access_token 失败: ${data.errmsg || '未知错误'} (errcode=${data.errcode})`
    );
  }

  cachedToken = data.access_token;
  // expires_in 单位秒，提前 5 分钟过期
  expiresAt = now + (data.expires_in || 7200) * 1000;

  return cachedToken;
}

/**
 * 微信小程序 access_token
 *
 * 与 getAccessToken 独立缓存，因为小程序和公众号使用不同的 appId/secret。
 * 注意：小程序和高频的公众号 access_token 必须分开管理，
 * 否则相互覆盖导致接口调用失败。
 */
let cachedMiniToken: string | null = null;
let miniTokenExpiresAt = 0;

export async function getMiniProgramAccessToken(): Promise<string> {
  const now = Date.now();

  if (cachedMiniToken && now < miniTokenExpiresAt - 300_000) {
    return cachedMiniToken;
  }

  const appId = process.env.WECHAT_APP_ID || config.wechat?.appId || '';
  const secret = process.env.WECHAT_APP_SECRET || config.wechat?.appSecret || '';

  if (!appId || !secret) {
    throw new Error('微信小程序未配置（WECHAT_APP_ID / WECHAT_APP_SECRET）');
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    errcode?: number;
    errmsg?: string;
  };

  if (data.errcode && data.errcode !== 0) {
    throw new Error(
      `获取小程序 access_token 失败: ${data.errmsg || '未知错误'} (errcode=${data.errcode})`
    );
  }

  cachedMiniToken = data.access_token;
  miniTokenExpiresAt = now + (data.expires_in || 7200) * 1000;

  return cachedMiniToken;
}

/**
 * 清除缓存的 access_token（用于强制刷新场景）
 */
export function clearAccessTokenCache(): void {
  cachedToken = null;
  expiresAt = 0;
}
