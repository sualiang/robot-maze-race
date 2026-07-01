/**
 * 微信服务号消息通知体系
 *
 * 使用微信模板消息（template message）实现：
 * 1. 赛事提醒：决赛开始前推送所有参赛玩家
 * 2. 运营提醒：积分兑换到期、库存不足、优惠券到期等
 * 3. 预留扩展：订单状态、赛事结果、奖励到账
 *
 * 前置条件：
 * - 微信服务号已认证
 * - 模板消息已申请并通过审核
 * - 用户在服务号内授权过（已有 openid）
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware, optionalAuth } from '../middleware/auth';
import {
  ApiResponse,
  NotificationScene,
  NotificationTemplate,
  WxTemplateMessageResult,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// 获取 access_token（服务号全局凭证）
// ============================================================

let cachedAccessToken: string | null = null;
let accessTokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 300_000) {
    return cachedAccessToken;
  }

  const { appId, appSecret } = config.wechatMp;
  if (!appId || !appSecret) {
    throw new Error('微信服务号未配置');
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as { access_token: string; expires_in: number; errcode?: number; errmsg?: string };

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`获取 access_token 失败: ${data.errmsg} (errcode=${data.errcode})`);
  }

  cachedAccessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + (data.expires_in || 7200) * 1000;

  return cachedAccessToken;
}

// ============================================================
// 发送模板消息
// ============================================================

/**
 * 发送单条模板消息
 */
async function sendTemplateMessage(
  openid: string,
  templateId: string,
  data: Record<string, { value: string; color?: string }>,
  url?: string,
  miniprogram?: { appid: string; pagepath: string }
): Promise<WxTemplateMessageResult> {
  const accessToken = await getAccessToken();

  const body: Record<string, any> = {
    touser: openid,
    template_id: templateId,
    data,
  };
  if (url) body.url = url;
  if (miniprogram) body.miniprogram = miniprogram;

  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const result = (await resp.json()) as WxTemplateMessageResult;
  return result;
}

// ============================================================
// 默认模板 ID 配置（需在微信后台申请后替换为真实值）
// ============================================================

const DEFAULT_TEMPLATES: Record<string, string> = {
  [NotificationScene.RACE_REMINDER]: process.env.WX_TEMPLATE_RACE_REMINDER || 'TEMPLATE_RACE_REMINDER_ID',
  [NotificationScene.POINTS_EXPIRE]: process.env.WX_TEMPLATE_POINTS_EXPIRE || 'TEMPLATE_POINTS_EXPIRE_ID',
  [NotificationScene.COUPON_EXPIRE]: process.env.WX_TEMPLATE_COUPON_EXPIRE || 'TEMPLATE_COUPON_EXPIRE_ID',
  [NotificationScene.STOCK_SHORTAGE]: process.env.WX_TEMPLATE_STOCK_SHORTAGE || 'TEMPLATE_STOCK_SHORTAGE_ID',
  [NotificationScene.ORDER_STATUS]: process.env.WX_TEMPLATE_ORDER_STATUS || 'TEMPLATE_ORDER_STATUS_ID',
  [NotificationScene.RACE_RESULT]: process.env.WX_TEMPLATE_RACE_RESULT || 'TEMPLATE_RACE_RESULT_ID',
  [NotificationScene.REWARD_ARRIVED]: process.env.WX_TEMPLATE_REWARD_ARRIVED || 'TEMPLATE_REWARD_ARRIVED_ID',
  [NotificationScene.SYSTEM_NOTICE]: process.env.WX_TEMPLATE_SYSTEM_NOTICE || 'TEMPLATE_SYSTEM_NOTICE_ID',
  [NotificationScene.REFEREE_REVIEW]: process.env.WX_TEMPLATE_REFEREE_REVIEW || 'TEMPLATE_REFEREE_REVIEW_ID',
};

function getTemplateId(scene: NotificationScene): string {
  return DEFAULT_TEMPLATES[scene] || '';
}

// ============================================================
// 通知记录
// ============================================================

