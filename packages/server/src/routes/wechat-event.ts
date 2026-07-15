/**
 * 微信服务号事件回调
 *
 * GET  /api/v1/wechat/event — 服务器配置验证（echostr）
 * POST /api/v1/wechat/event — 事件推送（subscribe / SCAN / CLICK 等）
 *
 * 关注/扫码 → 解析 scene_str → 推送注册链接 → 更新 openid
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { queryOne, query, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { sendRegisterLink } from '../services/wechat-message';

const router = Router();

/* ------------------------------------------------------------------ */
/* 签名校验                                                              */
/* ------------------------------------------------------------------ */
function checkSig(ts: string, nonce: string, sig: string): boolean {
  const token = config.wechatMp.token || 'AmberRobot2026';
  const arr = [token, ts, nonce].sort();
  const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex');
  return hash === sig;
}

/* ------------------------------------------------------------------ */
/* 简易 XML 解析（兼容 CDATA 和纯文本标签）                                   */
/* ------------------------------------------------------------------ */
function parseXml(xml: string): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [, tag, val] of xml.matchAll(/<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/g)) m[tag] = val;
  for (const [, tag, val] of xml.matchAll(/<(\w+)>(.*?)<\/\1>/g)) { if (!(tag in m)) m[tag] = val; }
  return m;
}

/* ------------------------------------------------------------------ */
/* 构建文本回复 XML                                                       */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* 从 EventKey 提取 inviteId                                          */
/*   subscribe: EventKey = "qrscene_referee_invite_{invId}"         */
/*   SCAN:      EventKey = "referee_invite_{invId}"                 */
/* scene_str 仅含 inviteId，operator_id 需从 DB 查询                         */
/* ------------------------------------------------------------------ */
function parseScene(key: string): string | null {
  const scene = key.replace(/^qrscene_/, '');
  const m = scene.match(/^referee_invite_(.+)$/);
  if (!m) return null;
  return m[1]; // inviteId only
}

/* ------------------------------------------------------------------ */
/* GET — echostr 验证                                                    */
/* ------------------------------------------------------------------ */
router.get('/event', (req: Request, res: Response) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  if (signature && timestamp && nonce && echostr) {
    if (checkSig(String(timestamp), String(nonce), String(signature))) {
      return res.send(String(echostr));
    }
    return res.status(403).send('invalid signature');
  }
  res.send('ok');
});

/* ------------------------------------------------------------------ */
/* POST — 事件推送                                                       */
/* ------------------------------------------------------------------ */
router.post('/event', async (req: Request, res: Response) => {
  try {
    // 签名验证
    const { signature, timestamp, nonce } = req.query;
    if (signature && timestamp && nonce) {
      if (!checkSig(String(timestamp), String(nonce), String(signature))) {
        console.error('[WechatEvent] 签名失败');
        return res.status(403).send('');
      }
    }

    // 获取原始 XML body
    let xml = '';
    if (typeof req.body === 'string') xml = req.body;
    else if (Buffer.isBuffer(req.body)) xml = req.body.toString('utf-8');
    else xml = (req as any).rawBody || '';

    if (!xml.startsWith('<xml>')) return res.send('');

    const msg = parseXml(xml);
    const msgType = msg.MsgType;
    const event = msg.Event;
    const fromUser = msg.FromUserName;
    const toUser = msg.ToUserName;
    const eventKey = msg.EventKey || '';

    console.log(`[WechatEvent] MsgType=${msgType} Event=${event} From=${fromUser} Key=${eventKey}`);

    if (msgType !== 'event') return res.send('');

    // ---------- subscribe / SCAN ----------
    if (event === 'subscribe' || event === 'SCAN') {
      const inviteId = parseScene(eventKey);
      if (inviteId) {
        console.log(`[WechatEvent] scene matched: inviteId=${inviteId}`);

        // 查 DB 获取 operator_id
        const invite = await queryOne<{ id: string; operator_id: string }>(
          'SELECT id, operator_id FROM referee_invites WHERE id = $1', [inviteId]
        );
        if (!invite) {
          console.error(`[WechatEvent] 邀请记录不存在: ${inviteId}`);
          return res.send('');
        }

        // 将 openid 写入邀请记录
        await execute(
          `UPDATE referee_invites SET openid=$1, updated_at=NOW() WHERE id=$2 AND openid IS NULL`,
          [fromUser, inviteId]
        );

        // 推送客服消息
        try {
          await sendRegisterLink(fromUser, inviteId, invite.operator_id);
        } catch (e: any) {
          console.error('[WechatEvent] 推送失败:', e.message);
        }
      } else {
        // 普通关注（无邀请场景）
        console.log(`[WechatEvent] 普通关注: openid=${fromUser}`);
        // 可在此推送欢迎语，当前不处理
      }
    }

    // ---------- unsubscribe ----------
    if (event === 'unsubscribe') {
      console.log(`[WechatEvent] 取消关注: openid=${fromUser}`);
    }

    // ---------- CLICK（菜单点击）----------
    if (event === 'CLICK') {
      console.log(`[WechatEvent] CLICK: key=${eventKey} openid=${fromUser}`);

      // 现场大屏 → 查裁判绑定赛场，回复大屏链接
      if (eventKey === 'screen_display') {
        try {
          const userRow = await queryOne<{ id: string }>(
            'SELECT id FROM users WHERE mp_openid = $1 OR openid = $1 LIMIT 1',
            [fromUser]
          );
          if (!userRow) {
            return res.type('application/xml').send(
              buildTextReply(fromUser, toUser, '请先联系运营商完成裁判注册并分配到赛场，注册后即可获取现场大屏地址。')
            );
          }

          const refRow = await queryOpOne<{ venue_id: string; operator_id: string }>(req, 
            'SELECT venue_id, operator_id FROM referees WHERE user_id = $1 LIMIT 1',
            [userRow.id]
          );
          if (!refRow || !refRow.venue_id) {
            return res.type('application/xml').send(
              buildTextReply(fromUser, toUser, '请先联系运营商完成裁判注册并分配到赛场，注册后即可获取现场大屏地址。')
            );
          }

          const [venueRow, opRow] = await Promise.all([
            queryOpOne<{ name: string; address: string }>(req, 
              'SELECT name, address FROM venues WHERE id = $1', [refRow.venue_id]
            ),
            queryOne<{ company_name: string }>(
              'SELECT company_name FROM operators WHERE id = $1', [refRow.operator_id]
            ),
          ]);

          const venueName = venueRow?.name || '赛场';
          const venueAddress = venueRow?.address || '暂无';
          const companyName = opRow?.company_name || '暂无';

          const content = [
            '🐕 现场大屏',
            '',
            `「${venueName}」已就绪！`,
            '',
            `📌 赛场：${venueName}`,
            `📍 地址：${venueAddress}`,
            `🏢 运营商：${companyName}`,
            '',
            '🔗 大屏链接（请发送给赛场工作人员）：',
            `https://dog.amberrobot.com.cn/screen/login?venueId=${refRow.venue_id}`,
            '',
            '工作人员打开链接后，输入裁判端「我的」页面显示的激活码即可激活大屏。',
          ].join('\n');

          return res.type('application/xml').send(
            buildTextReply(fromUser, toUser, content)
          );
        } catch (e: any) {
          console.error('[WechatEvent] screen_display error:', e.message);
        }
      }
    }

    // 必须返回空字符串通知微信服务器已收到
    return res.send('');
  } catch (err: any) {
    console.error('[WechatEvent] 异常:', err.message);
    return res.send('');
  }
});

export default router;
