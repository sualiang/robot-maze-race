import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

const router = Router();

// ============================================================
// 裁判邀请 & 注册路由
// ============================================================

/**
 * POST /api/v1/referee/invite
 * 运营商生成裁判邀请链接
 * @header Authorization: Bearer <token> (operator 或 admin)
 * @body phone - 裁判手机号（可选）
 * @body venue_id - 绑定的赛场 ID（可选）
 * @body note - 备注（可选）
 * @returns { token, invite_url, expires_at }
 */
router.post('/invite', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可生成邀请', data: null });
    }

    const { phone, venue_id, note } = req.body;

    // 获取 operator_id
    let operatorId = '';
    if (role === 'operator') {
      // 从 operator_members 获取真实 operator_id
      const member = await queryOne<{ operator_id: string }>(
        'SELECT operator_id FROM operator_members WHERE id = $1',
        [req.user!.userId]
      );
      operatorId = member?.operator_id || (req.user as any).operatorId || req.user!.userId;
    }

    // 生成唯一 token（UUID v4）
    const token = uuidv4();
    const inviteId = uuidv4();
    // 过期时间：24小时后
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiresAtStr = expiresAt.toISOString().replace('T', ' ').substring(0, 19);
    const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);

    await execute(
      `INSERT INTO referee_invites (id, operator_id, phone, venue_id, token, note, status, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9)`,
      [inviteId, operatorId, phone || null, venue_id || null, token, note || null, expiresAtStr, nowStr, nowStr]
    );

    const inviteUrl = `https://amberrobot.com.cn/referee/invite?token=${token}`;

    return res.json({
      code: 0,
      message: '邀请生成成功',
      data: {
        token,
        invite_url: inviteUrl,
        expires_at: expiresAtStr,
      },
    });
  } catch (error: any) {
    console.error('[RefereeInvite] invite error:', error.message);
    return res.status(500).json({ code: 500, message: '生成邀请失败: ' + error.message, data: null });
  }
});

/**
 * GET /api/v1/referee/invite/:token/oauth
 * 页面入口：检测环境发起微信 OAuth（服务端 302，避免前端 JS 跳转白屏）
 * - 微信内 → 302 到微信 snsapi_userinfo 静默授权
 * - 微信外 → 302 到 SPA 引导页
 */
router.get('/invite/:token/oauth', (req: Request, res: Response) => {
  const { token } = req.params;
  const isInWechat = /MicroMessenger/i.test(req.headers['user-agent'] || '');

  if (!isInWechat) {
    // 非微信浏览器，跳回前端 SPA 引导页
    return res.redirect(`https://amberrobot.com.cn/referee/invite?token=${token}`);
  }

  // 微信内 → 构建微信 OAuth URL（snsapi_userinfo 静默授权）
  const appId = config.wechatMp.appId;
  if (!appId) {
    return res.status(500).json({ code: 500, message: '微信服务号未配置', data: null });
  }

  const redirectUri = encodeURIComponent(
    `https://amberrobot.com.cn/referee/invite?token=${token}`
  );
  const wxAuthUrl =
    `https://open.weixin.qq.com/connect/oauth2/authorize?` +
    `appid=${appId}&` +
    `redirect_uri=${redirectUri}&` +
    `response_type=code&` +
    `scope=snsapi_userinfo&` +
    `state=${token}#wechat_redirect`;

  console.log(`[RefereeInvite] 微信内 -> 302 OAuth, token=${token}`);
  res.redirect(wxAuthUrl);
});

/**
 * GET /api/v1/referee/invite/:token
 * 获取邀请信息（无需鉴权，裁判点击链接时调用）
 * @param token - 邀请 token
 * @returns { operator_name, venue_name, status, expires_at }
 */
