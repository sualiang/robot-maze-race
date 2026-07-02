import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * 获取当前赛季信息（没有 seasons 表时自动从 system_config 获取）
 */
async function getCurrentSeason(): Promise<{
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  cycle: string;
}> {
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

  // 先查 seasons 表（V2 设计，表可能不存在）
  let season: any = null;
  try {
    season = await queryOne<any>(
      `SELECT id, name, start_time, end_time, status
       FROM seasons
       WHERE status = 1
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 1`
    );
  } catch {
    // seasons 表可能不存在
  }

  // 只需要本赛事周期的起止时间用于 UI 倒计时
  // 使用当天的起始时间（如果是 daily）或本周一起止
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
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    cycleStart = start.toISOString();
    cycleEnd = end.toISOString();
  } else {
    // total = 整个赛季
    if (season) {
      cycleStart = season.start_time || now.toISOString();
      cycleEnd = season.end_time || new Date('2099-12-31').toISOString();
    } else {
      cycleStart = now.toISOString();
      cycleEnd = new Date('2099-12-31').toISOString();
    }
  }

  return {
    id: season?.id || 'current',
    name: season?.name || seasonName,
    startTime: cycleStart,
    endTime: cycleEnd,
    cycle: seasonCycle,
  };
}

/**
 * GET /api/v1/rank/my
 * 返回当前用户在赛季的排名数据（用于首页/我的页面）
 */
router.get('/my', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const season = await getCurrentSeason();

    // 用户本季成绩
    const myResult = await queryOne<any>(
      `SELECT
         MIN(rr.score_ms) as best_score,
         COUNT(*) as total_races
       FROM race_results rr
       WHERE rr.user_id = $1
         AND rr.status = 'completed'
         AND rr.score_ms IS NOT NULL
         AND rr.score_ms > 0
         AND rr.finished_at >= $2`,
      [userId, season.startTime]
    );

    if (!myResult || !myResult.best_score) {
      res.json({
        code: 0,
        data: {
          rank: 0,
          bestScore: 0,
          totalRaces: 0,
          beatPercent: 0,
          hasData: false,
        },
      });
      return;
    }

    // 排名计算（比当前用户成绩好的有多少人）
    const beforeCount = await queryOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT rr.user_id) as cnt
       FROM race_results rr
       WHERE rr.status = 'completed'
         AND rr.score_ms IS NOT NULL
         AND rr.score_ms > 0
         AND rr.score_ms < $1
         AND rr.finished_at >= $2`,
      [myResult.best_score, season.startTime]
    );

    const rank = (beforeCount?.cnt || 0) + 1;

    // 总人数（有成绩的）
    const totalRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT rr.user_id) as cnt
       FROM race_results rr
       WHERE rr.status = 'completed'
         AND rr.score_ms IS NOT NULL
         AND rr.score_ms > 0
         AND rr.finished_at >= $1`,
      [season.startTime]
    );
    const totalPlayers = totalRow?.cnt || 0;

    const beatPercent = totalPlayers > 0
      ? Math.round(((totalPlayers - rank) / totalPlayers) * 100)
      : 0;

    res.json({
      code: 0,
      data: {
        rank,
        bestScore: myResult.best_score,
        totalRaces: myResult.total_races,
        beatPercent,
        totalPlayers,
        seasonName: season.name,
        hasData: true,
      },
    });
  } catch (e: any) {
    console.error('[Rank] 我的排名查询失败:', e?.message || e);
    res.json({ code: 500, message: '查询排名失败', data: null });
  }
});

/**
 * GET /api/v1/rank/:type
 * 榜单查询, type = daily | weekly | total
 *
 * 返回本赛季玩家排名列表，按单局最佳成绩（score_ms 最短）排序
 * 需包含当前用户排名 + 击败百分比
 */
