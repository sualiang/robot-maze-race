import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { getConfig, getConfigInt } from '../config/utils';
import { v4 as uuidv4 } from 'uuid';

import { getOperatorContext } from '../middleware/operator-context';

const router = Router();

/**
 * GET /api/v1/season/user/info
 * 返回赛季核心数据（level/exp/combat/points/rank 等）
 */
router.get('/user/info', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  console.log('[Season DEBUG] user/info userId:', userId);

  try {
    // 查询用户基础信息 + 赛季信息
    const user = await queryOne<any>(
      `SELECT id, nickname, avatar_url, level, exp, points FROM users WHERE id = $1`,
      [userId]
    );
    console.log('[Season DEBUG] user/info query result:', JSON.stringify(user));

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
    const rankRow = await queryOne<{ user_rank: number }>(
      `SELECT COUNT(*) + 1 as user_rank FROM users WHERE exp > (SELECT COALESCE(exp,0) FROM users WHERE id = $1)`,
      [userId]
    );

    // 自动升段逻辑：exp 达到下一级阈值时自动提升 level
    let currentLevel = user.level || 1;
    let exp = user.exp || 0;
    let changed = false;
    for (let lvl = currentLevel + 1; lvl <= 6; lvl++) {
      const needExp = await getConfigInt(`season_level_exp_${lvl}`, 99999);
      if (exp >= needExp) {
        currentLevel = lvl;
        changed = true;
      } else {
        break;
      }
    }
    if (changed) {
      const oldLevel = user.level;
      console.log('[Season] auto upgrade user', userId, 'from level', oldLevel, 'to', currentLevel);
      await execute('UPDATE users SET level = $1 WHERE id = $2', [currentLevel, userId]);
      // 发放段位升级奖励
      await grantLevelUpReward(userId, currentLevel);
    }

    // 计算下一级所需经验
    const nextLevel = currentLevel + 1;
    const nextLevelExpKey = `season_level_exp_${nextLevel}`;
    const nextLevelExp = nextLevel <= 6 ? await getConfigInt(nextLevelExpKey, 99999) : 99999;
    const currentLevelExpKey = `season_level_exp_${currentLevel}`;
    const currentLevelExp = await getConfigInt(currentLevelExpKey, 0);

    // 等级名称映射
    const levelNames: Record<number, string> = {
      1: '青铜选手',
      2: '白银选手',
      3: '黄金选手',
      4: '铂金选手',
      5: '钻石选手',
      6: '最强王者',
    };

    // 下一级升级奖励描述
    let upgradeDesc = '';
    if (nextLevel <= 6) {
      const nextCouponCents = await getConfigInt(`season_reward_level_${nextLevel}_coupon_cents`, 0);
      const nextPoints = await getConfigInt(`season_reward_level_${nextLevel}_points`, 0);
      const parts: string[] = [];
      if (nextCouponCents > 0) parts.push(`${(nextCouponCents / 100).toFixed(0)}元无门槛参赛抵扣卡`);
      if (nextPoints > 0) parts.push(`${nextPoints}积分`);
      if (parts.length > 0) upgradeDesc = `升级${levelNames[nextLevel] || ''}立得：${parts.join(' + ')}`;
    }

    res.json({
      code: 0,
      data: {
        userId: user.id,
        nickname: user.nickname || '',
        avatarUrl: user.avatar_url || '',
        level: currentLevel,
        levelName: levelNames[currentLevel] || '青铜选手',
        exp: exp,
        totalPower: combat?.total_power || 0,
        points: user.points || 0,
        rank: rankRow?.user_rank || 0,
        nextLevelExp,
        currentLevelExp,
        expProgress: nextLevelExp > currentLevelExp
          ? Math.round((exp - currentLevelExp) / (nextLevelExp - currentLevelExp) * 100)
          : 100,
        upgradeDesc,
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
 * GET /api/v1/season/config
 * 获取赛季配置
 */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const seasonName =
      (await queryOne<{ value: string }>(
        `SELECT value FROM system_config WHERE \`key\` = $1`,
        ['season_name']
      ))?.value || 'S1 赛季';

    const seasonCycle =
      (await queryOne<{ value: string }>(
        `SELECT value FROM system_config WHERE \`key\` = $1`,
        ['season_cycle']
      ))?.value || 'daily';

    const raceDesc =
      (await queryOne<{ value: string }>(
        `SELECT value FROM system_config WHERE \`key\` = $1`,
        ['season_race_desc']
      ))?.value || '完成迷宫挑战，用时越短成绩越好。';

    const finalRules =
      (await queryOne<{ value: string }>(
        `SELECT value FROM system_config WHERE \`key\` = $1`,
        ['season_final_rules']
      ))?.value || '赛季结束时，积分榜前16名进入决赛，单败淘汰制决出冠军。';

    // 从 seasons 表获取赛季起止时间（表可能不存在）
    let season: any = null;
    try {
      season = await queryOne<any>(
        `SELECT start_date, end_date, name FROM seasons WHERE status = 1 ORDER BY sort_order ASC LIMIT 1`
      );
    } catch {
      // seasons 表可能不存在
    }

    const now = new Date();
    let cycleStart: string;
    let cycleEnd: string;

    if (seasonCycle === 'daily') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      cycleStart = start.toISOString();
      cycleEnd = end.toISOString();
    } else if (seasonCycle === 'weekly') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      cycleStart = start.toISOString();
      cycleEnd = end.toISOString();
    } else {
      cycleStart = season?.start_date || now.toISOString();
      cycleEnd = season?.end_date || new Date('2099-12-31').toISOString();
    }

    res.json({
      code: 0,
      data: {
        seasonName: season?.name || seasonName,
        seasonCycle,
        cycleStart,
        cycleEnd,
        raceDesc,
        finalRules,
      },
    });
  } catch (e: any) {
    console.error('[Season] config error:', e?.message || e);
    res.json({ code: 500, message: '获取赛季配置失败', data: null });
  }
});

