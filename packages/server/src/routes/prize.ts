import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * GET /api/v1/prize/pool
 * 获取奖池信息
 */
router.get('/pool', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const activeSeason = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM seasons WHERE status = 1 ORDER BY start_time DESC LIMIT 1`
    );
    const poolRow = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM orders WHERE status = 'paid'`
    );
    const totalAmount = poolRow?.total || 0;

    res.json({
      code: 0,
      data: {
        currentSeason: activeSeason?.name || '常规赛季',
        totalPoolCents: Math.floor(totalAmount * 0.1),
        prizeBreakdown: [
          { rank: 1, ratio: 0.5, label: '冠军', amountCents: 0 },
          { rank: 2, ratio: 0.3, label: '亚军', amountCents: 0 },
          { rank: 3, ratio: 0.2, label: '季军', amountCents: 0 },
        ]
      }
    });
  } catch (e: any) {
    console.error('[奖池] 查询失败:', e?.message || e);
    res.json({ code: 500, message: '奖池查询失败', data: null });
  }
});

/**
 * GET /api/v1/prize/list
 * 奖品列表（用户可见）
 */
router.get('/list', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    let sql = `SELECT * FROM lottery_prizes WHERE status = 1`;
    const params: any[] = [];
    if (category) {
      sql += ` AND prize_type = $1`;
      params.push(parseInt(category as string, 10));
    }
    sql += ` ORDER BY sort_order ASC`;

    const prizes = await query<any>(sql, params);
    res.json({ code: 0, data: prizes || [] });
  } catch (e: any) {
    res.json({ code: 500, message: '查询奖品失败', data: null });
  }
});

export default router;