async function logNotification(params: {
  scene: string;
  userId: string;
  openid: string;
  templateId: string;
  content: string;
  status: 'success' | 'failed';
  errorMsg?: string;
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO notification_logs (id, scene, user_id, openid, template_id, content, status, error_msg, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        uuidv4(),
        params.scene,
        params.userId,
        params.openid,
        params.templateId,
        params.content,
        params.status,
        params.errorMsg || null,
      ]
    );
  } catch (e: any) {
    console.warn('[WxNotify] 记录通知日志失败:', e.message);
  }
}

// ============================================================
// API 路由
// ============================================================

/**
 * POST /api/v1/notify/race-reminder
 * 赛事提醒：决赛开始前推送所有参赛玩家
 *
 * @header Authorization: Bearer <token>（需管理员权限）
 * @param body.race_id - 赛事 ID
 * @param body.message - 提醒文案
 */
router.post('/race-reminder', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { race_id, message } = req.body;
    // 权限校验
    if (req.user!.role !== 'admin' && req.user!.role !== 'operator') {
      return res.status(403).json({ code: 403, message: '无权限', data: null });
    }

    if (!race_id) {
      return res.status(400).json({ code: 400, message: '缺少赛事 ID', data: null });
    }

    // 查询所有参赛选手
    const players = await query<{ user_id: string; openid: string; nickname: string }>(
      `SELECT rr.user_id, u.openid, u.nickname
       FROM race_results rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.race_id = ? AND u.openid IS NOT NULL AND u.openid != ''`,
      [race_id]
    );

    if (players.length === 0) {
      return res.json({ code: 0, message: '无参赛选手需要通知', data: { total: 0, success: 0, failed: 0 } });
    }

    const templateId = getTemplateId(NotificationScene.RACE_REMINDER);
    const remindMsg = message || '决赛即将开始，请尽快入场准备！';

    let successCount = 0;
    let failCount = 0;
    const results: { openid: string; userId: string; success: boolean }[] = [];

    for (const player of players) {
      try {
        const data = {
          first: { value: remindMsg, color: '#173177' },
          keyword1: { value: `选手 ${player.nickname}`, color: '#173177' },
          keyword2: { value: new Date().toLocaleString('zh-CN'), color: '#173177' },
          remark: { value: '请准时参赛，祝您取得好成绩！', color: '#888888' },
        };

        await sendTemplateMessage(player.openid, templateId, data);
        await logNotification({
          scene: NotificationScene.RACE_REMINDER,
          userId: player.user_id,
          openid: player.openid,
          templateId,
          content: JSON.stringify(data),
          status: 'success',
        });
        successCount++;
        results.push({ openid: player.openid, userId: player.user_id, success: true });
      } catch (e: any) {
        console.error('[WxNotify] 赛事提醒发送失败:', player.openid, e.message);
        await logNotification({
          scene: NotificationScene.RACE_REMINDER,
          userId: player.user_id,
          openid: player.openid,
          templateId,
          content: JSON.stringify({ message: remindMsg }),
          status: 'failed',
          errorMsg: e.message,
        });
        failCount++;
        results.push({ openid: player.openid, userId: player.user_id, success: false });
      }
    }

    return res.json({
      code: 0,
      message: `推送完成：成功 ${successCount}，失败 ${failCount}`,
      data: { total: players.length, success: successCount, failed: failCount, results },
    });
  } catch (error: any) {
    console.error('[WxNotify] race-reminder error:', error.message);
    return res.status(500).json({ code: 500, message: '推送失败', data: null });
  }
});

/**
 * POST /api/v1/notify/operation
 * 运营提醒通用接口
 * 支持：积分到期、优惠券到期、库存不足
 *
 * @header Authorization: Bearer <token>（需管理员/运营商权限）
 * @param body.scene - 通知场景
 * @param body.user_ids - 目标用户 ID 列表（可选，不传则全量推送符合条件的用户）
 * @param body.message - 通知文案
 * @param body.url - 跳转链接（可选）
 */