router.get('/:type', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const type = req.params.type;

  if (!['daily', 'weekly', 'total'].includes(type)) {
    res.json({ code: 400, message: '无效的榜单类型，支持: daily, weekly, total', data: null });
    return;
  }

  try {
    const season = await getCurrentSeason();
    const now = new Date().toISOString();

    // 构建时间范围 WHERE 条件
    let timeWhere: string;
    if (type === 'daily') {
      // 今日成绩
      timeWhere = `rr.finished_at >= CURDATE()`;
    } else if (type === 'weekly') {
      // 本周成绩（周一起）
      timeWhere = `rr.finished_at >= DATE_SUB(CURDATE(), INTERVAL (DAYOFWEEK(CURDATE()) + 5) % 7 DAY)`;
    } else {
      // total — 整个赛季
      timeWhere = `rr.finished_at >= $2`;
    }

    // 查询本赛季玩家最佳成绩排名
    // best: 取每个玩家本赛季最快的一局（score_ms 最小）
    // 排序: score_ms ASC (用时越短排名越高)
    // 仅统计 status = 'completed' 且有成绩的记录
    let rows: any[];
    let params: any[];

    if (type === 'total') {
      params = [season.startTime];
      rows = await query<any>(
        `SELECT
           u.id as user_id,
           u.nickname,
           u.avatar_url,
           MIN(rr.score_ms) as best_score,
           COUNT(*) as total_races
         FROM race_results rr
         JOIN users u ON rr.user_id = u.id
         WHERE rr.status = 'completed'
           AND rr.score_ms IS NOT NULL
           AND rr.score_ms > 0
           AND rr.finished_at >= $1
         GROUP BY rr.user_id
         ORDER BY best_score ASC
         LIMIT 100`,
        [season.startTime]
      );
    } else {
      params = [userId];
      rows = await query<any>(
        `SELECT
           u.id as user_id,
           u.nickname,
           u.avatar_url,
           MIN(rr.score_ms) as best_score,
           COUNT(*) as total_races
         FROM race_results rr
         JOIN users u ON rr.user_id = u.id
         WHERE rr.status = 'completed'
           AND rr.score_ms IS NOT NULL
           AND rr.score_ms > 0
           AND ${timeWhere}
         GROUP BY rr.user_id
         ORDER BY best_score ASC
         LIMIT 100`
      );
    }

    // 构建排名列表
    const entries = (rows || []).map((row: any, index: number) => ({
      rank: index + 1,
      userId: row.user_id,
      nickname: row.nickname || '',
      avatarUrl: row.avatar_url || '',
      bestScore: row.best_score || 0,
      totalRaces: row.total_races || 0,
    }));

    const totalPlayers = entries.length;

    // 查找当前用户的排名
    let myRank = 0;
    let myBestScore = 0;
    let myTotalRaces = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].userId === userId) {
        myRank = entries[i].rank;
        myBestScore = entries[i].bestScore;
        myTotalRaces = entries[i].totalRaces;
        break;
      }
    }

    // 如果不在榜单前 100，试着查用户个人成绩
    if (myRank === 0) {
      const myResult = await queryOne<any>(
        `SELECT
           MIN(rr.score_ms) as best_score,
           COUNT(*) as total_races
         FROM race_results rr
         WHERE rr.user_id = $1
           AND rr.status = 'completed'
           AND rr.score_ms IS NOT NULL
           AND rr.score_ms > 0
           ${type === 'daily'
             ? `AND rr.finished_at >= CURDATE()`
             : type === 'weekly'
               ? `AND rr.finished_at >= DATE_SUB(CURDATE(), INTERVAL (DAYOFWEEK(CURDATE()) + 5) % 7 DAY)`
               : `AND rr.finished_at >= $2`
           }`,
        type === 'total' ? [userId, season.startTime] : [userId]
      );
      if (myResult && myResult.best_score) {
        // 全局排名
        const beforeCount = await queryOne<{ cnt: number }>(
          `SELECT COUNT(DISTINCT rr.user_id) as cnt
           FROM race_results rr
           JOIN users u ON rr.user_id = u.id
           WHERE rr.status = 'completed'
             AND rr.score_ms IS NOT NULL
             AND rr.score_ms > 0
             AND rr.score_ms < $1
             ${type === 'daily'
               ? `AND rr.finished_at >= CURDATE()`
               : type === 'weekly'
                 ? `AND rr.finished_at >= DATE_SUB(CURDATE(), INTERVAL (DAYOFWEEK(CURDATE()) + 5) % 7 DAY)`
                 : `AND rr.finished_at >= $2`
             }`,
          type === 'total'
            ? [myResult.best_score, season.startTime]
            : [myResult.best_score]
        );
        myRank = (beforeCount?.cnt || 0) + 1;
        myBestScore = myResult.best_score;
        myTotalRaces = myResult.total_races || 0;
      }
    }

    // 击败百分比
    const beatPercent = myRank > 0 && totalPlayers > 0
      ? Math.round(((totalPlayers - myRank) / totalPlayers) * 100)
      : 0;

    // 前三名特殊标记
    const top3 = entries.slice(0, 3).map((e, i) => ({
      ...e,
      medal: i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze',
    }));

    res.json({
      code: 0,
      data: {
        type,
        seasonName: season.name,
        cycleStart: season.startTime,
        cycleEnd: season.endTime,
        entries: entries.map((e) => ({
          ...e,
          medal: e.rank <= 3
            ? (e.rank === 1 ? 'gold' : e.rank === 2 ? 'silver' : 'bronze')
            : null,
        })),
        myRanking: {
          rank: myRank,
          bestScore: myBestScore,
          totalRaces: myTotalRaces,
          beatPercent,
        },
        totalPlayers,
      },
    });
  } catch (e: any) {
    console.error('[Rank] 查询失败:', e?.message || e);
    res.json({ code: 500, message: '查询榜单失败', data: null });
  }
});

export default router;
