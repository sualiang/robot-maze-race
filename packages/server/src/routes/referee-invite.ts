import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp, getOperatorPool } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';
import { createRefereeQRCode } from '../services/wechat-qrcode';

const router = Router();

// ============================================================
// 裁判邀请 & 注册路由（v3：带参数二维码）
// ============================================================

/**
 * POST /api/v1/referee/invite
 * 运营商生成裁判邀请 — 调用微信API生成带参数二维码
 * 返回二维码图片URL（运营商发给申请人扫码关注）
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
      // JWT 中 userId 和 operatorId 都是 operators.id
      operatorId = (req.user as any).operatorId || req.user!.userId;
    }
    const inviteToken = uuidv4();
    const inviteId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const toStr = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 19);

    // 调用微信API生成带参数二维码
    let sceneStr = '';
    let ticket = '';
    let qrcodeUrl = '';
    try {
      const qrResult = await createRefereeQRCode(inviteId);
      ticket = qrResult.ticket;
      qrcodeUrl = qrResult.qrcodeUrl;
      sceneStr = `referee_invite_${inviteId}`;
    } catch (e: any) {
      // 二维码生成失败不阻塞 — 降级为普通 token 链接
      console.error('[RefereeInvite] 二维码生成失败:', e.message);
    }

    await execute(
      `INSERT INTO referee_invites (id, operator_id, phone, venue_id, token, note, status, ticket, expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10)`,
      [inviteId, operatorId || '', phone || null, venue_id || null, inviteToken, note || null,
       ticket || null, toStr(expiresAt), toStr(now), toStr(now)]
    );

    const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;
    const inviteUrl = `${baseUrl}/#/referee/invite?token=${inviteToken}`;

    return res.json({
      code: 0, message: '邀请生成成功',
      data: {
        id: inviteId,
        token: inviteToken,
        invite_url: inviteUrl,
        qrcode_url: qrcodeUrl,

        expires_at: toStr(expiresAt),
      },
    });
  } catch (error: any) {
    console.error('[RefereeInvite] invite error:', error.message);
    return res.status(500).json({ code: 500, message: '生成邀请失败: ' + error.message, data: null });
  }
});

/**
 * GET /api/v1/referee/invite/:inviteId
 * 获取邀请信息（按 invite_id 查询）
 */
router.get('/invite/:inviteId', async (req: Request, res: Response) => {
  try {
    const param = req.params.inviteId;
    // Try invite_id first, then token (backward compat)
    let invite = await queryOne<{ id: string; operator_id: string; venue_id: string; status: string; expires_at: string; note: string }>(
      'SELECT id, operator_id, venue_id, status, expires_at, note FROM referee_invites WHERE id = $1', [param]
    );
    if (!invite) {
      invite = await queryOne<{ id: string; operator_id: string; venue_id: string; status: string; expires_at: string; note: string }>(
        'SELECT id, operator_id, venue_id, status, expires_at, note FROM referee_invites WHERE token = $1', [param]
      );
    }
    if (!invite) return res.status(404).json({ code: 404, message: '邀请链接无效', data: null });
    if (new Date() > new Date(invite.expires_at)) {
      await execute('UPDATE referee_invites SET status=$1,updated_at=NOW() WHERE id=$2', ['expired', invite.id]);
      return res.json({ code: 0, message: '邀请已过期', data: { status: 'expired', operator_name: '', venue_name: '', expires_at: invite.expires_at } });
    }
    if (invite.status === 'used') return res.json({ code: 0, message: '邀请已被使用', data: { status: 'used', operator_name: '', venue_name: '', expires_at: invite.expires_at } });
    let operatorName = '', venueName = '';
    if (invite.operator_id) { const op = await queryOne<{ name: string }>('SELECT name FROM operators WHERE id = $1', [invite.operator_id]); operatorName = op?.name || ''; }
    if (invite.venue_id) { const v = await queryOpOne<{ name: string }>(req, 'SELECT name FROM venues WHERE id = $1', [invite.venue_id]); venueName = v?.name || ''; }
    return res.json({ code: 0, message: 'ok', data: { id: invite.id, operator_id: invite.operator_id, operator_name: operatorName, venue_name: venueName, status: invite.status, expires_at: invite.expires_at, note: invite.note || '' } });
  } catch (error: any) {
    console.error('[RefereeInvite] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取邀请信息失败', data: null });
  }
});

