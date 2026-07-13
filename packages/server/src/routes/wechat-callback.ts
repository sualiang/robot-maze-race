import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { queryOne, query, execute } from '../config/database';
import { sendRegisterLink } from '../services/wechat-message';

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
      if (event === 'subscribe' || event === 'SCAN') {
        console.log(`[WechatCallback] ${event} 事件: openid=${fromUserName}, EventKey=${msg.EventKey}`);

        // 解析 EventKey 提取 inviteId
        // subscribe: EventKey = "qrscene_referee_invite_{inviteId}"
        // SCAN:      EventKey = "referee_invite_{inviteId}"
        const eventKey = (msg.EventKey || '').replace(/^qrscene_/, '');
        const sceneMatch = eventKey.match(/^referee_invite_(.+)$/);

        if (sceneMatch) {
          const inviteId = sceneMatch[1];
          // 查 DB 获取 operator_id
          const invite = await queryOne<{ id: string; operator_id: string }>(
            'SELECT id, operator_id FROM referee_invites WHERE id = $1', [inviteId]
          );
          if (invite) {
            // 写入 openid
            await execute(
              'UPDATE referee_invites SET openid=$1, updated_at=NOW() WHERE id=$2 AND openid IS NULL',
              [fromUserName, inviteId]
            );
            // 推送客服消息
            try {
              await sendRegisterLink(fromUserName, inviteId, invite.operator_id);
              console.log(`[WechatCallback] 已推送注册链接: inviteId=${inviteId}`);
            } catch (e: any) {
              console.error('[WechatCallback] 客服消息推送失败:', e.message);
            }
          } else {
            console.log(`[WechatCallback] 未找到邀请记录: inviteId=${inviteId}`);
          }
        } else {
          // 普通关注/扫码（无邀请场景）→ 回复欢迎语
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

        // 处理「现场大屏」菜单
        if (eventKey === 'screen_display') {
          try {
            // 1. users 表 → user_id
            const user = await queryOne<{ id: string }>(
              'SELECT id FROM users WHERE openid = $1', [fromUserName]
            );
            if (!user) {
              return res
                .type('application/xml')
                .send(
                  buildTextReply(
                    fromUserName, toUserName,
                    '请先联系运营商完成裁判注册并分配到赛场，注册后即可获取现场大屏地址。'
                  )
                );
            }

            // 2. referees 表 → venue_id, operator_id
            const ref = await queryOne<{ venue_id: string; operator_id: string }>(
              'SELECT venue_id, operator_id FROM referees WHERE user_id = $1', [user.id]
            );
            if (!ref || !ref.venue_id) {
              return res
                .type('application/xml')
                .send(
                  buildTextReply(
                    fromUserName, toUserName,
                    '请先联系运营商完成裁判注册并分配到赛场，注册后即可获取现场大屏地址。'
                  )
                );
            }

            // 3. venues 表 → name, address
            const venue = await queryOne<{ name: string; address: string }>(
              'SELECT name, address FROM venues WHERE id = $1', [ref.venue_id]
            );
            const venueName = venue?.name || ref.venue_id;
            const venueAddress = venue?.address || '';

            // 4. operators 表 → company_name
            const op = await queryOne<{ company_name: string }>(
              'SELECT company_name FROM operators WHERE id = $1', [ref.operator_id]
            );
            const companyName = op?.company_name || '安博天智';

            const venueId = ref.venue_id;
            const text = [
              '🐕 现场大屏',
              '',
              `「${venueName}」已就绪！`,
              '',
              `📌 赛场：${venueName}`,
              `📍 地址：${venueAddress}`,
              `🏢 运营商：${companyName}`,
              '',
              '🔗 大屏链接（请发送给赛场工作人员）：',
              `https://dog.amberrobot.com.cn/screen?venueId=${venueId}`,
              '',
              '工作人员打开链接后，输入裁判端「我的」页面显示的激活码即可激活大屏。',
            ].join('\n');

            return res
              .type('application/xml')
              .send(buildTextReply(fromUserName, toUserName, text));
          } catch (e: any) {
            console.error('[WechatCallback] screen_display error:', e.message);
            return res.send('success');
          }
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
/**
 * GET /api/v1/wechat/callback
 * 1. OAuth: code+state -> openid -> bind -> check user -> redirect
 * 2. echostr: WeChat server verification
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, signature, timestamp, nonce, echostr } = req.query;

  // --- OAuth callback ---
  if (code && state) {
    try {
      const appId = config.wechatMp.appId;
      const appSecret = config.wechatMp.appSecret;
      const token = String(state);
      console.log('[WechatCallback] OAuth: token=' + token);

      if (!appId || !appSecret) {
        return res.redirect('https://dog.amberrobot.com.cn/referee/invite?token=' + token + '&error=wechat_not_configured');
      }

      const wxUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + appId + '&secret=' + appSecret + '&code=' + code + '&grant_type=authorization_code';
      const tokenResp = await fetch(wxUrl);
      const tokenData: any = await tokenResp.json();

      if (tokenData.errcode) {
        console.error('[WechatCallback] token failed: ' + tokenData.errcode);
        return res.redirect('https://dog.amberrobot.com.cn/referee/invite?token=' + token + '&error=wechat_token_failed');
      }

      const openid = tokenData.openid;
      if (!openid) {
        return res.redirect('https://dog.amberrobot.com.cn/referee/invite?token=' + token + '&error=no_openid');
      }
      console.log('[WechatCallback] openid=' + openid);

      // Check if this openid is already a referee
      const existingReferee = await queryOne<{ id: string; name: string }>(
        'SELECT r.id, r.name FROM referees r INNER JOIN users u ON r.user_id = u.id WHERE u.openid = $1 LIMIT 1',
        [openid]
      );

      if (existingReferee) {
        console.log('[WechatCallback] returning user: ' + existingReferee.name);
        return res.redirect('https://dog.amberrobot.com.cn/referee/login?openid_auth=' + openid);
      }

      // Bind openid to invite if token is a real invite
      if (token !== '__login__') {
        const invite = await queryOne<{ id: string }>(
          'SELECT id FROM referee_invites WHERE token = $1', [token]
        );
        if (!invite) {
          return res.redirect('https://dog.amberrobot.com.cn/referee/invite?token=' + token + '&error=invalid_token');
        }
        await query(
          'UPDATE referee_invites SET openid = $1, updated_at = NOW() WHERE token = $2',
          [openid, token]
        );
        console.log('[WechatCallback] bound invite=' + invite.id);
        console.log('[WechatCallback] new user -> register');
        return res.redirect('https://dog.amberrobot.com.cn/referee/register?token=' + token);
      }

      // __login__ flow (service account menu silent OAuth)
      console.log('[WechatCallback] __login__: openid=' + openid);
      // Check if this openid is a referee
      const ref = await queryOne<{ id: string }>(
        'SELECT r.id FROM referees r INNER JOIN users u ON r.user_id = u.id WHERE u.openid = $1 LIMIT 1',
        [openid]
      );
      if (ref) {
        // Returning referee → redirect to login with openid_auth
        return res.redirect('https://dog.amberrobot.com.cn/referee/login?openid_auth=' + openid);
      }
      // Not registered → redirect to login with not_registered flag
      return res.redirect('https://dog.amberrobot.com.cn/referee/login?openid_auth=' + openid + '&not_registered=1');
    } catch (err: any) {
      console.error('[WechatCallback] OAuth error:', err.message);
      return res.redirect('https://dog.amberrobot.com.cn/referee/invite?token=' + String(state) + '&error=internal');
    }
  }

  // --- echostr verification ---
  if (!signature || !timestamp || !nonce || !echostr) {
    return res.status(400).send('Missing parameters');
  }
  const valid = checkSignature(String(timestamp), String(nonce), String(signature));
  if (valid) return res.send(String(echostr));
  return res.status(403).send('Invalid signature');
});

export default router;
