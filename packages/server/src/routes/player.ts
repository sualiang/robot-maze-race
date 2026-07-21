import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp, executeOpByOrder, resolveOperatorDb, resolveOperatorDbForOrder } from '../config/database';
import { getConfigInt } from '../config/utils';
import { authMiddleware, optionalAuth } from '../middleware/auth';
import { getOperatorContext } from '../middleware/operator-context';

import { autoAssignMerchantCoupons } from '../services/coupon-service';
import { rateLimiter } from '../middleware/rateLimiter';
import { wechatPayRequest, isPayConfigured, generateMiniProgramPayParams, generateMockPayParams } from '../services/wechat-pay-service';
import { config } from '../config';

const router = Router();

// 首页数据
router.get('/home', (_req: Request, res: Response) => {
  res.json({
    code: 0,
    data: {
      raceCount: 3,
      totalPlayers: 1256,
      arenaName: '北京主赛场',
      arenaStatus: 'open',
      remainCount: 5,
      announcements: [
        { id: 1, title: '6月赛事火热报名中！', time: '2026-06-01' },
        { id: 2, title: '新赛季规则更新通知', time: '2026-05-28' }
      ]
    }
  });
});

// 参赛包列表 — V2.0 三档设计
// 从数据库取 active 参赛包，合并关联礼券信息
// 三档标签根据 price_cents 自动判断:
//   39元档 / 99元档 / 199元档
// 成长值(growValue)和积分(points)从 system_config 读取
const PACKAGE_TIERS = [
  { maxCents: 6900, tag: '基础体验', growExpKey: 'season_score_buy_pkg_39', defaultExp: 100 },
  { maxCents: 19900, tag: '标准竞赛', growExpKey: 'season_score_buy_pkg_99', defaultExp: 300 },
  { maxCents: Infinity, tag: '专业训练', growExpKey: 'season_score_buy_pkg_199', defaultExp: 700 },
];

function getTierInfo(priceCents: number) {
  for (const tier of PACKAGE_TIERS) {
    if (priceCents <= tier.maxCents) {
      return tier;
    }
  }
  return PACKAGE_TIERS[PACKAGE_TIERS.length - 1];
}

router.get('/packages', optionalAuth, async (req: Request, res: Response) => {
  try {
    const rows = await queryOp<any>(req, 
      `SELECT * FROM race_packages
       WHERE status = 'active'
       ORDER BY sort_order ASC, price_cents ASC`
    );

    const result = await Promise.all((rows || []).map(async (row: any) => {
      const coupons = await queryOp<any>(req, 
        `SELECT * FROM race_package_coupons WHERE package_id = $1`,
        [row.id]
      );
      const couponList = (coupons || []).map((c: any) => ({
        id: c.id,
        couponId: c.coupon_id,
        denominationCents: c.denomination_cents,
        couponType: c.coupon_type,
        merchantName: c.merchant_name,
        couponName: c.coupon_name,
      }));

      const totalRewardValue = couponList.reduce((s: number, cc: any) => s + cc.denominationCents, 0);

      // 根据价格档位判断成长值和积分
      const tier = getTierInfo(row.price_cents);
      const growValue = await getConfigInt(tier.growExpKey, tier.defaultExp);
      const points = await getConfigInt('season_points_per_race', 5);

      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        price: row.price_cents,
        standardPriceCents: row.standard_price_cents || 0,
        tag: row.tag || '',
        growthValue: row.growth_value || 0,
        pointValue: row.point_value || 0,
        raceCount: row.race_count,
        validDays: row.valid_days || 365,
        couponPackage: couponList.map((c: any) => ({
          id: c.id,
          couponId: c.couponId,
          denominationCents: c.denominationCents,
          couponType: c.couponType,
          merchantName: c.merchantName,
          couponName: c.couponName,
        })),
        totalRewardValue,
        growValue,
        points,
        isHot: row.sort_order <= 1,
        isRecommend: row.sort_order <= 2,
        isActive: row.status === 'active',
      };
    }));

    res.json({ code: 0, data: result });
  } catch (e: any) {
    console.error('[Player] packages error:', e?.message || e);
    res.json({ code: 500, message: '获取参赛包失败', data: null });
  }
});

/**
 * GET /player/leaderboard/live
 * 大屏实时排行榜数据（小程序排行Tab用）
 * 从 operator 库 race_queues 查询，与大屏完全一致
 */
