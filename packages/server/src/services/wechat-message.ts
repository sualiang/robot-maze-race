/**
 * 微信客服消息推送
 *
 * 用户关注/扫码后，通过客服消息接口主动推送注册链接。
 *
 * API: POST https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=TOKEN
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Service_Center_messages.html
 */
import { getAccessToken } from './wechat-token';

/**
 * 发送裁判注册链接（文本消息）
 *
 * @param openid     用户 openid
 * @param inviteId   邀请记录 ID
 * @param operatorId 运营商 ID
 */
export async function sendRegisterLink(
  openid: string,
  inviteId: string,
  operatorId: string
): Promise<void> {
  const accessToken = await getAccessToken();
  const registerUrl = `https://dog.amberrobot.com.cn/referee/register?invite_id=${inviteId}&operator_id=${operatorId}`;

  const content =
    `欢迎申请铁甲快狗裁判资格，请点击下方链接完成注册：\n\n` +
    `👉 <a href="${registerUrl}">点此完成裁判注册</a>\n\n` +
    `注册后可从公众号底部菜单随时进入系统。`;

  const body = JSON.stringify({
    touser: openid,
    msgtype: 'text',
    text: {
      content,
    },
  });

  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data: any = await resp.json();

  if (data.errcode && data.errcode !== 0) {
    console.error(
      `[WechatMessage] 发送失败: ${data.errmsg} (errcode=${data.errcode})`
    );
    throw new Error(
      `发送客服消息失败: ${data.errmsg || '未知错误'}`
    );
  }

  console.log(`[WechatMessage] 已推送注册链接: openid=${openid}, invite=${inviteId}`);
}

/**
 * 发送普通文本消息
 */
export async function sendTextMessage(
  openid: string,
  content: string
): Promise<void> {
  const accessToken = await getAccessToken();
  const body = JSON.stringify({
    touser: openid,
    msgtype: 'text',
    text: { content },
  });
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data: any = await resp.json();
  if (data.errcode && data.errcode !== 0) {
    console.error(`[WechatMessage] 文本发送失败: ${data.errmsg}`);
  }
}
