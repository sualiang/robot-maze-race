import { Router, Request, Response } from 'express';
import { query, queryOne, getOperatorPool } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// 工具函数
// ============================================================

/**
 * 从 system_config 读取赛季配置，缺少的 key 返回默认值
 */
async function getSeasonConfig(prefix: 'season_quarter' | 'season_year'): Promise<{
  name: string;
  start: string;
  end: string;
  threshold: number;       // 门槛分数线（ms）
  quota: number;           // 总名额
}> {
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT \`key\`, value FROM system_config WHERE \`key\` LIKE $1`,
      [`${prefix}%`]
    );
    const map: Record<string, string> = {};
    for (const r of rows || []) map[r.key] = r.value;

    const defaults: Record<string, Record<string, string>> = {
      season_quarter: { name: '全市季度赛', threshold: '180000', quota: '200' },
      season_year: { name: '全省年度总决赛', threshold: '120000', quota: '500' },
    };
    const d = defaults[prefix] || {};

    return {
      name: map[`${prefix}_name`] || d.name || '',
      start: map[`${prefix}_start`] || '',
      end: map[`${prefix}_end`] || '',
      threshold: parseInt(map[`${prefix}_threshold`] || d.threshold || '0', 10),
      quota: parseInt(map[`${prefix}_quota`] || d.quota || '0', 10),
    };
  } catch {
    return { name: '', start: '', end: '', threshold: 0, quota: 0 };
  }
}

/** 阶段枚举 */
type Phase = 'not_started' | 'registration' | 'ongoing' | 'ended';

/**
 * 计算当前阶段
 * 未开启: 距 start > 15 天
 * 报名期: start - 15天 ~ start
 * 进行中: start ~ end
 * 结束后: end 之后
 */
function getPhase(start: string, end: string): Phase {
  if (!start) return 'not_started';
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + 90 * 86400000; // 默认三个月
  const registerDays = 15 * 86400000;

  if (now < s - registerDays) return 'not_started';
  if (now < s) return 'registration';
  if (now <= e) return 'ongoing';
  return 'ended';
}

/**
 * 格式化成绩 ms → 人类可读
 */
function fmtScore(ms: number): string {
  if (!ms) return '--';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(2) + 's';
  return Math.floor(ms / 60000) + '\'' + ((ms % 60000) / 1000).toFixed(1) + '"';
}

/**
 * 获取用户的区域和俱乐部名称
 */
async function getUserRegionAndClub(userId: string): Promise<{ region: string; clubName: string }> {
  try {
    const latestCheckin = await queryOne<{ venue_id: string; operator_id: string }>(
      `SELECT c.venue_id, c.operator_id
       FROM checkins c
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!latestCheckin) {
      const lastRace = await queryOne<{ operator_id: string }>(
        `SELECT operator_id FROM race_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (!lastRace?.operator_id) return { region: '', clubName: '' };
      const op = await queryOne<{ name: string }>(
        `SELECT name FROM operators WHERE id = $1`,
        [lastRace.operator_id]
      );
      return { region: '', clubName: op?.name || '' };
    }

    const op = latestCheckin.operator_id
      ? await queryOne<{ name: string }>(
          `SELECT name FROM operators WHERE id = $1`,
          [latestCheckin.operator_id]
        )
      : null;

    let region = '';
    if (latestCheckin.operator_id && latestCheckin.venue_id) {
      try {
        const registry = await queryOne<{ db_name: string }>(
          `SELECT db_name FROM operators_registry WHERE operator_id = $1`,
          [latestCheckin.operator_id]
        );
        if (registry?.db_name) {
          const pool = getOperatorPool(registry.db_name);
          if (pool) {
            const [venueRows] = await pool.query(
              `SELECT city, district FROM venues WHERE id = $1`,
              [latestCheckin.venue_id]
            ) as any;
            const rows = venueRows as any[];
            if (rows.length > 0) {
              const v = rows[0];
              region = [v.city, v.district].filter(Boolean).join(' · ') || v.city || v.district || '';
            }
          }
        }
      } catch { /* ignore */ }
    }

    return { region: region || '', clubName: op?.name || '' };
  } catch {
    return { region: '', clubName: '' };
  }
}

// ============================================================
// 已有的 GET /rank/my 和 GET /rank/:type 保留
// ============================================================

/**
 * GET /rank/config
 * 返回赛季配置 + 当前阶段
 */