router.get('/invite/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const invite = await queryOne<{
      id: string;
      operator_id: string;
      venue_id: string;
      status: string;
      expires_at: string;
      note: string;
    }>(
      `SELECT id, operator_id, venue_id, status, expires_at, note
       FROM referee_invites WHERE token = $1`,
      [token]
    );

    if (!invite) {
      return res.status(404).json({ code: 404, message: '邀请链接无效', data: null });
    }

    // 检查是否已过期
    const now = new Date();
    const expiresAt = new Date(invite.expires_at);
    if (now > expiresAt) {
      // 更新状态为 expired
      await execute(
        'UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2',
        ['expired', invite.id]
      );
      return res.json({
        code: 0,
        message: '邀请已过期',
        data: { status: 'expired', operator_name: '', venue_name: '', expires_at: invite.expires_at },
      });
    }

    if (invite.status === 'used') {
      return res.json({
        code: 0,
        message: '邀请已被使用',
        data: { status: 'used', operator_name: '', venue_name: '', expires_at: invite.expires_at },
      });
    }

    // 获取运营商名称
    let operatorName = '';
    if (invite.operator_id) {
      const op = await queryOne<{ name: string }>(
        'SELECT name FROM operators WHERE id = $1',
        [invite.operator_id]
      );
      operatorName = op?.name || '';
    }

    // 获取赛场名称
    let venueName = '';
    if (invite.venue_id) {
      const venue = await queryOne<{ name: string }>(
        'SELECT name FROM venues WHERE id = $1',
        [invite.venue_id]
      );
      venueName = venue?.name || '';
    }

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        operator_name: operatorName,
        venue_name: venueName,
        status: invite.status,
        expires_at: invite.expires_at,
        note: invite.note || '',
      },
    });
  } catch (error: any) {
    console.error('[RefereeInvite] get invite error:', error.message);
    return res.status(500).json({ code: 500, message: '获取邀请信息失败', data: null });
  }
});

/**
 * POST /api/v1/referee/register
 * 裁判提交注册信息（通过邀请链接）
 * @body invite_token - 邀请 token
 * @body name - 姓名
 * @body phone - 手机号
 * @body id_card - 身份证号
 * @body gender - 性别
 * @body birth_date - 出生日期
 * @body province - 省级地区
 * @body city - 市级地区
 * @body district - 区级地区
 * @body address - 详细地址
 * @body experience - 运动经历/简介（选填）
 * @returns 注册结果
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const {
      invite_token,
      name,
      phone,
      id_card,
      gender,
      birth_date,
      province,
      city,
      district,
      address,
      experience,
    } = req.body;

    // 基本校验
    if (!invite_token) {
      return res.status(400).json({ code: 400, message: '缺少邀请令牌', data: null });
    }
    if (!name || !phone || !id_card || !gender || !birth_date || !province || !address) {
      return res.status(400).json({ code: 400, message: '请填写所有必填字段', data: null });
    }
    if (!/^\d{11}$/.test(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });
    }
    if (!/^\d{17}[\dXx]$/.test(id_card)) {
      return res.status(400).json({ code: 400, message: '身份证号格式不正确', data: null });
    }

    // 校验 invite token
    const invite = await queryOne<{
      id: string;
      operator_id: string;
      venue_id: string;
      status: string;
      expires_at: string;
    }>(
      `SELECT id, operator_id, venue_id, status, expires_at
       FROM referee_invites WHERE token = $1`,
      [invite_token]
    );

    if (!invite) {
      return res.status(400).json({ code: 400, message: '邀请链接无效', data: null });
    }

    const now = new Date();
    const expiresAt = new Date(invite.expires_at);
    if (now > expiresAt) {
      await execute(
        'UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2',
        ['expired', invite.id]
      );
      return res.status(400).json({ code: 400, message: '邀请链接已过期', data: null });
    }

    if (invite.status === 'used') {
      return res.status(400).json({ code: 400, message: '邀请链接已被使用', data: null });
    }

    // 检查手机号是否已被注册为裁判
    const existingReferee = await queryOne<{ id: string }>(
      'SELECT id FROM referees WHERE phone = $1',
      [phone]
    );
    if (existingReferee) {
      return res.status(400).json({ code: 400, message: '该手机号已被注册为裁判', data: null });
    }

    const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);

    // 写入 referees 表
    const refereeId = uuidv4();
    // 生成一个临时的 user_id（如果没有通过 OAuth 关联真实用户）
    const tempUserId = uuidv4();

    // 先创建 users 记录（如果没有）
    await execute(
      `INSERT INTO users (id, openid, nickname, phone, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'referee', $5, $6)`,
      [tempUserId, 'ref_invite_' + phone, name, phone, nowStr, nowStr]
    );

    // 创建 referees 记录，status = pending
    await execute(
      `INSERT INTO referees (id, user_id, name, phone, id_number, status, venue_id, operator_id,
        apply_remark, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, $8, $9, $10)`,
      [
        refereeId,
        tempUserId,
        name,
        phone,
        id_card,
        invite.venue_id || null,
        invite.operator_id || null,
        experience || '',
        nowStr,
        nowStr,
      ]
    );

    // 更新邀请状态为 used
    await execute(
      'UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2',
      ['used', invite.id]
    );

    return res.status(201).json({
      code: 0,
      message: '注册成功',
      data: {
        id: refereeId,
        name,
        phone,
        status: 'approved',
      },
    });
  } catch (error: any) {
    console.error('[RefereeInvite] register error:', error.message);
    return res.status(500).json({ code: 500, message: '提交注册失败: ' + error.message, data: null });
  }
});

/**
 * POST /api/v1/referee/bind-openid
 * 微信静默授权后绑定 openid 到邀请记录（路径 B 步骤 a-c）
 */