router.get('/leaderboard/live', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const period = (req.query.period as string) || 'daily';

    // 获取用户最近签到记录（不限状态，包含 completed 等）
    const checkin = await queryOpOne<{ venue_id: string }>(req,
      `SELECT venue_id FROM checkins WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (!checkin?.venue_id) {
      return res.json({ code: 0, data: { leaderboard: [], venueName: '', date: '' } });
    }

    const venueId = checkin.venue_id;

    // 查 venue 名称
    const venue = await queryOpOne<{ name: string }>(req,
      `SELECT name FROM venues WHERE id = $1`,
      [venueId]
    );

    // 时间过滤：日榜取今天，周榜取本周一至今
    let timeFilter = '';
    if (period === 'weekly') {
      timeFilter = `AND rq.updated_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`;
    } else {
      timeFilter = `AND rq.updated_at >= CURDATE()`;
    }

    // 排行榜 top 20
    const leaderRows = await queryOp<any>(req,
      `SELECT rq.* FROM race_queues rq WHERE rq.venue_id = $1 AND rq.status = 'finished' AND rq.finish_status != 'invalid' ${timeFilter} ORDER BY rq.finish_time_ms ASC LIMIT 20`,
      [venueId]
    );

    // 查 users（从 common 库）
    const allUserIds = leaderRows.map((r: any) => r.user_id).filter(Boolean);
    const userMap = new Map<string, { nickname: string; avatar_url: string }>();
    if (allUserIds.length > 0) {
      const placeholders = allUserIds.map((_: any, i: number) => '$' + (i + 1)).join(',');
      const userRows = await query<{ id: string; nickname: string; avatar_url: string }>(
        `SELECT id, nickname, avatar_url FROM users WHERE id IN (${placeholders})`,
        allUserIds
      );
      for (const u of (userRows || [])) {
        userMap.set(u.id, { nickname: u.nickname, avatar_url: u.avatar_url });
      }
    }

    const now = new Date();
    const dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';

    res.json({
      code: 0,
      data: {
        leaderboard: leaderRows.map((r: any, i: number) => ({
          rank: i + 1,
          nickname: (userMap.get(r.user_id)?.nickname || '选手'),
          avatar_url: userMap.get(r.user_id)?.avatar_url || '',
          finish_time_ms: r.finish_time_ms || 0,
          status: r.finish_status || 'finished',
        })),
        venueName: venue?.name || '',
        date: dateStr,
      }
    });
  } catch (e: any) {
    console.error('[Player] leaderboard/live error:', e.message);
    res.json({ code: 0, data: { leaderboard: [], venueName: '', date: '' } });
  }
});

// 排行榜
router.get('/leaderboard', (req: Request, res: Response) => {
  res.json({
    code: 0,
    data: {
      entries: [
        { rank: 1, nickname: '极速玩家', avatarUrl: '', bestTime: 32.5, raceCount: 12 },
        { rank: 2, nickname: '迷宫高手', avatarUrl: '', bestTime: 35.2, raceCount: 8 },
        { rank: 3, nickname: '闪电狗', avatarUrl: '', bestTime: 36.8, raceCount: 15 },
        { rank: 4, nickname: 'Allen', avatarUrl: '', bestTime: 38.1, raceCount: 5 },
        { rank: 5, nickname: '疾风', avatarUrl: '', bestTime: 39.9, raceCount: 3 }
      ],
      myRanking: { rank: 4, nickname: 'Allen', avatarUrl: '', bestTime: 38.1, raceCount: 5 }
    }
  });
});

// 签到状态 — 获取当前用户的签到记录
router.get('/checkin/current', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const record = await queryOpOne<any>(req, 
      `SELECT c.id, c.venue_id, c.queue_number, c.status, c.checked_in_at,
              v.name as venue_name, v.address as venue_address
       FROM checkins c
       LEFT JOIN venues v ON c.venue_id = v.id
       WHERE c.user_id = $1 AND c.status NOT IN ('cancelled', 'completed')
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [userId]
    );
    if (record) {
      res.json({
        code: 0,
        data: {
          id: record.id,
          venueId: record.venue_id,
          venueName: record.venue_name || '',
          venueAddress: record.venue_address || '',
          queueNumber: record.queue_number,
          status: record.status,
          checkedInAt: new Date(record.checked_in_at).getTime()
        }
      });
    } else {
      res.json({ code: 0, data: null });
    }
  } catch (e: any) {
    console.error('[签到] 查询失败:', e?.message || e);
    res.json({ code: 0, data: null });
  }
});

/**
 * POST /player/checkin/validate
 * 验证签到码（二维码），返回赛场信息
 * 前端 wx.scanCode 扫出二维码内容如 robotmaze://venue/{venue_id}
 * 或直接是 venue_id 字符串
 */
router.post('/checkin/validate', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { code } = req.body;

  if (!code) {
    res.json({ code: 400, message: '缺少签到码', data: null });
    return;
  }

  // 从 code 中提取 venue_id
  // 支持格式：robotmaze://venue/{id} 或纯 {id}
  let venueId: string = code;
  const match = code.match(/robotmaze:\/\/venue\/([\w-]+)/);
  if (match) {
    venueId = match[1];
  }

  try {
    const venue = await queryOpOne<any>(req, 
      `SELECT id, name, address, latitude, longitude, status FROM venues WHERE id = $1`,
      [venueId]
    );

    if (!venue) {
      res.json({ code: 404, message: '赛场不存在', data: null });
      return;
    }

    if (venue.status !== 'open') {
      res.json({ code: 400, message: '该赛场当前未开放', data: null });
      return;
    }

    // 检查用户是否已在该赛场签到（防止重复签到）
    const existing = await queryOpOne<{ id: string }>(req, 
      `SELECT id FROM checkins
       WHERE user_id = $1 AND venue_id = $2 AND status NOT IN ('cancelled', 'completed')`,
      [userId, venueId]
    );

    res.json({
      code: 0,
      data: {
        id: venue.id,
        name: venue.name,
        address: venue.address || '',
        latitude: venue.latitude || 0,
        longitude: venue.longitude || 0,
        status: venue.status,
        hasExistingCheckin: !!existing
      }
    });
  } catch (e: any) {
    console.error('[签到] 验证失败:', e?.message || e);
    res.json({ code: 500, message: '验证失败，请重试', data: null });
  }
});

/**
 * POST /player/checkin
 * 提交签到（进入排队）
 * 需要用户有剩余参赛次数 + 校验参赛包属于当前 operator
 */

/**
 * 成长值发放：签到后从已购参赛包中扣减一次并发放成长值/积分
 */
async function grantGrowthOnCheckin(req: Request, userId: string, checkinId: string): Promise<void> {
  try {
    const order = await queryOpOne<any>(req,
      `SELECT o.id, o.remaining_times, o.remaining_growth, rp.race_count, rp.growth_value
       FROM orders o
       JOIN race_packages rp ON o.package_id = rp.id
       WHERE o.user_id = $1 AND o.status = 'paid' AND o.remaining_times > 0
       ORDER BY o.paid_at ASC
       LIMIT 1`,
      [userId]
    );
    if (!order) return;

    const raceCount = order.race_count || 1;
    const perCheckinGrowth = Math.floor((order.growth_value || 0) / raceCount);

    // 积分改为购买时一次性发放（wx-pay.ts 支付回调），签到只发成长值
    if (perCheckinGrowth > 0) {
      await execute(
        `UPDATE users SET exp = COALESCE(exp, 0) + $1, updated_at = NOW() WHERE id = $2`,
        [perCheckinGrowth, userId]
      );
    }
    await executeOp(req,
      `UPDATE orders SET remaining_times = remaining_times - 1, updated_at = NOW() WHERE id = $1 AND remaining_times > 0`,
      [order.id]
    );
  } catch (err: any) {
    console.error('[成长值发放] 失败:', err?.message || err);
  }
}

