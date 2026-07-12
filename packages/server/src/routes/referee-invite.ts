import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

const router = Router();

// ============================================================
// 裁判邀请 & 注册路由（v2：服务号导向流程）
// ============================================================

/**
 * POST /api/v1/referee/invite
 * 运营商生成裁判邀请链接
 * invite_url 指向微信服务号主页（引导关注）
 */
router.post('/invite', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可生成邀请', data: null });
    }
    const { phone, venue_id, note } = req.body;
    let operatorId = '';
    if (role === 'operator') {
      const member = await queryOne<{ operator_id: string }>(
        'SELECT operator_id FROM operator_members WHERE id = $1', [req.user!.userId]
      );
      operatorId = member?.operator_id || (req.user as any).operatorId || req.user!.userId;
    }
    const token = uuidv4();
    const inviteId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const toStr = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 19);
    await execute(
      `INSERT INTO referee_invites (id, operator_id, phone, venue_id, token, note, status, expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9)`,
      [inviteId, operatorId, phone || null, venue_id || null, token, note || null, toStr(expiresAt), toStr(now), toStr(now)]
    );
    const mpBiz = config.wechatMp.biz || '';
    const inviteUrl = mpBiz
      ? `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${mpBiz}#wechat_redirect`
      : `https://dog.amberrobot.com.cn/referee/invite?token=${token}`;
    return res.json({ code: 0, message: '邀请生成成功', data: { token, invite_url: inviteUrl, expires_at: toStr(expiresAt) } });
  } catch (error: any) {
    console.error('[RefereeInvite] invite error:', error.message);
    return res.status(500).json({ code: 500, message: '生成邀请失败: ' + error.message, data: null });
  }
});

/**
 * GET /api/v1/referee/invite/:token/oauth
 * H5 入口 → 微信内 302 OAuth → callback
 */
router.get('/invite/:token/oauth', (req: Request, res: Response) => {
  const { token } = req.params;
  if (!/MicroMessenger/i.test(req.headers['user-agent'] || '')) {
    return res.redirect(`https://dog.amberrobot.com.cn/referee/invite?token=${token}`);
  }
  const appId = config.wechatMp.appId;
  if (!appId) return res.status(500).json({ code: 500, message: '微信服务号未配置', data: null });
  const wxUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}` +
    `&redirect_uri=${encodeURIComponent('https://amberrobot.com.cn/api/v1/wechat/callback')}` +
    `&response_type=code&scope=snsapi_userinfo&state=${token}#wechat_redirect`;
  console.log(`[RefereeInvite] OAuth 302 token=${token}`);
  res.redirect(wxUrl);
});

/**
 * GET /api/v1/referee/invite/:token
 * 获取邀请信息
 */
router.get('/invite/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const invite = await queryOne<{ id: string; operator_id: string; venue_id: string; status: string; expires_at: string; note: string }>(
      'SELECT id, operator_id, venue_id, status, expires_at, note FROM referee_invites WHERE token = $1', [token]
    );
    if (!invite) return res.status(404).json({ code: 404, message: '邀请链接无效', data: null });
    if (new Date() > new Date(invite.expires_at)) {
      await execute('UPDATE referee_invites SET status=$1,updated_at=NOW() WHERE id=$2', ['expired', invite.id]);
      return res.json({ code: 0, message: '邀请已过期', data: { status: 'expired', operator_name: '', venue_name: '', expires_at: invite.expires_at } });
    }
    if (invite.status === 'used') return res.json({ code: 0, message: '邀请已被使用', data: { status: 'used', operator_name: '', venue_name: '', expires_at: invite.expires_at } });
    let operatorName = '', venueName = '';
    if (invite.operator_id) { const op = await queryOne<{ name: string }>('SELECT name FROM operators WHERE id=$1', [invite.operator_id]); operatorName = op?.name || ''; }
    if (invite.venue_id) { const v = await queryOne<{ name: string }>('SELECT name FROM venues WHERE id=$1', [invite.venue_id]); venueName = v?.name || ''; }
    return res.json({ code: 0, message: 'ok', data: { operator_name: operatorName, venue_name: venueName, status: invite.status, expires_at: invite.expires_at, note: invite.note || '' } });
  } catch (error: any) {
    console.error('[RefereeInvite] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取邀请信息失败', data: null });
  }
});

