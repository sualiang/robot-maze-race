import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

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