router.post('/bind-openid', async (req: Request, res: Response) => {
  try {
    const { invite_token, code } = req.body;
    if (!invite_token || !code) {
      return res.status(400).json({ code: 400, message: '缺少 invite_token 或 code', data: null });
    }
    const invite = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM referee_invites WHERE token = $1', [invite_token]);
    if (!invite) return res.status(400).json({ code: 400, message: '邀请链接无效', data: null });
    if (invite.status !== 'active') return res.status(400).json({ code: 400, message: `邀请已${invite.status === 'used' ? '被使用' : '过期'}`, data: null });

    let openid: string;
    if (code === 'dev-test-code' || !config.wechatMp.appId) {
      openid = `mp_dev_openid_${Date.now()}`;
    } else {
      const { appId: mpAppId, appSecret: mpAppSecret } = config.wechatMp;
      const wxUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${mpAppId}&secret=${mpAppSecret}&code=${code}&grant_type=authorization_code`;
      const wxResp = await fetch(wxUrl);
      const wxData = (await wxResp.json()) as any;
      if (wxData.errcode) {
        return res.status(400).json({ code: 400, message: `微信授权失败: ${wxData.errmsg || '未知错误'}`, data: null });
      }
      openid = wxData.openid;
    }
    if (!openid) return res.status(400).json({ code: 400, message: '未能获取 openid', data: null });

    await execute('UPDATE referee_invites SET openid = $1, updated_at = NOW() WHERE id = $2', [openid, invite.id]);
    console.log(`[RefereeInvite] bind-openid: invite_id=${invite.id}, openid=${openid}`);
    return res.json({ code: 0, message: 'ok', data: { success: true } });
  } catch (error: any) {
    console.error('[RefereeInvite] bind-openid error:', error.message);
    return res.status(500).json({ code: 500, message: '绑定 openid 失败: ' + error.message, data: null });
  }
});

/**
 * GET /api/v1/referee/invitations
 * 运营商查询邀请列表（分页）
 */
router.get('/invitations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可查看', data: null });
    }
    const { page: pageStr = '1', pageSize: pageSizeStr = '20' } = req.query;
    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];
    if (role === 'operator') {
      let operatorId = '';
      const member = await queryOne<{ operator_id: string }>(
        'SELECT operator_id FROM operator_members WHERE id = $1', [req.user!.userId]);
      operatorId = member?.operator_id || (req.user as any).operatorId || req.user!.userId;
      conditions.push('operator_id = $' + (params.length + 1));
      params.push(operatorId);
    }
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM referee_invites ${whereClause}`, params);
    const total = countResult?.count || 0;

    const list = await query<any>(
      `SELECT id, operator_id, phone, venue_id, token, note, status, openid, expires_at, created_at, updated_at
       FROM referee_invites ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]);

    const enriched = list.map((inv: any) => ({
      ...inv,
      invite_url: `https://amberrobot.com.cn/referee/invite?token=${inv.token}`,
    }));
    return res.json({ code: 0, message: 'ok', data: { list: enriched, total, page, pageSize } });
  } catch (error: any) {
    console.error('[RefereeInvite] invitations error:', error.message);
    return res.status(500).json({ code: 500, message: '获取邀请列表失败', data: null });
  }
});

export default router;