router.post('/operation', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin' && req.user!.role !== 'operator') {
      return res.status(403).json({ code: 403, message: '无权限', data: null });
    }

    const { scene, user_ids, message, url } = req.body;
    if (!scene) {
      return res.status(400).json({ code: 400, message: '缺少通知场景 scene', data: null });
    }

    let targetUsers: { id: string; openid: string; nickname: string }[] = [];

    if (user_ids && user_ids.length > 0) {
      // 指定用户推送
      const placeholders = user_ids.map(() => '?').join(',');
      targetUsers = await query<{ id: string; openid: string; nickname: string }>(
        `SELECT id, openid, nickname FROM users WHERE id IN (${placeholders}) AND openid IS NOT NULL AND openid != ''`,
        user_ids
      );
    } else {
      // 全量推送符合条件的用户
      switch (scene) {
        case NotificationScene.POINTS_EXPIRE:
          // 积分为正的用户
          targetUsers = await query<{ id: string; openid: string; nickname: string }>(
            `SELECT id, openid, nickname FROM users WHERE points > 0 AND openid IS NOT NULL AND openid != ''`
          );
          break;
        case NotificationScene.COUPON_EXPIRE:
          // 持有有效优惠券的用户
          targetUsers = await query<{ id: string; openid: string; nickname: string }>(
            `SELECT DISTINCT u.id, u.openid, u.nickname
             FROM users u
             JOIN user_coupons uc ON uc.user_id = u.id
             WHERE uc.status = 1 AND u.openid IS NOT NULL AND u.openid != ''`
          );
          break;
        case NotificationScene.STOCK_SHORTAGE:
          // 所有用户（或仅管理员，由运营接口调用方自行决定）
          targetUsers = await query<{ id: string; openid: string; nickname: string }>(
            `SELECT id, openid, nickname FROM users WHERE role = 'admin' OR role = 'operator'`
          );
          break;
        default:
          // 所有有 openid 的用户
          targetUsers = await query<{ id: string; openid: string; nickname: string }>(
            `SELECT id, openid, nickname FROM users WHERE openid IS NOT NULL AND openid != '' LIMIT 100`
          );
      }
    }

    if (targetUsers.length === 0) {
      return res.json({ code: 0, message: '无符合条件的目标用户', data: { total: 0, success: 0, failed: 0 } });
    }

    const templateId = getTemplateId(scene as NotificationScene);
    let successCount = 0;
    let failCount = 0;

    for (const user of targetUsers) {
      try {
        const data = {
          first: { value: message || '系统提醒', color: '#173177' },
          keyword1: { value: new Date().toLocaleString('zh-CN'), color: '#173177' },
          keyword2: { value: '点击查看详情', color: '#173177' },
          remark: { value: '如有疑问请联系客服', color: '#888888' },
        };

        await sendTemplateMessage(user.openid, templateId, data, url);
        await logNotification({
          scene,
          userId: user.id,
          openid: user.openid,
          templateId,
          content: JSON.stringify(data),
          status: 'success',
        });
        successCount++;
      } catch (e: any) {
        await logNotification({
          scene,
          userId: user.id,
          openid: user.openid,
          templateId,
          content: JSON.stringify({ message }),
          status: 'failed',
          errorMsg: e.message,
        });
        failCount++;
      }
    }

    return res.json({
      code: 0,
      message: `推送完成：成功 ${successCount}，失败 ${failCount}`,
      data: { total: targetUsers.length, success: successCount, failed: failCount },
    });
  } catch (error: any) {
    console.error('[WxNotify] operation error:', error.message);
    return res.status(500).json({ code: 500, message: '推送失败', data: null });
  }
});

/**
 * POST /api/v1/notify/single
 * 发送单条通知（内部调用 & 测试用）
 *
 * @header Authorization: Bearer <token>
 * @param body.openid - 目标用户 openid（不传则用当前用户）
 * @param body.scene - 通知场景
 * @param body.data - 模板数据
 * @param body.url - 跳转链接
 */
