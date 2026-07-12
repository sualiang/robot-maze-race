/**
 * 微信带参数二维码服务
 *
 * 调用微信 API 生成永久二维码（QR_LIMIT_STR_SCENE），
 * 用户扫码后微信推送 subscribe/SCAN 事件。
 *
 * API: POST https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=TOKEN
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/Account_Management/Generating_a_Parametric_QR_Code.html
 */
import { getAccessToken } from './wechat-token';

interface QRCodeResult {
  ticket: string;
  url: string;
  /** 二维码图片链接 */
  qrcodeUrl: string;
}

/**
 * 创建裁判邀请二维码
 *
 * @param operatorId 运营商 ID
 * @param inviteId   邀请记录 ID
 * @returns { ticket, url, qrcodeUrl }
 */
export async function createRefereeQRCode(
  operatorId: string,
  inviteId: string
): Promise<QRCodeResult> {
  const sceneStr = `referee_invite_${operatorId}_${inviteId}`;
  const accessToken = await getAccessToken();

  const url = `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${accessToken}`;

  const body = JSON.stringify({
    action_name: 'QR_LIMIT_STR_SCENE',
    action_info: {
      scene: {
        scene_str: sceneStr,
      },
    },
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data: any = await resp.json();

  if (data.errcode && data.errcode !== 0) {
    throw new Error(
      `生成二维码失败: ${data.errmsg || '未知错误'} (errcode=${data.errcode})`
    );
  }

  return {
    ticket: data.ticket,
    url: data.url,
    qrcodeUrl: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(data.ticket)}`,
  };
}
