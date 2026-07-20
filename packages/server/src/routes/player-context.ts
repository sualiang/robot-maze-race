import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getOperatorContext, setOperatorContext } from '../middleware/operator-context';
import { queryOne, queryOp, queryOpOne, executeOp, getOperatorPool, doQueryOne } from '../config/database';

const router = Router();

/**
 * POST /api/v1/player/context/set
 * 设置玩家运营商上下文（小程序扫码进入后调用）
 * @body operatorId - 运营商 ID
 * @body venueId - 赛场 ID（可选）
 */
router.post('/player/context/set', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { operatorId, venueId } = req.body;

  if (!operatorId) {
    res.status(400).json({ code: 400, message: '缺少 operatorId', data: null });
    return;
  }

  try {
    let fullOperatorId = operatorId;
    let fullVenueId = venueId;

    // scene 扫码只传了 UUID 前缀（去连字符后前 14 位），需补齐完整 UUID
    // 从全局 operators 表 LIKE 匹配
    if (operatorId.length < 32) {
      const matched = await queryOne<{ id: string }>(
        `SELECT id FROM operators WHERE REPLACE(id, '-', '') LIKE $1 LIMIT 1`,
        [operatorId + '%']
      );
      if (matched?.id) {
        fullOperatorId = matched.id;
        console.log('[PlayerContext] 补全 operatorId: ' + operatorId + ' → ' + fullOperatorId);
      } else {
        console.warn('[PlayerContext] 无法补全 operatorId 前缀: ' + operatorId);
      }
    }

    // venueId 同理，需要对应运营商库来匹配
    if (fullVenueId && fullVenueId.length < 32 && fullOperatorId) {
      try {
        // 从 operators_registry 查该运营商的 db_name
        const registry = await queryOne<{ db_name: string }>(
          `SELECT db_name FROM operators_registry WHERE operator_id = $1 AND db_name IS NOT NULL LIMIT 1`,
          [fullOperatorId]
        );
        if (registry?.db_name) {
          const matched = await doQueryOne(
            getOperatorPool(registry.db_name),
            `SELECT id FROM venues WHERE REPLACE(id, '-', '') LIKE ? LIMIT 1`,
            [fullVenueId + '%']
          );
          if (matched?.id) {
            console.log('[PlayerContext] 补全 venueId: ' + fullVenueId + ' → ' + matched.id);
            fullVenueId = matched.id;
          }
        }
      } catch (e: any) {
        console.warn('[PlayerContext] 无法补全 venueId 前缀: ' + fullVenueId, e?.message || e);
      }
    }

    await setOperatorContext(userId, fullOperatorId, fullVenueId);
    res.json({ code: 0, message: '运营商上下文已设置', data: { operatorId: fullOperatorId, venueId: fullVenueId, userId } });
  } catch (e: any) {
    console.error('[PlayerContext] set error:', e?.message || e);
    res.status(500).json({ code: 500, message: '设置运营商上下文失败', data: null });
  }
});

/**
 * GET /api/v1/player/context/current
 * 获取当前玩家的运营商上下文（含运营商名和赛场名）
 * 返回: { hasContext, operatorId, operatorName, venueId, venueName }
 */
router.get('/player/context/current', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    let operatorId: string | null = null;
    let venueId: string | null = null;

    // 检查 JWT 中是否有 operatorId（运营商用户）
    const jwtOperatorId = (req.user as any)?.operatorId;
    if (jwtOperatorId) {
      operatorId = jwtOperatorId;
    } else if ((req.user as any)?.role === 'referee') {
      // 裁判：从 referees 表查 operator_id（裁判没有 Redis 上下文，也不在 JWT 里）
      const ref = await queryOne<{ operator_id: string }>(
        `SELECT r.operator_id FROM referees r WHERE r.user_id = $1 LIMIT 1`,
        [userId]
      );
      if (ref?.operator_id) {
        operatorId = ref.operator_id;
      }
    } else {
      // 从 Redis 获取
      const ctx = await getOperatorContext(userId);
      if (ctx?.operator_id) {
        operatorId = ctx.operator_id;
        venueId = ctx.venue_id || null;
      }
    }

    if (!operatorId) {
      res.json({
        code: 0,
        data: { hasContext: false, operatorId: null, operatorName: null, venueId: null, venueName: null },
      });
      return;
    }

    // 查询运营商名称
    let operatorName: string | null = null;
    try {
      const op = await queryOne<{ name: string }>(
        `SELECT name FROM operators WHERE id = $1`,
        [operatorId]
      );
      operatorName = op?.name || null;
    } catch { /* ignore */ }

    // 查询赛场名称
    let venueName: string | null = null;
    if (venueId) {
      try {
        const v = await queryOpOne<{ name: string }>(req, 
          `SELECT name FROM venues WHERE id = $1`,
          [venueId]
        );
        venueName = v?.name || null;
      } catch { /* ignore */ }
    }

    res.json({
      code: 0,
      data: {
        hasContext: true,
        operatorId,
        operatorName,
        venueId,
        venueName,
      },
    });
  } catch (e: any) {
    console.error('[PlayerContext] current error:', e?.message || e);
    res.status(500).json({ code: 500, message: '获取运营商上下文失败', data: null });
  }
});

export default router;