/**
 * POST /api/v1/referee/register
 * 裁判注册 v3：invite_id（或 token） + operator_id + 姓名 + 手机号
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { invite_id, token: bodyToken, name, phone } = req.body;
    const lookupId = invite_id || bodyToken;
    if (!lookupId) return res.status(400).json({ code: 400, message: '缺少邀请ID', data: null });
    if (!name || !phone) return res.status(400).json({ code: 400, message: '请填写姓名和手机号', data: null });
    if (!/^\d{11}$/.test(phone)) return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });

    // 支持 invite_id 或 token 查找邀请记录
    let invite = await queryOne<{ id: string; operator_id: string; venue_id: string; status: string; expires_at: string }>(
      'SELECT id, operator_id, venue_id, status, expires_at FROM referee_invites WHERE id = $1', [lookupId]
    );
    if (!invite) {
      invite = await queryOne<{ id: string; operator_id: string; venue_id: string; status: string; expires_at: string }>(
        'SELECT id, operator_id, venue_id, status, expires_at FROM referee_invites WHERE token = $1', [lookupId]
      );
    }
    if (!invite) return res.status(400).json({ code: 400, message: '邀请链接无效', data: null });
    const now = new Date();
    if (now > new Date(invite.expires_at)) {
      await execute('UPDATE referee_invites SET status=$1,updated_at=NOW() WHERE id=$2', ['expired', invite.id]);
      return res.status(400).json({ code: 400, message: '邀请链接已过期', data: null });
    }
    if (invite.status === 'used') return res.status(400).json({ code: 400, message: '邀请链接已被使用', data: null });

    // 跨运营商允许同手机号注册裁判，只查当前邀请对应的运营商隔离库
    const opDbName = invite.operator_id
      ? (await queryOne<{ db_name: string }>('SELECT db_name FROM operators_registry WHERE operator_id = $1', [invite.operator_id]))?.db_name
      : null;
    let existingRef = null;
    if (opDbName) {
      const opPool = getOperatorPool(opDbName);
      const [rows] = await opPool.execute('SELECT id FROM referees WHERE phone = ?', [phone]);
      existingRef = (rows as any[])?.[0] || null;
    }
    if (existingRef) return res.status(400).json({ code: 400, message: '该手机号已被注册为裁判', data: null });

    const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const refereeId = uuidv4();
    const openid = 'ref_invite_' + phone;

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

    // 注册路由无 auth，不能用 executeOp（需要 req 里有 operator context）
    // opDbName 已在上方查过
    if (!opDbName) return res.status(500).json({ code: 500, message: '运营商信息不完整', data: null });

    const opPool = getOperatorPool(opDbName);
    const [result] = await opPool.execute(
      `INSERT INTO referees (id, operator_id, user_id, name, phone, status, venue_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [refereeId, invite.operator_id, userId, name, phone, 'approved', invite.venue_id || null, nowStr, nowStr]
    );
    console.log('[RefereeInvite] INSERT referees result:', result);
    await execute('UPDATE referee_invites SET status=$1,updated_at=NOW() WHERE id=$2', ['used', invite.id]);

    // 签发 JWT token
    const token = jwt.sign(
      { userId, openid: openid, role: 'referee' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    );

    return res.status(201).json({
      code: 0, message: '注册成功',
      data: { token, user: { id: refereeId, name, phone, role: 'referee' } },
    });
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
      conditions.push(`operator_id = $1`);
      params.push(opId);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const cnt = await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM referee_invites ${where}`, params);
    const total = cnt?.count || 0;
    const list = await query<any>(
      `SELECT id, phone, venue_id, token, note, status, ticket, expires_at, created_at, updated_at FROM referee_invites ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    const enriched = list.map((inv: any) => {
      const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;
      return {
        ...inv,
        invite_url: `${baseUrl}/#/referee/invite?token=${encodeURIComponent(inv.token)}`,
        qrcode_url: inv.ticket
          ? `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(inv.ticket)}`
          : '',
      };
    });
    return res.json({ code: 0, message: 'ok', data: { list: enriched, total, page, pageSize } });
  } catch (error: any) {
    console.error('[RefereeInvite] invitations error:', error.message);
    return res.status(500).json({ code: 500, message: '获取邀请列表失败', data: null });
  }
});

/**
 * GET /api/v1/referee/invite/:token/oauth
 * 微信 OAuth 授权入口 — 校验 token 有效性 → 302 跳转微信授权页
 */
router.get('/invite/:token/oauth', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ code: 400, message: '缺少邀请令牌', data: null });
    }

    // 校验邀请记录
    const invite = await queryOne<{ id: string; status: string; expires_at: string }>(
      'SELECT id, status, expires_at FROM referee_invites WHERE token = $1', [token]
    );
    if (!invite) {
      return res.status(400).json({ code: 400, message: '邀请链接无效', data: null });
    }
    if (invite.status !== 'active' || new Date() > new Date(invite.expires_at)) {
      return res.status(400).json({ code: 400, message: '邀请链接已过期', data: null });
    }

    const { appId } = config.wechatMp;
    if (!appId) {
      return res.status(500).json({ code: 500, message: '微信服务号未配置', data: null });
    }

    // 回调地址：OAuth 授权后回到当前 H5 页面
    // 使用 hash 路由，确保 WeChat 回调的 ?code=xxx 能正确被 SPA useSearchParams 读取
    const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;
    const callbackUrl = `${baseUrl}/#/referee/invite?token=${encodeURIComponent(token)}`;
    const redirectUri = encodeURIComponent(callbackUrl);

    const wxUrl =
      `https://open.weixin.qq.com/connect/oauth2/authorize?` +
      `appid=${appId}&` +
      `redirect_uri=${redirectUri}&` +
      `response_type=code&` +
      `scope=snsapi_userinfo&` +
      `state=referee_invite#wechat_redirect`;

    return res.redirect(wxUrl);
  } catch (error: any) {
    console.error('[RefereeInvite] oauth error:', error.message);
    return res.status(500).json({ code: 500, message: '授权失败', data: null });
  }
});

export default router;