/**
 * POST /api/v1/referee/register
 * 裁判注册 v2：仅姓名 + 手机号
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { invite_token, name, phone } = req.body;
    if (!invite_token) return res.status(400).json({ code: 400, message: '缺少邀请令牌', data: null });
    if (!name || !phone) return res.status(400).json({ code: 400, message: '请填写姓名和手机号', data: null });
    if (!/^\d{11}$/.test(phone)) return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });

    const invite = await queryOne<{ id: string; operator_id: string; venue_id: string; status: string; expires_at: string; openid: string }>(
      'SELECT id, operator_id, venue_id, status, expires_at, openid FROM referee_invites WHERE token = $1', [invite_token]
    );
    if (!invite) return res.status(400).json({ code: 400, message: '邀请链接无效', data: null });
    const now = new Date();
    if (now > new Date(invite.expires_at)) {
      await execute('UPDATE referee_invites SET status=$1,updated_at=NOW() WHERE id=$2', ['expired', invite.id]);
      return res.status(400).json({ code: 400, message: '邀请链接已过期', data: null });
    }
    if (invite.status === 'used') return res.status(400).json({ code: 400, message: '邀请链接已被使用', data: null });

    const existingReferee = await queryOne<{ id: string }>('SELECT id FROM referees WHERE phone = $1', [phone]);
    if (existingReferee) return res.status(400).json({ code: 400, message: '该手机号已被注册为裁判', data: null });

    const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const refereeId = uuidv4();
    const openid = invite.openid || ('ref_invite_' + phone);

    let userId: string;
    const existingUser = await queryOne<{ id: string }>('SELECT id FROM users WHERE openid = $1', [openid]);
    if (existingUser) {
      userId = existingUser.id;
      await execute('UPDATE users SET nickname=$1, phone=$2, role=$3, updated_at=NOW() WHERE id=$4', [name, phone, 'referee', userId]);
    } else {
      userId = uuidv4();
      await execute('INSERT INTO users (id, openid, nickname, phone, role, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [userId, openid, name, phone, 'referee', nowStr, nowStr]);
    }

    await execute(
      'INSERT INTO referees (id, user_id, name, phone, status, venue_id, operator_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [refereeId, userId, name, phone, 'approved', invite.venue_id || null, invite.operator_id || null, nowStr, nowStr]
    );
    await execute('UPDATE referee_invites SET status=$1,updated_at=NOW() WHERE id=$2', ['used', invite.id]);
    return res.status(201).json({ code: 0, message: '注册成功', data: { id: refereeId, name, phone, status: 'approved' } });
  } catch (error: any) {
    console.error('[RefereeInvite] register error:', error.message);
    return res.status(500).json({ code: 500, message: '提交注册失败: ' + error.message, data: null });
  }
});

/**
 * GET /api/v1/referee/invitations
 */
router.get('/invitations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') return res.status(403).json({ code: 403, message: '仅管理员或运营商可查看', data: null });
    const { page: p = '1', pageSize: ps = '20' } = req.query as any;
    const page = Math.max(1, parseInt(p, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(ps, 10) || 20));
    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const params: any[] = [];
    if (role === 'operator') {
      const m = await queryOne<{ operator_id: string }>('SELECT operator_id FROM operator_members WHERE id=$1', [req.user!.userId]);
      const opId = m?.operator_id || (req.user as any).operatorId || req.user!.userId;
      params.push(opId);
      conditions.push(`operator_id = $${params.length}`);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const cnt = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM referee_invites ${where}`, params);
    const total = cnt?.count || 0;
    const list = await query<any>(
      `SELECT id, operator_id, phone, venue_id, token, note, status, openid, expires_at, created_at, updated_at FROM referee_invites ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const mpBiz = config.wechatMp.biz || '';
    const enriched = list.map((inv: any) => ({
      ...inv,
      invite_url: mpBiz
        ? `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${mpBiz}#wechat_redirect`
        : `https://dog.amberrobot.com.cn/referee/invite?token=${inv.token}`,
    }));
    return res.json({ code: 0, message: 'ok', data: { list: enriched, total, page, pageSize } });
  } catch (error: any) {
    console.error('[RefereeInvite] invitations error:', error.message);
    return res.status(500).json({ code: 500, message: '获取邀请列表失败', data: null });
  }
});

export default router;