/**
 * GET /api/v1/season/qualifier/assessment
 * 返回评估区数据
 */
router.get('/qualifier/assessment', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  let opId = '';
  try { const ctx = await getOperatorContext(userId); opId = ctx?.operator_id || ''; } catch {}

  try {
    // 查询最近比赛成绩
    const recentRaces = await query<any>(
      `SELECT rr.score_ms, rr.status, rr.finished_at, v.name as venue_name
       FROM race_results rr
       LEFT JOIN venues v ON rr.venue_id = v.id
       WHERE rr.user_id = $1 AND rr.status = 'completed' AND rr.operator_id = $2
       ORDER BY rr.finished_at DESC
       LIMIT 10`,
      [userId, opId]
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

/**
 * 发放段位升级奖励（优惠券 + 积分）
 * 每个等级终身仅发放一次
 */
async function grantLevelUpReward(userId: string, level: number): Promise<void> {
  let opId = '';
  try { const ctx = await getOperatorContext(userId); opId = ctx?.operator_id || ''; } catch {}

  try {
    if (level < 2 || level > 6) return;

    // 检查是否已发过该等级的奖励（防重复）
    const grantOnceKey = `season_reward_level_${level}_grant_once`;
    const grantOnce = await getConfig(grantOnceKey, 'true');
    if (grantOnce === 'true') {
      const existing = await queryOne<{ id: string }>(
        `SELECT uc.id FROM user_coupons uc
         WHERE uc.user_id = $1 AND uc.coupon_type = 20 AND uc.extra_data LIKE $2 AND uc.operator_id = $3
         LIMIT 1`,
        [userId, `%"levelUpReward":${level}%`, opId]
      );
      if (existing) {
        console.log('[Season] level', level, 'reward already granted to user', userId);
        return;
      }
    }

    // 获取配置
    const couponCents = await getConfigInt(`season_reward_level_${level}_coupon_cents`, 0);
    const rewardPoints = await getConfigInt(`season_reward_level_${level}_points`, 0);

    if (couponCents <= 0 && rewardPoints <= 0) {
      console.log('[Season] no reward config for level', level);
      return;
    }

    const validEnd = '2070-01-01 00:00:00';

    // 优惠券名称
    const levelNames: Record<number, string> = {
      2: '白银', 3: '黄金', 4: '铂金', 5: '钻石', 6: '大师',
    };
    const couponName = `升段奖励·${levelNames[level] || level}级参赛抵扣卡`;

    if (couponCents > 0) {
      const couponId = uuidv4();
      await execute(
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description, denomination_cents, min_consume_cents, status, valid_start, valid_end, coupon_type, extra_data, operator_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, 20, $11, $12)`,
        [
          couponId, userId, couponId, 'platform',
          couponName,
          `升到${levelNames[level] || level}级奖励参赛抵扣卡`, couponCents, 0,
          new Date().toISOString(), validEnd,
          JSON.stringify({ levelUpReward: level }),
          opId
        ]
      );
      console.log('[Season] granted coupon', couponId, 'to user', userId, 'for level', level);
    }

    if (rewardPoints > 0) {
      // 加积分
      await execute(
        `UPDATE users SET points = COALESCE(points, 0) + $1 WHERE id = $2`,
        [rewardPoints, userId]
      );
      // 记积分流水
      const txnId = uuidv4();
      await execute(
        `INSERT INTO points_transactions (id, user_id, points, type, remark)
         VALUES ($1, $2, $3, 'level_up_reward', $4)`,
        [txnId, userId, rewardPoints, `升级奖励·${levelNames[level] || level}级`]
      );
      console.log('[Season] granted', rewardPoints, 'points to user', userId, 'for level', level);
    }

    // 记录 coupon 日志
    const logId = uuidv4();
    await execute(
      `INSERT INTO user_coupon_logs (id, user_id, coupon_id, action, remark)
       VALUES ($1, $2, $3, 'receive', $4)`,
      [logId, userId, couponName, `段位升级奖励·${levelNames[level] || level}级`]
    );

  } catch (e: any) {
    console.error('[Season] grantLevelUpReward error:', e?.message || e);
  }
}

export default router;