router.post('/checkin', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { code } = req.body;

  if (!code) {
    res.json({ code: 400, message: '缺少签到码', data: null });
    return;
  }

  // 从 code 提取 venue_id
  let venueId: string = code;
  const match = code.match(/robotmaze:\/\/venue\/([\w-]+)/);
  if (match) {
    venueId = match[1];
  }

  try {
    // 验证赛场存在
    const venue = await queryOpOne<any>(req, 
      `SELECT id, name, status FROM venues WHERE id = $1`,
      [venueId]
    );
    if (!venue) {
      res.json({ code: 404, message: '赛场不存在', data: null });
      return;
    }
    if (venue.status !== 'open') {
      res.json({ code: 400, message: '该赛场当前未开放', data: null });
      return;
    }

    // 检查剩余参赛次数（跨赛场核销：同一 operator 下任意订单 remaining_times > 0 即可）
    const remainingRaces = await getUserRemainingRaces(userId, req);
    if (remainingRaces <= 0) {
      res.json({ code: 400, message: '您没有剩余参赛次数，请购买参赛包或发起好友助力', data: null });
      return;
    }

    // 检查是否已经在排队
    const existing = await queryOpOne<{ id: string }>(req, 
      `SELECT id FROM checkins
       WHERE user_id = $1 AND venue_id = $2 AND status NOT IN ('cancelled', 'completed')`,
      [userId, venueId]
    );
    if (existing) {
      res.json({ code: 400, message: '您已在该赛场签到，无需重复签到', data: null });
      return;
    }

    // 计算排队号
    const maxQueue = await queryOpOne<{ max_q: number }>(req, 
      `SELECT COALESCE(MAX(queue_number), 0) as max_q FROM checkins WHERE venue_id = $1 AND status NOT IN ('cancelled', 'completed')`,
      [venueId]
    );
    const queueNumber = (maxQueue?.max_q ?? 0) + 1;

    // 创建签到记录
    const checkinId = uuidv4();

    await queryOp(req, 
      `INSERT INTO checkins (id, user_id, venue_id, queue_number, status, checked_in_at, created_at, updated_at, operator_id)
       VALUES ($1, $2, $3, $4, 'queued', NOW(), NOW(), NOW(), $5)`,
      [checkinId, userId, venueId, queueNumber, (req.user as any)?.operatorId || '']
    );

    // 同时写入 race_queues，让裁判端和大屏能看到排队
    // 复用 checkins INSERT 已用过的 connection（resolveOperatorDb 结果一致）
    try {
      await queryOp(req,
        `INSERT INTO race_queues (id, user_id, venue_id, queue_number, status, remaining_races, checkin_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'waiting', $6, $5, NOW(), NOW())
         ON DUPLICATE KEY UPDATE status = 'waiting', queue_number = $4, checkin_id = $5, remaining_races = $6, updated_at = NOW()`,
        [uuidv4(), userId, venueId, queueNumber, checkinId, remainingRaces]
      );
    } catch (e: any) {
      console.error('[签到] race_queues 写入失败:', e?.message || e);
    }

    // 成长值发放：从已购且还有剩余次数的参赛包中，按包扣减
    // 找到最新一个有 remaining_times > 0 的订单，扣减一次，发放 growth_value / race_count
    await grantGrowthOnCheckin(req, userId, checkinId);

    res.json({
      code: 0,
      data: {
        id: checkinId,
        venueId,
        venueName: venue.name,
        queueNumber,
        status: 'queued',
        checkedInAt: Date.now(),
        queueCount: queueNumber
      }
    });
  } catch (e: any) {
    console.error('[签到] 提交失败:', e?.message || e);
    res.json({ code: 500, message: '签到失败，请重试', data: null });
  }
});

/**
 * GET /player/checkin/queue
 * 获取当前用户的排队状态
 */
