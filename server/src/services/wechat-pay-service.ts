/**
 * 微信支付 V3 工具服务
 *
 * 提供签名、下单、调起参数生成等核心能力，
 * 供 player.ts（小程序下单）和 wx-pay.ts 公共使用。
 */
import crypto from 'crypto';
import fs from 'fs';
import { config } from '../config';

const WECHAT_PAY_HOST = 'https://api.mch.weixin.qq.com';

/** 生成随机 nonce_str */
export function nonceStr(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** 生成 SHA256-RSA2048 签名 */
export function sign(method: string, url: string, timestamp: number, nonce: string, body: string): string {
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
  const privateKey = fs.readFileSync(config.wechatPay.privateKeyPath, 'utf-8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

/** 获取 V3 Authorization header */
export function getAuthorization(method: string, path: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = nonceStr();
  const signature = sign(method, path, timestamp, nonce, body);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.wechatPay.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.wechatPay.merchantSerialNumber}"`;
}

/** 检查支付配置是否可用 */
export function isPayConfigured(): boolean {
  return !!(config.wechatPay.mchId && config.wechatPay.apiV3Key && config.wechatPay.privateKeyPath);
}

/** 发起微信支付 API v3 请求 */
export async function wechatPayRequest<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, any>
): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : '';
  const authorization = getAuthorization(method, path, bodyStr);

  const resp = await fetch(`${WECHAT_PAY_HOST}${path}`, {
    method,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'robot-maze-race/1.0',
    },
    body: bodyStr || undefined,
  });

  const respText = await resp.text();
  let respData: any;
  try {
    respData = JSON.parse(respText);
  } catch {
    respData = respText;
  }

  if (resp.status >= 400) {
    const errMsg = respData?.message || respData?.code || `HTTP ${resp.status}`;
    throw new Error(`微信支付 API 错误: ${errMsg}`);
  }

  return respData as T;
}

/**
 * 生成小程序调起支付所需的参数
 *
 * 参考 https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_4.shtml
 * 注意：小程序 JSAPI 签名使用 appId 而非服务号的 appId
 */
export function generateMiniProgramPayParams(prepayId: string, appId: string): {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
} {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();
  const pkg = `prepay_id=${prepayId}`;

  const signStr = `${appId}\n${timeStamp}\n${nonce}\n${pkg}\n`;
  const paySign = crypto.createSign('RSA-SHA256')
    .update(signStr)
    .sign(fs.readFileSync(config.wechatPay.privateKeyPath, 'utf-8'), 'base64');

  return {
    timeStamp,
    nonceStr: nonce,
    package: pkg,
    signType: 'RSA',
    paySign,
  };
}

/**
 * 开发模式：生成模拟支付参数（使用真实 RSA 签名保证前端兼容）
 */
export function generateMockPayParams(): {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
} {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr();
  const pkg = 'prepay_id=prepay_mock_' + Date.now();

  const signStr = `${pkg}\n${timeStamp}\n${nonce}\n${pkg}\n`;
  const paySign = crypto.createSign('RSA-SHA256')
    .update(signStr)
    .sign(fs.readFileSync(config.wechatPay.privateKeyPath, 'utf-8'), 'base64');

  return {
    timeStamp,
    nonceStr: nonce,
    package: pkg,
    signType: 'RSA',
    paySign,
  };
}
