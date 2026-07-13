import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getOperatorContext, setOperatorContext } from '../middleware/operator-context';

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
    await setOperatorContext(userId, operatorId, venueId);
    res.json({ code: 0, message: '运营商上下文已设置', data: { operatorId, venueId, userId } });
  } catch (e: any) {
    console.error('[PlayerContext] set error:', e?.message || e);
    res.status(500).json({ code: 500, message: '设置运营商上下文失败', data: null });
  }
});

/**
 * GET /api/v1/player/context/current
 * 获取当前玩家的运营商上下文
 */
router.get('/player/context/current', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // 检查 JWT 中是否有 operatorId（运营商用户）
    const jwtOperatorId = (req.user as any)?.operatorId;
    if (jwtOperatorId) {
      res.json({
        code: 0,
        data: { operatorId: jwtOperatorId, venueId: null, source: 'jwt' },
      });
      return;
    }

    // 从 Redis 获取
    const ctx = await getOperatorContext(userId);
    if (!ctx?.operator_id) {
      res.json({ code: 0, data: null });
      return;
    }

    res.json({
      code: 0,
      data: {
        operatorId: ctx.operator_id,
        venueId: ctx.venue_id || null,
        source: 'redis',
      },
    });
  } catch (e: any) {
    console.error('[PlayerContext] current error:', e?.message || e);
    res.status(500).json({ code: 500, message: '获取运营商上下文失败', data: null });
  }
});

export default router;
