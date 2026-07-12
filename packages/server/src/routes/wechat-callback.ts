import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { queryOne, query } from '../config/database';

const router = Router();

// ============================================================
// 微信服务号事件回调
// POST /api/v1/wechat/callback
// 验证签名 → 解析 XML → 处理事件（subscribe 等）
// 注意：此路由不依赖 authMiddleware（由微信服务器调用）
// ============================================================

/**
 * 验证微信签名
 */
function checkSignature(timestamp: string, nonce: string, signature: string): boolean {
  const token = config.wechatMp.token;
  if (!token) {
    // 未配置 token 时跳过签名验证（开发环境友好）
    console.warn('[WechatCallback] WECHAT_MP_TOKEN 未配置，跳过签名验证');
    return true;
  }
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  return hash === signature;
}

/**
 * 解析微信 XML 消息体
 */
function parseXmlBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const tagRegex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/g;
  let match;
  while ((match = tagRegex.exec(body)) !== null) {
    result[match[1]] = match[2];
  }
  // Also handle non-CDATA tags
  const simpleTagRegex = /<(\w+)>(.*?)<\/\1>/g;
  while ((match = simpleTagRegex.exec(body)) !== null) {
    if (!(match[1] in result)) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

/**
 * 构建 XML 回复
 */
function buildTextReply(toUser: string, fromUser: string, content: string): string {
  const createTime = Math.floor(Date.now() / 1000);
  return [
    '<xml>',
    `<ToUserName><![CDATA[${toUser}]]></ToUserName>`,
    `<FromUserName><![CDATA[${fromUser}]]></FromUserName>`,
    `<CreateTime>${createTime}</CreateTime>`,
    '<MsgType><![CDATA[text]]></MsgType>',
    `<Content><![CDATA[${content}]]></Content>`,
    '</xml>',
  ].join('');
}

/**
 * 构建图文消息回复
 */
function buildNewsReply(
  toUser: string,
  fromUser: string,
  articles: { title: string; description: string; picUrl: string; url: string }[]
): string {
  const createTime = Math.floor(Date.now() / 1000);
  const articleCount = articles.length;
  const articleItems = articles
    .map(
      (a) =>
        '<item>' +
        `<Title><![CDATA[${a.title}]]></Title>` +
        `<Description><![CDATA[${a.description}]]></Description>` +
        `<PicUrl><![CDATA[${a.picUrl}]]></PicUrl>` +
        `<Url><![CDATA[${a.url}]]></Url>` +
        '</item>'
    )
    .join('');

  return [
    '<xml>',
    `<ToUserName><![CDATA[${toUser}]]></ToUserName>`,
    `<FromUserName><![CDATA[${fromUser}]]></FromUserName>`,
    `<CreateTime>${createTime}</CreateTime>`,
    '<MsgType><![CDATA[news]]></MsgType>',
    `<ArticleCount>${articleCount}</ArticleCount>`,
    '<Articles>',
    articleItems,
    '</Articles>',
    '</xml>',
  ].join('');
}

/**
 * POST /api/v1/wechat/callback
 * 微信服务号事件推送 URL
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { signature, timestamp, nonce, echostr, openid: queryOpenid } = req.query;

    // 1. 签名验证
    if (signature && timestamp && nonce) {
      const valid = checkSignature(
        String(timestamp),
        String(nonce),
        String(signature)
      );
      if (!valid) {
        console.error('[WechatCallback] 签名验证失败');
        return res.status(403).send('Invalid signature');
      }
    }

    // 2. 处理 echostr（微信服务器配置验证 GET 请求）
    if (req.method === 'GET' && echostr) {
      return res.send(String(echostr));
    }

    // 3. 解析 XML 消息体
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    // Express 可能已经解析为 JSON 或 raw XML
    let rawBody: string;
    if (typeof req.body === 'string' && req.body.startsWith('<xml>')) {
      rawBody = body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf-8');
    } else {
      // 尝试从 raw body 获取
      rawBody = (req as any).rawBody || body;
    }

    console.log('[WechatCallback] 收到消息:', rawBody?.substring(0, 200));

    if (!rawBody || !rawBody.startsWith('<xml>')) {
      // 不是 XML 消息体，可能是测试请求
      return res.send('success');
    }

    const msg = parseXmlBody(rawBody);
    const msgType = msg.MsgType;
    const event = msg.Event;
    const fromUserName = msg.FromUserName; // 用户的 openid
    const toUserName = msg.ToUserName; // 服务号微信号

    console.log(`[WechatCallback] MsgType=${msgType}, Event=${event}, FromUserName=${fromUserName}`);

    // 4. 处理事件
    if (msgType === 'event') {
      if (event === 'subscribe') {
        // 用户关注服务号 → 查 referee_invites 是否有此 openid 的活跃邀请
        console.log(`[WechatCallback] subscribe 事件: openid=${fromUserName}`);

        const invite = await queryOne<{
          id: string;
          token: string;
          operator_id: string;
          note: string;
        }>(
          `SELECT id, token, operator_id, note
           FROM referee_invites
           WHERE openid = $1 AND status = 'active'
           ORDER BY created_at DESC LIMIT 1`,
          [fromUserName]
        );

        if (invite) {
          // 找到邀请 → 回复图文消息（邀请链接）
          const inviteUrl = `https://dog.amberrobot.com.cn/referee/register?token=${invite.token}`;
          const operatorNote = invite.note || '您收到一个赛事裁判注册邀请';

          console.log(`[WechatCallback] 匹配到邀请 invite_id=${invite.id}, 回复邀请链接`);

          return res
            .type('application/xml')
            .send(
              buildNewsReply(fromUserName, toUserName, [
                {
                  title: '赛事裁判注册邀请',
                  description: operatorNote,
                  picUrl: 'https://dog.amberrobot.com.cn/logo-avatar.png',
                  url: inviteUrl,
                },
              ])
            );
        }

        // 没有匹配的邀请 → 普通关注欢迎语
        return res
          .type('application/xml')
          .send(
            buildTextReply(
              fromUserName,
              toUserName,
              '欢迎关注安博天智！\n\n点击菜单栏「裁判入口」进入裁判工作台。如需注册，请联系运营商获取邀请链接。'
            )
          );
      }

      if (event === 'unsubscribe') {
        console.log(`[WechatCallback] unsubscribe 事件: openid=${fromUserName}`);
        return res.send('success');
      }

      if (event === 'SCAN') {
        // 已关注用户扫码
        console.log(`[WechatCallback] SCAN 事件: openid=${fromUserName}`);
        return res.send('success');
      }

      // 菜单点击事件
      if (event === 'CLICK') {
        const eventKey = msg.EventKey;
        console.log(`[WechatCallback] CLICK 事件: key=${eventKey}, openid=${fromUserName}`);

        // 处理「裁判入口」菜单
        if (eventKey === 'referee_entry') {
          const refereeUrl = 'https://dog.amberrobot.com.cn/referee/login';
          return res
            .type('application/xml')
            .send(
              buildNewsReply(fromUserName, toUserName, [
                {
                  title: '裁判工作台',
                  description: '点击进入裁判工作台，管理赛事和考勤',
                  picUrl: 'https://dog.amberrobot.com.cn/logo-avatar.png',
                  url: refereeUrl,
                },
              ])
            );
        }
      }
    }

    // 默认回复 success
    return res.send('success');
  } catch (error: any) {
    console.error('[WechatCallback] 处理回调异常:', error.message);
    // 微信服务器需要收到 success，否则会重试
    return res.send('success');
  }
});

/**
 * GET /api/v1/wechat/callback
 * 双重用途：
 *   1. OAuth 回调：微信授权后回调，带 code + state → 换 openid → 绑定 → 跳回前端
 *   2. 服务器配置验证：首次配置微信服务号时的 echostr 验证
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, signature, timestamp, nonce, echostr } = req.query;

  // --- 用途 1: OAuth 回调 ---
  if (code && state) {
    try {
      const appId = config.wechatMp.appId;
      const appSecret = config.wechatMp.appSecret;
      console.log(`[WechatCallback] OAuth回调: code=***, state=${state}`);

      if (!appId || !appSecret) {
        return res.redirect(`https://dog.amberrobot.com.cn/referee/invite?token=${state}&error=wechat_not_configured`);
      }

      // 换 access_token + openid
      const wxUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;
      const tokenResp = await fetch(wxUrl);
      const tokenData: any = await tokenResp.json();

      if (tokenData.errcode) {
        console.error(`[WechatCallback] access_token失败: ${tokenData.errcode} ${tokenData.errmsg}`);
        return res.redirect(`https://dog.amberrobot.com.cn/referee/invite?token=${state}&error=wechat_token_failed`);
      }

      const openid = tokenData.openid;
      if (!openid) {
        return res.redirect(`https://dog.amberrobot.com.cn/referee/invite?token=${state}&error=no_openid`);
      }
      console.log(`[WechatCallback] OAuth成功: openid=${openid}`);

      // 验证 token + 写入 openid
      const invite = await queryOne<{ id: string }>(
        `SELECT id FROM referee_invites WHERE token = $1`,
        [String(state)]
      );
      if (!invite) {
        return res.redirect(`https://dog.amberrobot.com.cn/referee/invite?token=${state}&error=invalid_token`);
      }

      await query(
        `UPDATE referee_invites SET openid = $1, updated_at = NOW() WHERE token = $2`,
        [openid, String(state)]
      );
      console.log(`[WechatCallback] openid绑定: invite=${invite.id}`);

      // 跳回前端 SPA
      return res.redirect(`https://dog.amberrobot.com.cn/referee/invite?token=${state}`);
    } catch (err: any) {
      console.error('[WechatCallback] OAuth异常:', err.message);
      return res.redirect(`https://dog.amberrobot.com.cn/referee/invite?token=${state}&error=internal`);
    }
  }

  // --- 用途 2: 服务器配置验证（echostr） ---
  if (!signature || !timestamp || !nonce || !echostr) {
    return res.status(400).send('Missing parameters');
  }

  const valid = checkSignature(
    String(timestamp),
    String(nonce),
    String(signature)
  );

  if (valid) {
    return res.send(String(echostr));
  }

  return res.status(403).send('Invalid signature');
});

export default router;