router.get('/config', authMiddleware, async (req: Request, res: Response) => {
  try {
    const quarter = await getSeasonConfig('season_quarter');
    const year = await getSeasonConfig('season_year');

    res.json({
      code: 0,
      data: {
        quarter: {
          name: quarter.name,
          phase: getPhase(quarter.start, quarter.end),
          start: quarter.start,
          end: quarter.end,
          threshold: quarter.threshold,
          quota: quarter.quota,
        },
        year: {
          name: year.name,
          phase: getPhase(year.start, year.end),
          start: year.start,
          end: year.end,
          threshold: year.threshold,
          quota: year.quota,
        },
      },
    });
  } catch (e: any) {
    console.error('[Rank] config error:', e?.message || e);
    res.json({ code: 500, message: '获取赛季配置失败', data: null });
  }
});

/**
 * GET /rank/threshold?season=quarter|year
 * 返回门槛分数线 + 玩家最佳成绩对比
 */
router.get('/threshold', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const seasonType = (req.query.season as string) || 'quarter';
  const prefix = seasonType === 'year' ? 'season_year' : 'season_quarter';

  try {
    const cfg = await getSeasonConfig(prefix);
    const threshold = cfg.threshold;

    // 玩家最佳成绩 (越小越好)
    const myResult = await queryOne<{ best_score: number }>(
      `SELECT MIN(score_ms) as best_score
       FROM race_results
       WHERE user_id = $1 AND status = 'completed' AND score_ms IS NOT NULL AND score_ms > 0`,
      [userId]
    );
    const myBest = myResult?.best_score || 0;
    const qualified = myBest > 0 && myBest <= threshold;
    const diffMs = qualified ? 0 : (myBest > 0 ? myBest - threshold : 0);

    res.json({
      code: 0,
      data: {
        threshold,
        thresholdDisplay: fmtScore(threshold),
        myBest,
        myBestDisplay: fmtScore(myBest),
        qualified,
        diffMs,
        diffDisplay: qualified ? '已达标' : (myBest > 0 ? `还需提升 ${fmtScore(diffMs)}` : '暂无成绩'),
      },
    });
  } catch (e: any) {
    console.error('[Rank] threshold error:', e?.message || e);
    res.json({ code: 500, message: '查询门槛信息失败', data: null });
  }
});

/**
 * GET /rank/qualified-list?season=quarter|year
 * 返回已达门槛的玩家列表（排名 + 最佳成绩）
 */
router.get('/qualified-list', authMiddleware, async (req: Request, res: Response) => {
  const seasonType = (req.query.season as string) || 'quarter';
  const prefix = seasonType === 'year' ? 'season_year' : 'season_quarter';

  try {
    const cfg = await getSeasonConfig(prefix);

    const rows = await query<any>(
      `SELECT u.id as user_id, u.nickname, u.avatar_url, MIN(rr.score_ms) as best_score
       FROM race_results rr
       JOIN users u ON rr.user_id = u.id
       WHERE rr.status = 'completed' AND rr.score_ms IS NOT NULL AND rr.score_ms > 0
         AND rr.score_ms <= $1
       GROUP BY rr.user_id
       ORDER BY best_score ASC
       LIMIT 100`,
      [cfg.threshold]
    );

    const list = (rows || []).map((r: any, i: number) => ({
      rank: i + 1,
      userId: r.user_id,
      nickname: r.nickname || '',
      avatarUrl: r.avatar_url || '',
      bestScore: r.best_score,
      displayScore: fmtScore(r.best_score),
    }));

    res.json({ code: 0, data: { list, total: list.length, threshold: cfg.threshold } });
  } catch (e: any) {
    console.error('[Rank] qualified-list error:', e?.message || e);
    res.json({ code: 500, message: '查询达标列表失败', data: null });
  }
});

/**
 * GET /rank/registration-status?season=quarter|year
 * 返回报名人数/总名额
 * 报名系统待开发，先返回占位数据
 */
router.get('/registration-status', authMiddleware, async (req: Request, res: Response) => {
  const seasonType = (req.query.season as string) || 'quarter';
  const prefix = seasonType === 'year' ? 'season_year' : 'season_quarter';

  try {
    const cfg = await getSeasonConfig(prefix);

    // TODO: 报名系统真正开发后，从 registrations 表查询
    res.json({
      code: 0,
      data: {
        registeredCount: 0,
        quota: cfg.quota,
        quotaFilled: false,
      },
    });
  } catch (e: any) {
    console.error('[Rank] registration-status error:', e?.message || e);
    res.json({ code: 500, message: '查询报名状态失败', data: null });
  }
});

