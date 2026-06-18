import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { getConfigInt } from '../config/utils';

const router = Router();

/**
 * GET /api/v1/season/user/info
 * 返回赛季核心数据（level/exp/combat/points/rank 等）
 */
router.get('/user/info', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // 查询用户基础信息 + 赛季信息
    const user = await queryOne<any>(
      `SELECT id, nickname, avatar_url, level, exp, points FROM users WHERE id = $1`,
      [userId]
    );

    if (!user) {
      res.json({ code: 404, message: '用户不存在', data: null });
      return;
    }

    // 查询战斗力
    const combat = await queryOne<any>(
      `SELECT total_power FROM combat_power WHERE user_id = $1`,
      [userId]
    );

    // 计算排名（按 exp 降序）
    const rankRow = await queryOne<{ rank: number }>(
      `SELECT COUNT(*) + 1 as rank FROM users WHERE exp > (SELECT COALESCE(exp,0) FROM users WHERE id = $1)`,
      [userId]
    );

    // 计算下一级所需经验
    const currentLevel = user.level || 1;
    const nextLevel = currentLevel + 1;
    const nextLevelExpKey = `season_level_exp_${nextLevel}`;
    const nextLevelExp = nextLevel <= 5 ? await getConfigInt(nextLevelExpKey, 9999) : 9999;
    const currentLevelExpKey = `season_level_exp_${currentLevel}`;
    const currentLevelExp = await getConfigInt(currentLevelExpKey, 0);

    res.json({
      code: 0,
      data: {
        userId: user.id,
        nickname: user.nickname || '',
        avatarUrl: user.avatar_url || '',
        level: currentLevel,
        exp: user.exp || 0,
        totalPower: combat?.total_power || 0,
        points: user.points || 0,
        rank: rankRow?.rank || 0,
        nextLevelExp,
        currentLevelExp,
        expProgress: nextLevelExp > currentLevelExp
          ? Math.round(((user.exp || 0) - currentLevelExp) / (nextLevelExp - currentLevelExp) * 100)
          : 0,
      }
    });
  } catch (e: any) {
    console.error('[Season] user/info error:', e?.message || e);
    res.json({ code: 500, message: '查询赛季信息失败', data: null });
  }
});

/**
 * GET /api/v1/season/combat/detail
 * 返回战斗力各维度得分
 */
router.get('/combat/detail', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const combat = await queryOne<any>(
      `SELECT * FROM combat_power WHERE user_id = $1`,
      [userId]
    );

    if (!combat) {
      res.json({
        code: 0,
        data: {
          totalPower: 0,
          dimensions: []
        }
      });
      return;
    }

    const dimensions = [
      { name: combat.dimension_1_name || '', score: combat.dimension_1_score || 0 },
      { name: combat.dimension_2_name || '', score: combat.dimension_2_score || 0 },
      { name: combat.dimension_3_name || '', score: combat.dimension_3_score || 0 },
      { name: combat.dimension_4_name || '', score: combat.dimension_4_score || 0 },
      { name: combat.dimension_5_name || '', score: combat.dimension_5_score || 0 },
    ].filter(d => d.name);

    res.json({
      code: 0,
      data: {
        totalPower: combat.total_power || 0,
        dimensions
      }
    });
  } catch (e: any) {
    console.error('[Season] combat/detail error:', e?.message || e);
    res.json({ code: 500, message: '查询战斗力失败', data: null });
  }
});

/**
 * GET /api/v1/season/qualifier/assessment
 * 返回评估区数据
 */
router.get('/qualifier/assessment', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // 查询最近比赛成绩
    const recentRaces = await query<any>(
      `SELECT rr.score_ms, rr.status, rr.finished_at, v.name as venue_name
       FROM race_results rr
       LEFT JOIN venues v ON rr.venue_id = v.id
       WHERE rr.user_id = $1 AND rr.status = 'completed'
       ORDER BY rr.finished_at DESC
       LIMIT 10`,
      [userId]
    );

    // 计算平均成绩
    const scores = (recentRaces || []).map((r: any) => r.score_ms).filter(Boolean);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
      : 0;

    const totalRaces = recentRaces?.length || 0;
    const bestScore = scores.length > 0 ? Math.min(...scores) : 0;

    // 查询战斗力
    const combat = await queryOne<any>(
      `SELECT total_power FROM combat_power WHERE user_id = $1`,
      [userId]
    );

    res.json({
      code: 0,
      data: {
        totalRaces,
        bestScore,
        avgScore,
        totalPower: combat?.total_power || 0,
        recentRaces: (recentRaces || []).map((r: any) => ({
          scoreMs: r.score_ms,
          venueName: r.venue_name || '',
          finishedAt: r.finished_at,
        })),
      }
    });
  } catch (e: any) {
    console.error('[Season] qualifier/assessment error:', e?.message || e);
    res.json({ code: 500, message: '查询评估区数据失败', data: null });
  }
});

export default router;