router.post('/single', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { openid, scene, data, url } = req.body;
    const userId = req.user!.userId;

    let targetOpenid = openid;
    if (!targetOpenid) {
      const user = await queryOne<{ openid: string }>(
        'SELECT openid FROM users WHERE id = ?',
        [userId]
      );
      if (!user || !user.openid) {
        return res.status(400).json({ code: 400, message: '用户未绑定 openid', data: null });
      }
      targetOpenid = user.openid;
    }

    const templateId = getTemplateId((scene as NotificationScene) || NotificationScene.SYSTEM_NOTICE);

    const result = await sendTemplateMessage(targetOpenid, templateId, data);

    await logNotification({
      scene: scene || NotificationScene.SYSTEM_NOTICE,
      userId,
      openid: targetOpenid,
      templateId,
      content: JSON.stringify(data),
      status: result.errcode === 0 ? 'success' : 'failed',
      errorMsg: result.errcode !== 0 ? result.errmsg : undefined,
    });

    if (result.errcode !== 0) {
      return res.status(400).json({ code: result.errcode, message: result.errmsg, data: null });
    }

    return res.json({ code: 0, message: '发送成功', data: { msgid: result.msgid } });
  } catch (error: any) {
    console.error('[WxNotify] single error:', error.message);
    return res.status(500).json({ code: 500, message: error.message, data: null });
  }
});

/**
 * GET /api/v1/notify/logs
 * 查询通知发送日志
 *
 * @header Authorization: Bearer <token>
 * @param query.scene - 按场景筛选（可选）
 * @param query.page - 页码
 * @param query.pageSize - 每页数量
 */