/**
 * GET /rank/final-result?season=quarter|year
 * 返回赛事最终榜单 + 晋级名单
 * 仅当阶段=ended 时有意义
 */
router.get('/final-result', authMiddleware, async (req: Request, res: Response) => {
  const seasonType = (req.query.season as string) || 'quarter';
  const prefix = seasonType === 'year' ? 'season_year' : 'season_quarter';

  try {
    const cfg = await getSeasonConfig(prefix);
    const phase = getPhase(cfg.start, cfg.end);

    if (phase !== 'ended') {
      res.json({ code: 0, data: { list: [], promoted: [], phase, seasonName: cfg.name } });
      return;
    }

    // 在赛事时段内的最佳成绩排名
    let rows: any[] = [];
    if (cfg.start && cfg.end) {
      rows = await query<any>(
        `SELECT u.id as user_id, u.nickname, u.avatar_url, MIN(rr.score_ms) as best_score
         FROM race_results rr
         JOIN users u ON rr.user_id = u.id
         WHERE rr.status = 'completed' AND rr.score_ms IS NOT NULL AND rr.score_ms > 0
           AND rr.finished_at >= $1 AND rr.finished_at <= $2
         GROUP BY rr.user_id
         ORDER BY best_score ASC
         LIMIT 100`,
        [cfg.start, cfg.end]
      );
    }

    const list = (rows || []).map((r: any, i: number) => ({
      rank: i + 1,
      userId: r.user_id,
      nickname: r.nickname || '',
      avatarUrl: r.avatar_url || '',
      bestScore: r.best_score,
      displayScore: fmtScore(r.best_score),
      isPromoted: i < cfg.quota, // 前 quota 名晋级
    }));

    const promoted = list.filter(e => e.isPromoted);

    res.json({
      code: 0,
      data: { list, promoted, phase, seasonName: cfg.name, quota: cfg.quota },
    });
  } catch (e: any) {
    console.error('[Rank] final-result error:', e?.message || e);
    res.json({ code: 500, message: '查询最终结果失败', data: null });
  }
});

/**
 * GET /rank/my
 * 我的排名（含赛季阶段信息）
 */
router.get('/my', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const quarter = await getSeasonConfig('season_quarter');
    const year = await getSeasonConfig('season_year');

    // 默认用季度赛季的时间范围
    const season = quarter.start ? quarter : year;
    const timeWhere = season.start && season.end
      ? `rr.finished_at >= '${season.start}' AND rr.finished_at <= '${season.end}'`
      : `rr.finished_at >= CURDATE()`;

    const myResult = await queryOne<any>(
      `SELECT
         MIN(rr.score_ms) as best_score,
         COUNT(*) as total_races
       FROM race_results rr
       WHERE rr.user_id = $1
         AND rr.status = 'completed'
         AND rr.score_ms IS NOT NULL
         AND rr.score_ms > 0
         AND ${timeWhere}`,
      [userId]
    );

    if (!myResult || !myResult.best_score) {
      const { region, clubName } = { region: '', clubName: '' };
      res.json({
        code: 0,
        data: {
          rank: 0, bestScore: 0, totalRaces: 0, beatPercent: 0, hasData: false,
          region, clubName,
          quarterPhase: getPhase(quarter.start, quarter.end),
          yearPhase: getPhase(year.start, year.end),
        },
      });
      return;
    }

    const beforeCount = await queryOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT rr.user_id) as cnt
       FROM race_results rr
       WHERE rr.status = 'completed'
         AND rr.score_ms IS NOT NULL AND rr.score_ms > 0
         AND rr.score_ms < $1
         AND ${timeWhere}`,
      [myResult.best_score]
    );
    const rank = (beforeCount?.cnt || 0) + 1;

    const totalRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT rr.user_id) as cnt
       FROM race_results rr
       WHERE rr.status = 'completed'
         AND rr.score_ms IS NOT NULL AND rr.score_ms > 0
         AND ${timeWhere}`
    );
    const totalPlayers = totalRow?.cnt || 0;
    const beatPercent = totalPlayers > 0 ? Math.round(((totalPlayers - rank) / totalPlayers) * 100) : 0;

    const { region, clubName } = await getUserRegionAndClub(userId);

    res.json({
      code: 0,
      data: {
        rank, bestScore: myResult.best_score, totalRaces: myResult.total_races, beatPercent, totalPlayers,
        hasData: true, region: region || '', clubName: clubName || '',
        quarterPhase: getPhase(quarter.start, quarter.end),
        yearPhase: getPhase(year.start, year.end),
        quarterName: quarter.name, yearName: year.name,
      },
    });
  } catch (e: any) {
    console.error('[Rank] 我的排名查询失败:', e?.message || e);
    res.json({ code: 500, message: '查询排名失败', data: null });
  }
});

