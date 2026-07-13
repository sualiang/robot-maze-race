/**
 * 微信带参数二维码服务
 *
 * 调用微信 API 生成永久二维码（QR_LIMIT_STR_SCENE），
 * 用户扫码后微信推送 subscribe/SCAN 事件。
 *
 * API: POST https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=TOKEN
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/Account_Management/Generating_a_Parametric_QR_Code.html
 */
import { getAccessToken, getMiniProgramAccessToken } from './wechat-token';

interface QRCodeResult {
  ticket: string;
  url: string;
  /** 二维码图片链接 */
  qrcodeUrl: string;
}

/**
 * 创建裁判邀请二维码
 *
 * scene_str 只使用 inviteId 以控制在 64 字符以内。
 * 微信 QR_LIMIT_STR_SCENE 限制 scene_str ≤ 64 字符，
 * "referee_invite_" (15) + UUID (36) = 51 字符 ✅
 *
 * @param inviteId   邀请记录 ID
 * @returns { ticket, url, qrcodeUrl }
 */
export async function createRefereeQRCode(
  inviteId: string
): Promise<QRCodeResult> {
  const sceneStr = `referee_invite_${inviteId}`;
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

/**
 * 微信小程序码结果
 */
interface MiniCodeResult {
  /** base64 编码的图片 buffer */
  imageBase64: string;
  /** 图片 MIME 类型（image/jpeg） */
  contentType: string;
}

/**
 * 生成赛场带参数小程序码
 *
 * 调用微信 getwxacodeunlimit API，scene 字段携带加密后的
 * operator_id + venue_id，用户扫码进入小程序后小程序端解析
 * scene 建立运营商上下文。
 *
 * scene 限制 32 字节。UUID 去掉连字符后为 32 位十六进制，
 * 用前缀区分字段后拼装：
 *   o{operatorId 无连字符前 14 位}v{venueId 无连字符前 14 位}
 *   1 + 14 + 1 + 14 = 30 字符 ✅
 *
 * API: POST https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=TOKEN
 *
 * @param operatorId  运营商 ID
 * @param venueId     赛场 ID
 * @returns { imageBase64, contentType }
 */
export async function createVenueMiniCode(
  operatorId: string,
  venueId: string,
): Promise<MiniCodeResult> {
  const accessToken = await getMiniProgramAccessToken();

  // scene 限制 32 字节。UUID 去掉连字符后为 32 位十六进制，
  // 用两位前缀区分字段后拼装
  const opShort = operatorId.replace(/-/g, '').substring(0, 14);
  const venShort = venueId.replace(/-/g, '').substring(0, 14);
  const scene = `o${opShort}v${venShort}`;

  const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`;

  const body = JSON.stringify({
    scene,
    page: 'pages/index/index',
    width: 430,
    auto_color: false,
    line_color: { r: 255, g: 107, b: 53 },
    is_hyaline: false,
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  // 微信返回图片二进制或 JSON 报错
  const contentType = resp.headers.get('content-type') || '';
  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (contentType.includes('application/json') || contentType.includes('text/')) {
    let err: any;
    try { err = JSON.parse(buffer.toString()); } catch {
      throw new Error('生成小程序码失败: 非预期返回 ' + buffer.slice(0, 100).toString());
    }
    throw new Error(`生成小程序码失败: ${err.errmsg || '未知错误'} (errcode=${err.errcode})`);
  }

  return {
    imageBase64: buffer.toString('base64'),
    contentType: 'image/jpeg',
  };
}