router.get('/logs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { scene, page = '1', pageSize = '20' } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const pageSizeNum = Math.min(parseInt(pageSize as string, 10) || 20, 100);
    const offset = (pageNum - 1) * pageSizeNum;

    let whereClause = '';
    const params: any[] = [];

    if (scene) {
      whereClause = 'WHERE scene = ?';
      params.push(scene);
    }

    const logs = await query<any>(
      `SELECT id, scene, user_id, openid, template_id,
              SUBSTRING(content, 1, 200) as content_preview,
              status, error_msg, created_at
       FROM notification_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSizeNum, offset]
    );

    const countResult = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM notification_logs ${whereClause}`,
      params
    );

    return res.json({
      code: 0,
      data: {
        list: (logs || []).map((l: any) => ({
          id: l.id,
          scene: l.scene,
          userId: l.user_id,
          openid: l.openid,
          templateId: l.template_id,
          contentPreview: l.content_preview,
          status: l.status,
          errorMsg: l.error_msg,
          createdAt: l.created_at,
        })),
        total: countResult?.cnt || 0,
        page: pageNum,
        pageSize: pageSizeNum,
      },
    });
  } catch (error: any) {
    console.error('[WxNotify] logs error:', error.message);
    return res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /api/v1/notify/templates
 * 查询已配置的模板（用于管理后台展示）
 */
router.get('/templates', authMiddleware, async (req: Request, res: Response) => {
  const templates: NotificationTemplate[] = [
    {
      scene: NotificationScene.RACE_REMINDER,
      template_id: getTemplateId(NotificationScene.RACE_REMINDER),
      name: '赛事提醒',
      enabled: true,
    },
    {
      scene: NotificationScene.POINTS_EXPIRE,
      template_id: getTemplateId(NotificationScene.POINTS_EXPIRE),
      name: '积分到期提醒',
      enabled: true,
    },
    {
      scene: NotificationScene.COUPON_EXPIRE,
      template_id: getTemplateId(NotificationScene.COUPON_EXPIRE),
      name: '优惠券到期提醒',
      enabled: true,
    },
    {
      scene: NotificationScene.STOCK_SHORTAGE,
      template_id: getTemplateId(NotificationScene.STOCK_SHORTAGE),
      name: '库存不足提醒',
      enabled: true,
    },
    {
      scene: NotificationScene.ORDER_STATUS,
      template_id: getTemplateId(NotificationScene.ORDER_STATUS),
      name: '订单状态通知',
      enabled: true,
    },
    {
      scene: NotificationScene.RACE_RESULT,
      template_id: getTemplateId(NotificationScene.RACE_RESULT),
      name: '赛事结果通知',
      enabled: true,
    },
    {
      scene: NotificationScene.REWARD_ARRIVED,
      template_id: getTemplateId(NotificationScene.REWARD_ARRIVED),
      name: '奖励到账通知',
      enabled: true,
    },
    {
      scene: NotificationScene.SYSTEM_NOTICE,
      template_id: getTemplateId(NotificationScene.SYSTEM_NOTICE),
      name: '系统公告',
      enabled: true,
    },
    {
      scene: NotificationScene.REFEREE_REVIEW,
      template_id: getTemplateId(NotificationScene.REFEREE_REVIEW),
      name: '裁判审核通知',
      enabled: true,
    },
  ];

  return res.json({ code: 0, data: templates });
});

// ============================================================
// 裁判审核结果通知
// ============================================================

/**
 * 发送裁判审核结果通知（通过微信服务号模板消息）
 * @param params.userId - 裁判关联的 user_id
 * @param params.refereeName - 裁判姓名
 * @param params.status - approved | rejected
 * @param params.remark - 审核备注（驳回时填写原因）
 */
export async function sendRefereeReviewNotification(params: {
  userId: string;
  refereeName: string;
  status: string;
  remark: string;
}): Promise<void> {
  const { userId, refereeName, status, remark } = params;

  try {
    // 查找用户的 openid（优先 mp_openid，再回退 openid）
    const user = await queryOne<{ openid: string; mp_openid: string }>(
      'SELECT openid, mp_openid FROM users WHERE id = $1',
      [userId]
    );

    const targetOpenid = user?.mp_openid || user?.openid || '';

    const isApproved = status === 'approved';
    const title = isApproved
      ? '恭喜您，您的裁判申请已通过审核！现在可以登录使用裁判功能。'
      : `抱歉，您的裁判申请未通过审核。${remark ? '原因：' + remark : ''}如有疑问请联系客服。`;

    console.log('[WxNotify] 裁判审核通知:', {
      userId,
      refereeName,
      status,
      isApproved,
      title,
    });

    // 如果有 openid，尝试发送模板消息
    if (targetOpenid && !targetOpenid.startsWith('mock_') && !targetOpenid.startsWith('dev_') && !targetOpenid.startsWith('ref_') && !targetOpenid.startsWith('plr_')) {
      try {
        const templateId = getTemplateId(NotificationScene.REFEREE_REVIEW);

        // 检查是否是占位模板ID（未配置真实模板ID）
        if (templateId.startsWith('TEMPLATE_')) {
          console.log('[WxNotify] 裁判审核模板消息尚未配置真实模板ID，跳过发送');
          return;
        }

        const data = {
          first: { value: isApproved ? '审核结果通知' : '审核结果通知', color: '#173177' },
          keyword1: { value: refereeName, color: '#173177' },
          keyword2: { value: isApproved ? '已通过' : '未通过', color: isApproved ? '#07C160' : '#FA5151' },
          keyword3: { value: new Date().toLocaleString('zh-CN'), color: '#173177' },
          remark: {
            value: isApproved
              ? '您现在可以登录并使用裁判功能了，祝您工作愉快！'
              : (remark ? `驳回原因：${remark}。如有疑问请联系客服。` : '如有疑问请联系客服。'),
            color: '#888888',
          },
        };

        await sendTemplateMessage(targetOpenid, templateId, data);
        await logNotification({
          scene: NotificationScene.REFEREE_REVIEW,
          userId,
          openid: targetOpenid,
          templateId,
          content: JSON.stringify(data),
          status: 'success',
        });
      } catch (sendErr: any) {
        console.warn('[WxNotify] 裁判审核模板消息发送失败:', sendErr.message);
      }
    } else {
      console.log('[WxNotify] 用户无有效 openid，跳过模板消息发送。通知内容:', title);
    }
  } catch (err: any) {
    // 通知失败不应阻断业务流程
    console.warn('[WxNotify] sendRefereeReviewNotification error:', err.message);
  }
}

export default router;