/**
 * GET /rank/:type
 * 榜单查询, type = daily | weekly | total
 */
router.get('/:type', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const type = req.params.type;

  if (!['daily', 'weekly', 'total'].includes(type)) {
    res.json({ code: 400, message: '无效的榜单类型', data: null });
    return;
  }

  try {
    const quarter = await getSeasonConfig('season_quarter');

    let timeWhere: string;
    if (type === 'daily') {
      timeWhere = `rr.finished_at >= CURDATE()`;
    } else if (type === 'weekly') {
      timeWhere = `rr.finished_at >= DATE_SUB(CURDATE(), INTERVAL (DAYOFWEEK(CURDATE()) + 5) % 7 DAY)`;
    } else {
      timeWhere = quarter.start
        ? `rr.finished_at >= '${quarter.start}'`
        : `rr.finished_at >= CURDATE()`;
    }

    let rows: any[];
    rows = await query<any>(
      `SELECT u.id as user_id, u.nickname, u.avatar_url,
              MIN(rr.score_ms) as best_score,
              COUNT(*) as total_races
       FROM race_results rr
       JOIN users u ON rr.user_id = u.id
       WHERE rr.status = 'completed'
         AND rr.score_ms IS NOT NULL AND rr.score_ms > 0
         AND ${timeWhere}
       GROUP BY rr.user_id
       ORDER BY best_score ASC
       LIMIT 100`
    );

    const entries = (rows || []).map((row: any, index: number) => ({
      rank: index + 1,
      userId: row.user_id,
      nickname: row.nickname || '',
      avatarUrl: row.avatar_url || '',
      bestScore: row.best_score || 0,
      totalRaces: row.total_races || 0,
    }));

    let myRank = 0, myBestScore = 0, myTotalRaces = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].userId === userId) {
        myRank = entries[i].rank;
        myBestScore = entries[i].bestScore;
        myTotalRaces = entries[i].totalRaces;
        break;
      }
    }

    if (myRank === 0) {
      const myResult = await queryOne<any>(
        `SELECT MIN(rr.score_ms) as best_score, COUNT(*) as total_races
         FROM race_results rr
         WHERE rr.user_id = $1
           AND rr.status = 'completed'
           AND rr.score_ms IS NOT NULL AND rr.score_ms > 0
           AND ${timeWhere}`,
        [userId]
      );
      if (myResult && myResult.best_score) {
        const beforeCount = await queryOne<{ cnt: number }>(
          `SELECT COUNT(DISTINCT rr.user_id) as cnt
           FROM race_results rr
           JOIN users u ON rr.user_id = u.id
           WHERE rr.status = 'completed'
             AND rr.score_ms IS NOT NULL AND rr.score_ms > 0
             AND rr.score_ms < $1
             AND ${timeWhere}`,
          [myResult.best_score]
        );
        myRank = (beforeCount?.cnt || 0) + 1;
        myBestScore = myResult.best_score;
        myTotalRaces = myResult.total_races || 0;
      }
    }

    const totalPlayers = entries.length;
    const beatPercent = myRank > 0 && totalPlayers > 0
      ? Math.round(((totalPlayers - myRank) / totalPlayers) * 100)
      : 0;

    const { region, clubName } = myRank > 0
      ? await getUserRegionAndClub(userId)
      : { region: '', clubName: '' };

    res.json({
      code: 0,
      data: {
        type, entries: entries.map(e => ({
          ...e,
          medal: e.rank <= 3 ? (e.rank === 1 ? 'gold' : e.rank === 2 ? 'silver' : 'bronze') : null,
        })),
        myRanking: {
          rank: myRank, bestScore: myBestScore, totalRaces: myTotalRaces, beatPercent,
          region: region || '', clubName: clubName || '',
        },
        totalPlayers,
        quarterPhase: getPhase(quarter.start, quarter.end),
      },
    });
  } catch (e: any) {
    console.error('[Rank] 查询失败:', e?.message || e);
    res.json({ code: 500, message: '查询榜单失败', data: null });
  }
});

export default router;