router.get('/checkin/queue', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const record = await queryOpOne<any>(req, 
      `SELECT c.id, c.venue_id, c.queue_number, c.status, c.checked_in_at,
              v.name as venue_name
       FROM checkins c
       LEFT JOIN venues v ON c.venue_id = v.id
       WHERE c.user_id = $1 AND c.status = 'queued'
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!record) {
      res.json({ code: 0, data: { hasQueue: false } });
      return;
    }

    // 计算前面还有多少人
    const aheadRow = await queryOpOne<{ cnt: number }>(req, 
      `SELECT COUNT(*) as cnt FROM checkins
       WHERE venue_id = $1 AND status = 'queued' AND queue_number < $2`,
      [record.venue_id, record.queue_number]
    );
    const aheadCount = aheadRow?.cnt ?? 0;

    // 估算等待时间（每人约 5 分钟）
    const estimatedWaitTime = aheadCount * 5 * 60;

    res.json({
      code: 0,
      data: {
        hasQueue: true,
        id: record.id,
        venueId: record.venue_id,
        venueName: record.venue_name || '',
        queueNumber: record.queue_number,
        aheadCount,
        totalQueue: record.queue_number,
        estimatedWaitTime,
        checkedInAt: new Date(record.checked_in_at).getTime(),
        status: record.status
      }
    });
  } catch (e: any) {
    console.error('[签到] 排队查询失败:', e?.message || e);
    res.json({ code: 0, data: { hasQueue: false } });
  }
});

/**
 * GET /player/queue/current
 * 获取当前赛场实时排队列表（供小程序比赛Tab展示）
 * 通过 resolveOperatorDb 获取玩家所在赛场的 venue_id
 * 新增 myStatus + lastRaceResult
 */
router.get('/queue/current', authMiddleware, rateLimiter(10, 60), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // 获取该玩家的 operator context，查找所在 venue
    const dbName = await resolveOperatorDb(req);
    if (!dbName) {
      return res.json({ code: 0, message: 'ok', data: { queue: [], currentRacer: null, myStatus: 'idle', lastRaceResult: null } });
    }

    const ctx = await getOperatorContext(userId);
    const operatorId = ctx?.operator_id;
    if (!operatorId) {
      return res.json({ code: 0, message: 'ok', data: { queue: [], currentRacer: null, myStatus: 'idle', lastRaceResult: null } });
    }

    // 查 venues 表找到该运营商的 open 赛场
    const venueRow = await queryOpOne<{ id: string; name: string }>(req,
      `SELECT id, name FROM venues WHERE operator_id = $1 AND status = 'open' LIMIT 1`,
      [operatorId]
    );
    if (!venueRow?.id) {
      return res.json({ code: 0, message: 'ok', data: { queue: [], currentRacer: null, myStatus: 'idle', lastRaceResult: null } });
    }

    const venueId = venueRow.id;

    // 1) myStatus: 查当前用户在 race_queues 中的状态
    let myStatus = 'idle' as string;
    const myQueueRow = await queryOpOne<any>(req,
      `SELECT status FROM race_queues WHERE venue_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [venueId, userId]
    );
    if (myQueueRow) {
      if (myQueueRow.status === 'waiting') myStatus = 'waiting';
      else if (myQueueRow.status === 'called') myStatus = 'called';
      else if (myQueueRow.status === 'skipped') myStatus = 'skipped';
      else if (myQueueRow.status === 'racing' || myQueueRow.status === 'paused') myStatus = 'racing';
    }

    // 2) lastRaceResult: 用户最近一次 completed 比赛成绩
    let lastRaceResult: any = null;
    const lastResultRow = await queryOpOne<any>(req,
      `SELECT id, score_ms, created_at
       FROM race_results
       WHERE user_id = $1 AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (lastResultRow) {
      const ms = lastResultRow.score_ms ?? 0;
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const cs = Math.floor((ms % 1000) / 10);
      const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
      const scoreText = pad(min) + ':' + pad(sec) + '.' + pad(cs);
      lastRaceResult = {
        score: ms / 1000,
        scoreText,
      };
    }

    // 3) 队列: waiting/called/skipped
    const queueRows = await queryOp<any>(req,
      `SELECT rq.id, rq.user_id, rq.queue_number, rq.status, rq.remaining_races, rq.race_type
       FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('waiting','called','skipped')
       ORDER BY rq.queue_number ASC`,
      [venueId]
    );

    // 4) 当前选手: racing/paused
    const currentRow = await queryOpOne<any>(req,
      `SELECT rq.id, rq.user_id, rq.queue_number, rq.status, rq.remaining_races, rq.race_type,
              rq.start_time_ms, rq.paused_elapsed_ms
       FROM race_queues rq
       WHERE rq.venue_id = $1 AND rq.status IN ('racing','paused')
       ORDER BY rq.created_at DESC LIMIT 1`,
      [venueId]
    );

    // 收集所有需要查询的用户 ID
    const allUserIds: string[] = [];
    for (const r of queueRows) {
      if (r.user_id) allUserIds.push(r.user_id);
    }
    if (currentRow?.user_id) allUserIds.push(currentRow.user_id);

    // 从 common 库批量查用户信息
    const userMap: Record<string, { nickname: string; avatar_url: string }> = {};
    if (allUserIds.length > 0) {
      const placeholders = allUserIds.map((_, i) => `$${i + 1}`).join(',');
      const userRows = await query<any>(
        `SELECT id, nickname, avatar_url FROM users WHERE id IN (${placeholders})`,
        allUserIds
      );
      for (const u of userRows) {
        userMap[u.id] = { nickname: u.nickname || '', avatar_url: u.avatar_url || '' };
      }
    }

    const userFor = (uid: string) => userMap[uid] || { nickname: '', avatar_url: '' };

    const elapsed = currentRow ? (
      currentRow.status === 'racing' && currentRow.start_time_ms ? Date.now() - currentRow.start_time_ms : (currentRow.paused_elapsed_ms || 0)
    ) : 0;

    res.json({
      code: 0,
      message: 'ok',
      data: {
        venueId,
        myStatus,
        lastRaceResult,
        queue: queueRows.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          queueNumber: r.queue_number,
          nickname: userFor(r.user_id).nickname || '选手',
          avatarUrl: userFor(r.user_id).avatar_url || undefined,
          remainingRaces: r.remaining_races,
          raceType: r.race_type || undefined,
          status: r.status,
        })),
        currentRacer: currentRow ? {
          id: currentRow.id,
          queueNumber: currentRow.queue_number,
          nickname: userFor(currentRow.user_id).nickname || '选手',
          avatarUrl: userFor(currentRow.user_id).avatar_url || undefined,
          remainingRaces: currentRow.remaining_races,
          status: currentRow.status,
          elapsed,
          elapsedText: formatElapsed(elapsed),
        } : null,
      },
    });
  } catch (e: any) {
    console.error('[Player] queue/current error:', e.message);
    return res.json({ code: 0, message: 'ok', data: { queue: [], currentRacer: null, myStatus: 'idle', lastRaceResult: null } });
  }
});

function formatElapsed(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

/**
 * GET /player/me/profile-check
 * 检查是否需要补充个人信息
 */
router.get('/me/profile-check', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const user = await queryOne<{ nickname: string; phone: string; gender: string; race_count: number }>(
      `SELECT nickname, phone, gender, race_count FROM users WHERE id = $1`,
      [userId]
    );

    // 查询消费券总额（按 operator_id 过滤）
    let couponTotalCents = 0;
    try {
      const couponRow = await queryOpOne<{ total: number }>(req, 
        `SELECT COALESCE(SUM(denomination_cents), 0) as total FROM user_coupons WHERE user_id = $1 AND status = 1 AND (valid_end IS NULL OR valid_end >= NOW())`,
        [userId]
      );
      couponTotalCents = couponRow?.total || 0;
    } catch (couponErr) {
      console.error('[profile-check] 查询消费券失败:', (couponErr as Error)?.message);
    }

    // 查询积分余额（从 users 表统一读取）
    let pointsBalance = 0;
    try {
      const pointsRow = await queryOne<{ points: number }>(`SELECT COALESCE(points, 0) as points FROM users WHERE id = $1`, [userId]);
      pointsBalance = pointsRow?.points || 0;
    } catch (pointsErr) {
      // 静默失败
    }

    const needPhone = !user || !user.nickname || !user.phone;
    const remainCount = await getUserRemainingRaces(userId, req);
    res.json({
      code: 0,
      data: {
        needPhone,
        nickname: user?.nickname || '',
        phone: user?.phone || '',
        gender: user?.gender || '',
        raceCount: user?.race_count || 0,
        remainCount,
        couponTotalCents,
        couponTotalYuan: couponTotalCents / 100,
        pointsBalance,
      }
    });
  } catch (e: any) {
    console.error('[profile-check] error:', e?.message || e);
    res.json({ code: 0, data: { needPhone: true, nickname: '', phone: '', gender: '', raceCount: 0, remainCount: 0, couponTotalCents: 0, couponTotalYuan: 0, pointsBalance: 0 } });
  }
});

/**
 * POST /player/me/profile
 * 更新玩家个人信息（昵称、手机号、头像、性别）
 */
router.post('/me/profile', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { nickname, phone, avatarUrl, avatar_url, gender } = req.body;
  const avatar = avatarUrl || avatar_url || undefined;

  try {
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (nickname !== undefined) {
      updates.push(`nickname = $${idx++}`);
      params.push(nickname);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      params.push(phone);
    }
    if (avatar !== undefined) {
      updates.push(`avatar_url = $${idx++}`);
      params.push(avatar);
    }
    if (gender !== undefined) {
      updates.push(`gender = $${idx++}`);
      params.push(gender);
    }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    updates.push('updated_at = NOW()');
    params.push(userId);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ code: 0, message: '更新成功', data: null });
  } catch (e: any) {
    console.error('[玩家] 更新个人信息失败:', e?.message || e);
    res.json({ code: 500, message: '更新失败', data: null });
  }
});

// 用户统计
router.get('/me/stats', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const remainingRaces = await getUserRemainingRaces(userId, req);

    const helpRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM helps WHERE initiator_id = $1`,
      [userId]
    );
    const helpCount = helpRow?.cnt || 0;

    // 查询 V2 赛季数据
    const user = await queryOne<any>(
      `SELECT level, exp, points FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      code: 0,
      data: {
        raceCount: remainingRaces,
        helpCount,
        totalRaces: 0,
        level: user?.level || 1,
        exp: user?.exp || 0,
        points: user?.points || 0,
      }
    });
  } catch (e: any) {
    res.json({ code: 0, data: { raceCount: 0, helpCount: 0 } });
  }
});

/**
 * GET /player/me/best-score
 * 返回当前用户的最佳成绩和同运营商内排名
 * 从 race_records 表查询（score = finish_time_ms 单位毫秒）
 */
router.get('/me/best-score', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // 查询用户最好成绩（score 越小越好）
    const bestRow = await queryOpOne<{ best_score: number }>(req,
      `SELECT MIN(score) as best_score FROM race_records WHERE player_id = $1 AND status = 'finished'`,
      [userId]
    );

    const bestScore = bestRow?.best_score ?? null;

    let rank: number | null = null;
    if (bestScore !== null && bestScore !== undefined) {
      // 计算排名：score < 用户最好成绩 的玩家数 + 1
      const rankRow = await queryOpOne<{ player_count: number }>(req,
        `SELECT COUNT(DISTINCT player_id) as player_count
         FROM race_records
         WHERE status = 'finished' AND score < $1`,
        [bestScore]
      );
      rank = (rankRow?.player_count ?? 0) + 1;
    }

    res.json({
      code: 0,
      data: {
        bestScore,   // 毫秒, null 表示无成绩
        rank,        // 排名, null 表示无成绩
      }
    });
  } catch (e: any) {
    console.error('[Player] best-score error:', e.message);
    res.json({ code: 0, data: { bestScore: null, rank: null } });
  }
});

/**
 * GET /player/me/race-records
 * 返回历史参赛记录列表
 * 支持 ?month=YYYY-MM 按月筛选
 * 从 race_results 表查询
 */
router.get('/me/race-records', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const month = (req.query.month || '') as string;

  try {
    const opId = (req.user as any)?.operatorId || '';

    let sql = `SELECT rr.id, rr.score_ms, rr.rank, rr.status, rr.finished_at, rr.created_at,
              v.name as venue_name
       FROM race_results rr
       LEFT JOIN venues v ON rr.venue_id = v.id
       WHERE rr.user_id = $1 AND rr.operator_id = $2`;
    const params: any[] = [userId, opId];

    if (month) {
      sql += ` AND DATE_FORMAT(rr.created_at, '%Y-%m') = $3`;
      params.push(month);
    }

    sql += ` ORDER BY rr.created_at DESC LIMIT 100`;

    const records = await queryOp<any>(req, sql, params);

    const result = (records || []).map((r: any) => ({
      id: r.id,
      score: r.score_ms || 0,
      rank: r.rank || 0,
      date: r.finished_at || r.created_at,
      growValue: 0,
      points: 0,
      venueName: r.venue_name || '',
      status: r.status || '',
    }));

    // 获取用户有记录的月份列表
    const monthsResult = await queryOp<any>(req,
      `SELECT DISTINCT DATE_FORMAT(created_at, '%Y-%m') AS month
       FROM race_results WHERE user_id = $1 AND operator_id = $2 ORDER BY month DESC`,
      [userId, opId]
    );
    const availableMonths = (monthsResult || []).map((r: any) => r.month);

    res.json({ code: 0, data: { records: result, availableMonths } });
  } catch (e: any) {
    console.error('[Player] race-records error:', e?.message || e);
    res.json({ code: 500, message: '查询参赛记录失败', data: null });
  }
});

/**
 * GET /player/points-deduction-info
 * 获取用户积分余额及抵扣配置（替代原参赛抵扣卡机制）
 */
router.get('/points-deduction-info', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    // 用户积分余额
    const pointsRow = await queryOpOne<{ balance: string }>(req,
      `SELECT COALESCE(SUM(points), 0) as balance FROM points_transactions WHERE user_id = $1`,
      [userId]
    );
    const pointsBalance = parseInt(pointsRow?.balance || '0', 10);

    // 积分抵扣配置
    const configRows = await queryOp<any>(req,
      `SELECT \`key\`, \`value\` FROM marketing_config WHERE \`key\` IN ('points_deduction_rate', 'points_max_deduction_cents')`
    );
    const configMap: Record<string, string> = {};
    if (Array.isArray(configRows)) {
      for (const row of configRows) configMap[row.key] = row.value;
    }
    // Fallback defaults
    const deductionRate = parseInt(configMap['points_deduction_rate'] || '100', 10); // 100 points = 1 yuan
    const maxDeductionCents = parseInt(configMap['points_max_deduction_cents'] || '2000', 10); // max 20 yuan

    // 计算最多可抵扣积分
    const maxDeductiblePoints = Math.floor(maxDeductionCents * deductionRate / 100);
    const maxDeductionYuan = maxDeductionCents / 100;

    res.json({
      code: 0,
      data: {
        pointsBalance,
        deductionRate,
        maxDeductionCents,
        maxDeductiblePoints,
        maxDeductionYuan,
      }
    });
  } catch (e: any) {
    console.error('[Player] points-deduction-info error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * GET /player/coupons
 * 获取用户的优惠券列表（按 coupon_type 分类）
 * coupon_type: 1=立减券(无门槛), 3=满减券, 4=兑换券
 */
router.get('/coupons', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { type, status } = req.query;

  try {
    let whereClause = 'WHERE uc.user_id = $1';
    const params: any[] = [userId];

    // 按 coupon_type 筛选
    if (type) {
      const typeNum = parseInt(type as string, 10);
      if ([1, 3, 4].includes(typeNum)) {
        whereClause += ' AND uc.coupon_type = $' + (params.length + 1);
        params.push(typeNum);
      }
    }

    // 按状态筛选（可选）
    if (status !== undefined) {
      const statusNum = parseInt(status as string, 10);
      if (!isNaN(statusNum)) {
        whereClause += ' AND uc.status = $' + (params.length + 1);
        params.push(statusNum);
      }
    }

    const coupons = await queryOp<any>(req, 
      `SELECT uc.id, uc.user_id, uc.coupon_id, uc.merchant_id,
              uc.name, uc.description, uc.denomination_cents,
              uc.min_consume_cents, uc.status, uc.used_at,
              uc.valid_start, uc.valid_end, uc.coupon_type,
              uc.discount_percent, uc.extra_data, uc.verify_code,
              uc.created_at,
              COALESCE(m.merchant_name, '') as merchant_name,
              COALESCE(m.logo_url, '') as merchant_logo,
              COALESCE(m.merchant_address, '') as merchant_address,
              COALESCE(m.logo_url, '') as merchant_logo
       FROM user_coupons uc
       LEFT JOIN merchants m ON uc.merchant_id = m.id
       ${whereClause}
       ORDER BY uc.created_at DESC`,
      params
    );

    const couponList = (coupons || []).map((c: any) => ({
      id: c.id,
      userId: c.user_id,
      couponId: c.coupon_id,
      merchantId: c.merchant_id,
      merchantName: c.merchant_name || '',
      merchantLogo: c.merchant_logo || '',
      merchantAddress: c.merchant_address || '',
      merchantLat: 0,
      merchantLng: 0,
      name: c.name || '',
      description: c.description || '',
      denominationCents: c.denomination_cents || 0,
      denominationYuan: (c.denomination_cents || 0) / 100,
      minConsumeCents: c.min_consume_cents || 0,
      minConsumeYuan: (c.min_consume_cents || 0) / 100,
      couponType: c.coupon_type || 1,
      coupon_type: c.coupon_type || 1,
      discountPercent: c.discount_percent || 0,
      extraData: c.extra_data || '{}',
      verifyCode: c.verify_code || '',
      status: c.status,
      validStart: c.valid_start || null,
      validEnd: c.valid_end || null,
      usedAt: c.used_at || null,
      createdAt: c.created_at,
    }));

    // 按类型分类
    const type1 = couponList.filter((c: any) => c.couponType === 1); // 立减券
    const type3 = couponList.filter((c: any) => c.couponType === 3); // 满减券
    const type4 = couponList.filter((c: any) => c.couponType === 4); // 兑换券

    // 总券数和总面值
    const totalCount = couponList.length;
    const totalDenominationCents = couponList.reduce(
      (sum: number, c: any) => sum + (c.denominationCents || 0),
      0
    );

    res.json({
      code: 0,
      data: {
        list: couponList,
        type1,
        type3,
        type4,
        summary: {
          totalCount,
          totalDenominationCents,
          totalDenominationYuan: totalDenominationCents / 100,
          categoryCounts: {
            type1: type1.length,
            type3: type3.length,
            type4: type4.length,
          },
        },
      },
    });
  } catch (e: any) {
    console.error('[Player] coupons error:', e?.message || e);
    res.json({ code: 500, message: '查询优惠券失败', data: null });
  }
});

/**
 * GET /player/orders
 * 查询用户订单列表
 */
router.get('/orders', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { month } = req.query; // YYYY-MM
  try {
    let sql = `SELECT o.id, o.order_no, o.package_id, rp.name as package_name, o.amount_cents, o.discount_cents,
              o.points_deduction_cents, o.status, o.paid_at, o.created_at
       FROM orders o
       LEFT JOIN race_packages rp ON o.package_id = rp.id
       WHERE o.user_id = $1`;
    const params: any[] = [userId];
    if (month && typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
      sql += ` AND DATE_FORMAT(o.created_at, '%Y-%m') = $2`;
      params.push(month);
    }
    sql += ` ORDER BY o.created_at DESC`;
    
    // 同时查询用户有订单的月份列表
    const monthsResult = await queryOp<any>(req,
      `SELECT DISTINCT DATE_FORMAT(created_at, '%Y-%m') AS month
       FROM orders WHERE user_id = $1 ORDER BY month DESC`,
      [userId]
    );
    const availableMonths = (monthsResult || []).map((r: any) => r.month);

    const orders = await queryOp<any>(req, sql, params);
    res.json({ code: 0, data: { list: orders || [], availableMonths } });
  } catch (e: any) {
    console.error('[玩家] 查询订单失败:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /player/orders
 * 购买参赛包
 */
router.post('/orders', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { packageId } = req.body;

  if (!packageId) {
    res.json({ code: 400, message: '缺少参赛包ID', data: null });
    return;
  }

  try {
    // 查询参赛包（含新字段）
    const pkg = await queryOpOne<{ id: string; name: string; price_cents: number; race_count: number; growth_value: number; point_value: number; free_deduction_cents: number; operator_id: string }>(req, 
      `SELECT id, name, price_cents, race_count, growth_value, point_value, free_deduction_cents, operator_id FROM race_packages WHERE id = $1 AND status = 'active'`,
      [packageId]
    );

    if (!pkg) {
      res.json({ code: 404, message: '参赛包不存在或已下架', data: null });
      return;
    }

    const orderId = uuidv4();
    const orderNo = 'ORD_' + Date.now() + '_' + userId.substring(0, 8);
    
    // 积分抵扣新机制（替代参赛抵扣卡）
    let deductionCents = 0;
    const { usePointsDeduction } = req.body;
    if (usePointsDeduction) {
      try {
        const rateRow = await queryOpOne<any>(req,
          `SELECT \`key\`, \`value\` FROM marketing_config WHERE \`key\` = 'points_deduction_rate'`
        );
        const capRow = await queryOpOne<any>(req,
          `SELECT \`key\`, \`value\` FROM marketing_config WHERE \`key\` = 'points_max_deduction_cents'`
        );
        const rate = parseInt(rateRow?.value || '100', 10);
        const maxCents = parseInt(capRow?.value || '2000', 10);

        const balRow = await queryOpOne<{ balance: string }>(req,
          `SELECT COALESCE(SUM(points), 0) as balance FROM points_transactions WHERE user_id = $1`,
          [userId]
        );
        const points = parseInt(balRow?.balance || '0', 10);
        const maxFromPoints = Math.min(Math.floor(points * 100 / rate), maxCents);
        deductionCents = Math.min(maxFromPoints, pkg.price_cents);

        // 积分不在此处扣除，移至 wx-pay.ts 支付回调成功后才扣
        console.log(`[订单] 用户${userId}预计抵扣${deductionCents}分（支付成功后才扣）`);
      } catch (deductionErr: any) {
        console.error('[订单] 积分抵扣失败（不阻止下单）:', deductionErr?.message || deductionErr);
        deductionCents = 0;
      }
    }

    // 成长值发放机制重构：购包不直接发经验/积分，签到才发
    // remaining_times = race_count（包的参赛次数）, remaining_growth = growth_value
    // 每签到一次发放成长值：growth_value / race_count
    const growthValue = (pkg as any).growth_value || 0;
    const pointValue = (pkg as any).point_value || 0;
    const remainingTimes = pkg.race_count || 0;
    const remainingGrowth = growthValue;

    // 计算最终支付金额（最低0）
    const finalPriceCents = Math.max(0, pkg.price_cents - deductionCents);

    // 创建订单（status='pending'，支付回调成功后改为 'paid'）
    await queryOp(req, 
      `INSERT INTO orders (id, order_no, user_id, package_id, amount_cents, discount_cents,
               points_deduction_cents, remaining_times, remaining_growth, status, created_at, operator_id, prepay_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW(), $10, '')`,
      [orderId, orderNo, userId, packageId, pkg.price_cents, 0,
       deductionCents, remainingTimes, remainingGrowth,
       (pkg as any).operator_id || '']
    );

    // 构造支付参数（调微信支付真实 API）
    // 注意：side effects（race_count, deductions, coupons, settlements）
    // 移至 wx-pay.ts 支付回调中执行，确保支付成功后才会发放
    let paymentParams: any;
    try {
      if (isPayConfigured() && finalPriceCents > 0) {
        // 调微信支付 V3 JSAPI 统一下单
        const appId = config.wechat.appId;
        const userOpenid = (req.user as any)?.openid || '';

        if (!userOpenid) {
          console.warn('[订单] 用户缺少 openid，降级为模拟支付');
          paymentParams = generateMockPayParams();
        } else {
          const wxOrder = await wechatPayRequest<any>('POST', '/v3/pay/transactions/jsapi', {
            appid: appId,
            mchid: config.wechatPay.mchId,
            description: `参赛包-${pkg.name}`.slice(0, 127),
            out_trade_no: orderNo,
            notify_url: config.wechatPay.notifyUrl,
            amount: { total: finalPriceCents, currency: 'CNY' },
            payer: { openid: userOpenid },
          });

          // 保存 prepay_id 到订单
          await queryOp(req,
            `UPDATE orders SET payment_method = 'wechat_pay', prepay_id = $1 WHERE id = $2`,
            [wxOrder.prepay_id, orderId]
          );

          // 生成小程序调起支付参数
          paymentParams = generateMiniProgramPayParams(wxOrder.prepay_id, appId);
          console.log('[订单] 微信支付下单成功, prepay_id:', wxOrder.prepay_id);
        }
      } else {
        // 开发模式 / 零元订单：降级为模拟参数
        paymentParams = generateMockPayParams();
      }
    } catch (payErr: any) {
      console.error('[订单] 微信支付下单失败:', payErr?.message || payErr);
      // 降级：返回模拟参数，避免阻塞下单流程
      paymentParams = generateMockPayParams();
    }

    res.json({
      code: 0,
      data: {
        id: orderId,
        orderNo,
        packageId,
        packageName: pkg.name,
        originalPrice: pkg.price_cents,
        deductionCents,
        finalPrice: finalPriceCents,
        raceCount: pkg.race_count,
        paymentParams,
        status: 'pending',
      }
    });
  } catch (e: any) {
    console.error('[订单] 购买参赛包失败:', e?.message || e);
    res.json({ code: 500, message: '下单失败，请稍后再试', data: null });
  }
});

// ============================================================
// 好友助力功能 — 完整业务逻辑
// ============================================================
//
// 规则清单（参照需求文档 V6.0）：
//
// 核心逻辑：通过『发起者』拉『助力者』进入游戏，助力者也可能自己再发起新活动，形成裂变。
//
// 发起资格：
//   R1. 无需购买参赛包即可发起助力（新用户注册后只要有0剩余次数即可）
//   R2. 剩余参赛次数必须为 0
//   R3. 不能给自己助力
//   R4. 没有进行中的助力活动
//
// 助力者资格：
//   R4. 必须已微信登录（authMiddleware 强制）
//   R5. 同一设备（deviceId）永久最多助力 3 次
//   R6. 已参与过助力的用户（含发起者和助力者），永久不能再助力别人
//       已参与过助力的用户只能自行发起新助力来拉更多人
//   R7. 不能对自己的活动助力
//
// 助力活动：
//   R8. 助力人数默认 5 人（从 system_config 读取）
//   R9. 活动有效期写入 helps 表
//
// 数据源：
//   - helps 表：持久化存储助力活动
//   - system_config 表：存储全局配置
// ============================================================

// ---------- 辅助函数 ----------

/** 获取系统配置值，不存在时返回默认值 */
async function getSystemConfig(key: string, defaultVal: string): Promise<string> {
  try {
    const row = await queryOne<{ value: string }>(
      `SELECT value FROM system_config WHERE \`key\` = $1`,
      [key]
    );
    return row?.value ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

/**
 * 查询用户剩余参赛次数
 *
 * 来源 ① 购包次数（orders + race_packages 减去已使用 checkins）
 * 来源 ② 好友助力完成的 race_count 奖励（存入 users.race_count）
 *
 * race_count 同步：由 issueRaceCountRewardForCompletion 写入，本函数一起统计
 *
 */
async function getUserRemainingRaces(userId: string, req: Request): Promise<number> {
  try {
    const row = await queryOpOne<{ total: number }>(req,
      `SELECT COALESCE(SUM(remaining_times), 0) as total
       FROM orders
       WHERE user_id = $1 AND status = 'paid' AND remaining_times > 0`,
      [userId]
    );
    return row?.total || 0;
  } catch (e: any) {
    console.error('[Player] getUserRemainingRaces error:', e?.message || e);
    return 0;
  }
}

/**
 * POST /player/order/:id/confirm-payment
 * 前端支付成功后手动确认订单（wx.requestPayment success 回调触发）
 * 写入 status='paid' 并执行 side effects（参赛次数、抵扣金等），幂等防重复
 */
router.post('/order/:id/confirm-payment', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;

  try {
    const pool = await resolveOperatorDbForOrder(id);
    if (!pool) {
      res.json({ code: 404, message: '订单不存在', data: null });
      return;
    }

    // 1. 防重复 + 查订单完整信息
    const [orderRows] = await pool.execute(
      `SELECT id, order_no, status, user_id, package_id, operator_id, amount_cents, discount_cents FROM orders WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    const order = (orderRows as any[])?.[0];
    if (!order) {
      res.json({ code: 404, message: '订单不存在', data: null });
      return;
    }
    if (order.status === 'paid') {
      res.json({ code: 0, data: { status: 'paid', updated: false, message: 'already paid' } });
      return;
    }
    if (order.status !== 'pending') {
      res.json({ code: 0, data: { status: order.status, updated: false } });
      return;
    }

    // 2. 更新订单状态
    const [updateResult] = await pool.execute(
      `UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = ? AND status = 'pending'`,
      [id]
    );
    const changes = (updateResult as any)?.affectedRows || 0;

    if (changes > 0) {
      // 3b. 🔴 财务：幂等写入运营商库 settlements
      try {
        const [stlRows] = await pool.execute(
          `SELECT id FROM settlements WHERE order_id = ? LIMIT 1`, [id]
        );
        if (!stlRows || (Array.isArray(stlRows) && stlRows.length === 0)) {
          await pool.execute(
            `INSERT INTO settlements (id, order_id, amount_cents, commission_cents, operator_id, status, created_at)
             VALUES (?, ?, ?, 0, ?, 'pending', NOW())`,
            [uuidv4(), id, order.amount_cents || 0, order.operator_id]
          );
        }
      } catch (stlErr: any) {
        console.warn('[Player] confirm-payment settlements:', stlErr.message?.substring(0, 100));
      }

      // 3c. 🔴 财务：写入总部 common 库 settlements（跨运营商分账）
      try {
        const [commonStl] = await query<any[]>(
          `SELECT id FROM settlements WHERE order_id = ? LIMIT 1`, [id]
        );
        if (!commonStl || commonStl.length === 0) {
          await execute(
            `INSERT INTO settlements (id, order_id, operator_id, amount_cents, commission_cents, status, created_at)
             VALUES (?, ?, ?, ?, 0, 'pending', NOW())`,
            [uuidv4(), id, order.operator_id, order.amount_cents || 0]
          );
        }
      } catch (cStlErr: any) {
        console.warn('[Player] confirm-payment common settlements:', cStlErr.message?.substring(0, 100));
      }

      // 3d. 执行 side effects（仅参赛次数，抵扣卡已废弃）
      try {
        const [orderDetailRows] = await pool.execute(
          `SELECT o.user_id, o.package_id, rp.race_count
           FROM orders o JOIN race_packages rp ON o.package_id = rp.id
           WHERE o.id = ?`,
          [id]
        );
        const d = (orderDetailRows as any[])?.[0];
        if (d) {
          const { user_id: uid, race_count: rc } = d;

          if (rc > 0) {
            await pool.execute(
              `UPDATE users SET race_count = COALESCE(race_count, 0) + ?, updated_at = NOW() WHERE id = ?`,
              [rc, uid]
            );
            console.log(`[Player] confirm-payment side: +${rc} races for user ${uid}`);
          }
        }
      } catch (sideErr: any) {
        console.error('[Player] confirm-payment side-effects error:', sideErr.message?.substring(0, 200));
      }
    }

    console.log(`[Player] confirm-payment order=${id} user=${userId} changes=${changes}`);
    res.json({ code: 0, data: { status: 'paid', updated: changes > 0 } });
  } catch (e: any) {
    console.error('[Player] confirm-payment error:', e?.message || e);
    res.json({ code: 500, message: '确认失败', data: null });
  }
});

/**
 * GET /player/marketing/announcement
 * 查询首页公告（从运营商隔离库 marketing_config 表）
 */
router.get('/marketing/announcement', optionalAuth, async (req: Request, res: Response) => {
  try {
    const row = await queryOpOne<{ value: string }>(req,
      `SELECT value FROM marketing_config WHERE \`key\` = 'home_announcement' ORDER BY updated_at DESC LIMIT 1`
    );
    res.json({ code: 0, data: { text: row?.value || '' } });
  } catch (e: any) {
    console.error('[Player] marketing/announcement error:', e?.message || e);
    res.json({ code: 0, data: { text: '' } });
  }
});

export default router;
