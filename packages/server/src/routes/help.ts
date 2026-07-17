import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * GET /player/help/detail?helpId=xxx
 * 助力详情页（无需登录，被分享者打开）
 */
router.get('/help/detail', async (req: Request, res: Response) => {
  const helpId = (req.query.helpId || '') as string;
  if (!helpId) {
    res.json({ code: 400, message: '缺少 helpId 参数', data: null });
    return;
  }

  try {
    const help = await queryOne<any>(
      `SELECT h.id, h.initiator_id, h.target_package_id, h.required_help_count,
              h.current_help_count, h.status, h.expires_at, h.coupon_amount_cents, h.created_at,
              u.nickname AS creator_nickname, u.avatar_url AS creator_avatar,
              rp.name AS package_name
       FROM helps h
       JOIN users u ON h.initiator_id = u.id
       LEFT JOIN race_packages rp ON h.target_package_id = rp.id
       WHERE h.id = $1`,
      [helpId]
    );

    if (!help) {
      res.json({ code: 404, message: '助力活动不存在或已过期', data: null });
      return;
    }

    const helpers = await query<any>(
      `SELECT u.nickname, u.avatar_url
       FROM help_helpers hh
       JOIN users u ON hh.user_id = u.id
       WHERE hh.help_id = $1
       ORDER BY hh.helped_at ASC`,
      [helpId]
    );

    const helperList = (helpers || []).map((h: any) => ({
      nickname: h.nickname || '',
      avatar: h.avatar_url || '',
    }));

    res.json({
      code: 0,
      data: {
        helpId: help.id,
        creatorNickname: help.creator_nickname || '',
        creatorAvatar: help.creator_avatar || '',
        status: help.status,
        helpersCount: help.current_help_count || 0,
        helpersTotal: help.required_help_count || 0,
        helpers: helperList,
        packageName: help.package_name || '',
      },
    });
  } catch (e: any) {
    console.error('[Help] detail error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /player/me/help-status
 * 查询当前用户未过期的助力活动状态
 */
router.get('/me/help-status', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const activity = await queryOne<any>(
      `SELECT id, initiator_id, target_package_id, required_help_count,
              current_help_count, status, expires_at, coupon_amount_cents, created_at
       FROM helps
       WHERE initiator_id = $1
         AND status IN ('initiated', 'in_progress')
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!activity) {
      res.json({ code: 0, data: { activity: null } });
      return;
    }

    const helpers = await query<any>(
      `SELECT hh.user_id, hh.helped_at, u.nickname, u.avatar_url
       FROM help_helpers hh
       JOIN users u ON hh.user_id = u.id
       WHERE hh.help_id = $1
       ORDER BY hh.helped_at ASC`,
      [activity.id]
    );

    const helperList = (helpers || []).map((h: any) => ({
      userId: h.user_id,
      nickname: h.nickname || '',
      avatarUrl: h.avatar_url || '',
      helpedAt: h.helped_at,
    }));

    const emptyCount = Math.max(0, activity.required_help_count - activity.current_help_count);

    res.json({
      code: 0,
      data: {
        activity: {
          id: activity.id,
          helpId: activity.id,
          initiatorId: activity.initiator_id,
          targetPackageId: activity.target_package_id,
          requiredHelpCount: activity.required_help_count,
          currentHelpCount: activity.current_help_count,
          status: activity.status,
          expiresAt: activity.expires_at,
          couponAmountCents: activity.coupon_amount_cents || 0,
          createdAt: activity.created_at,
          helpers: helperList,
          progressPercent:
            activity.required_help_count > 0
              ? Math.min(100, Math.round((activity.current_help_count / activity.required_help_count) * 100))
              : 0,
        },
        emptyCount,
      },
    });
  } catch (e: any) {
    console.error('[Help] help-status error:', e?.message || e);
    res.json({ code: 500, message: '查询助力状态失败', data: null });
  }
});

/**
 * POST /player/help/create
 * 创建助力活动（已有未过期的返回现有活动）
 */
router.post('/help/create', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const targetPackageId = req.body.targetPackageId || req.body.target_package_id || null;

  try {
    // 查是否存在未过期的活动
    const existing = await queryOne<any>(
      `SELECT id FROM helps
       WHERE initiator_id = $1
         AND status IN ('initiated', 'in_progress')
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (existing) {
      // 返回现有活动
      const activity = await queryOne<any>(
        `SELECT id, initiator_id, target_package_id, required_help_count,
                current_help_count, status, expires_at, coupon_amount_cents, created_at
         FROM helps WHERE id = $1`,
        [existing.id]
      );

      const helpers = await query<any>(
        `SELECT hh.user_id, hh.helped_at, u.nickname, u.avatar_url
         FROM help_helpers hh
         JOIN users u ON hh.user_id = u.id
         WHERE hh.help_id = $1
         ORDER BY hh.helped_at ASC`,
        [existing.id]
      );

      const helperList = (helpers || []).map((h: any) => ({
        userId: h.user_id,
        nickname: h.nickname || '',
        avatarUrl: h.avatar_url || '',
        helpedAt: h.helped_at,
      }));

      res.json({
        code: 0,
        data: {
          id: activity.id,
          helpId: activity.id,
          initiatorId: activity.initiator_id,
          targetPackageId: activity.target_package_id,
          requiredHelpCount: activity.required_help_count,
          currentHelpCount: activity.current_help_count,
          status: activity.status,
          expiresAt: activity.expires_at,
          couponAmountCents: activity.coupon_amount_cents || 0,
          createdAt: activity.created_at,
          helpers: helperList,
          progressPercent:
            activity.required_help_count > 0
              ? Math.min(100, Math.round((activity.current_help_count / activity.required_help_count) * 100))
              : 0,
        },
      });
      return;
    }

    // 创建新活动
    const helpId = uuidv4();
    const requiredHelpCount = 3;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

    await execute(
      `INSERT INTO helps (id, initiator_id, target_package_id, required_help_count,
                          current_help_count, status, expires_at, initiated_at, created_at)
       VALUES ($1, $2, $3, $4, 0, 'initiated', $5, $6, $6)`,
      [
        helpId,
        userId,
        targetPackageId,
        requiredHelpCount,
        expiresAt.toISOString().slice(0, 19).replace('T', ' '),
        now.toISOString().slice(0, 19).replace('T', ' '),
      ]
    );

    res.json({
      code: 0,
      data: {
        id: helpId,
        helpId: helpId,
        initiatorId: userId,
        targetPackageId: targetPackageId,
        requiredHelpCount: requiredHelpCount,
        currentHelpCount: 0,
        status: 'initiated',
        expiresAt: expiresAt.toISOString(),
        couponAmountCents: 0,
        createdAt: now.toISOString(),
        helpers: [],
        progressPercent: 0,
      },
    });
  } catch (e: any) {
    console.error('[Help] create error:', e?.message || e);
    res.json({ code: 500, message: '创建助力活动失败', data: null });
  }
});

export default router;
