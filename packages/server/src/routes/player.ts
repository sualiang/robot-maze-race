import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { getConfigInt } from '../config/utils';
import { authMiddleware } from '../middleware/auth';

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

router.get('/packages', authMiddleware, async (req: Request, res: Response) => {
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
      `SELECT o.id, o.remaining_times, o.remaining_growth, rp.race_count, rp.growth_value, rp.point_value
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
    const perCheckinPoints = Math.floor((order.point_value || 0) / raceCount);

    if (perCheckinGrowth > 0) {
      const season = await queryOne<{ id: string }>(
        `SELECT id FROM seasons WHERE status = 1 ORDER BY created_at DESC LIMIT 1`
      );
      if (season) {
        const existing = await queryOne<{ id: string; exp: number; points: number }>(
          `SELECT id, exp, points FROM season_user_info WHERE user_id = $1 AND season_id = $2`,
          [userId, season.id]
        );
        if (existing) {
          await execute(
            `UPDATE season_user_info SET exp = exp + $1, points = points + $2, updated_at = NOW() WHERE id = $3`,
            [perCheckinGrowth, perCheckinPoints, existing.id]
          );
        } else {
          await query(
            `INSERT INTO season_user_info (id, user_id, season_id, level, exp, points)
             VALUES ($1, $2, $3, 1, $4, $5)`,
            [uuidv4(), userId, season.id, perCheckinGrowth, perCheckinPoints]
          );
        }
      }
      await execute(
        `UPDATE users SET exp = COALESCE(exp, 0) + $1, points = COALESCE(points, 0) + $2, updated_at = NOW() WHERE id = $3`,
        [perCheckinGrowth, perCheckinPoints, userId]
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

    // 查询可用抵扣金余额（通过物理隔离自动按运营商过滤）
    let availableDeductionCents = 0;
    try {
      const deductionRow = await queryOpOne<{ total: number }>(req, 
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM entry_deductions WHERE user_id = $1 AND status = 'available'`,
        [userId]
      );
      availableDeductionCents = deductionRow?.total || 0;
    } catch (deductionErr) {
      console.error('[profile-check] 查询参赛抵扣卡失败:', (deductionErr as Error)?.message);
    }

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

    // 查询积分余额（按运营商隔离，从 operator DB 的 points_transactions SUM）
    let pointsBalance = 0;
    try {
      const opId = (req.user as any)?.operatorId || '';
      const pointsRow = await queryOpOne<{ balance: string }>(req,
        `SELECT COALESCE(SUM(points), 0) as balance FROM points_transactions WHERE user_id = $1 AND operator_id = $2`,
        [userId, opId]
      );
      pointsBalance = parseInt(pointsRow?.balance || '0', 10);
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
        availableDeductionCents,
        availableDeductionYuan: availableDeductionCents / 100,
        couponTotalCents,
        couponTotalYuan: couponTotalCents / 100,
        pointsBalance,
      }
    });
  } catch (e: any) {
    console.error('[profile-check] error:', e?.message || e);
    res.json({ code: 0, data: { needPhone: true, nickname: '', phone: '', gender: '', raceCount: 0, remainCount: 0, availableDeductionCents: 0, availableDeductionYuan: 0, couponTotalCents: 0, couponTotalYuan: 0, pointsBalance: 0 } });
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
 * GET /player/me/race-records
 * 返回历史参赛记录列表
 * 从 race_results 表查询
 */
router.get('/me/race-records', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const opId = (req.user as any)?.operatorId || '';
    const records = await queryOp<any>(req, 
      `SELECT rr.id, rr.score_ms, rr.rank, rr.status, rr.finished_at, rr.created_at,
              v.name as venue_name
       FROM race_results rr
       LEFT JOIN venues v ON rr.venue_id = v.id
       WHERE rr.user_id = $1 AND rr.operator_id = $2
       ORDER BY rr.created_at DESC
       LIMIT 50`,
      [userId, opId]
    );

    const result = (records || []).map((r: any) => ({
      id: r.id,
      score: r.score_ms || 0,
      rank: r.rank || 0,
      date: r.finished_at || r.created_at,
      growValue: 0,   // 成长值在 V2 暂从 race_results 不直接关联，后续可扩展
      points: 0,       // 积分奖励在完成比赛时已写入 users.points，此处展示历史固定值
      venueName: r.venue_name || '',
      status: r.status || '',
    }));

    res.json({ code: 0, data: result });
  } catch (e: any) {
    console.error('[Player] race-records error:', e?.message || e);
    res.json({ code: 500, message: '查询参赛记录失败', data: null });
  }
});

/**
 * GET /player/deductions
 * 获取用户的参赛抵扣金列表
 */
router.get('/deductions', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const deductions = await queryOp<any>(req, 
      `SELECT id, amount_cents, amount_cents as used_cents, source, status, order_id,
              race_package_id, expires_at, created_at
       FROM entry_deductions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    const list = (deductions || []).map((d: any) => ({
      id: d.id,
      amountCents: d.amount_cents || 0,
      amountYuan: (d.amount_cents || 0) / 100,
      usedCents: d.used_cents || 0,
      source: d.source,
      status: d.status,
      orderId: d.order_id,
      racePackageId: d.race_package_id,
      expiresAt: d.expires_at,
      createdAt: d.created_at,
    }));
    res.json({ code: 0, data: { list } });
  } catch (e: any) {
    console.error('[Player] deductions error:', e?.message || e);
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
  try {
    const orders = await queryOp<any>(req, 
      `SELECT o.id, o.order_no, o.package_id, rp.name as package_name, o.amount_cents, o.discount_cents,
              o.status, o.paid_at, o.created_at
       FROM orders o
       LEFT JOIN race_packages rp ON o.package_id = rp.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    res.json({ code: 0, data: { list: orders || [] } });
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
    const pkg = await queryOpOne<{ id: string; name: string; price_cents: number; race_count: number; growth_value: number; point_value: number; free_deduction_cents: number }>(req, 
      `SELECT id, name, price_cents, race_count, growth_value, point_value, free_deduction_cents FROM race_packages WHERE id = $1 AND status = 'active'`,
      [packageId]
    );

    if (!pkg) {
      res.json({ code: 404, message: '参赛包不存在或已下架', data: null });
      return;
    }

    const orderId = uuidv4();
    const orderNo = 'ORD_' + Date.now() + '_' + userId.substring(0, 8);
    
    // 自动使用可用参赛抵扣金
    let deductionCents = 0;
    let deductionRecordIds: string[] = [];
    try {
      // 查询用户所有可用抵扣金（按创建时间升序）
      const deductions = await queryOp<{ id: any; amount_cents: number }>(req, 
        `SELECT id, amount_cents FROM entry_deductions
         WHERE user_id = $1 AND status = 'available'
         ORDER BY created_at ASC`,
        [userId]
      );

      if (deductions && deductions.length > 0) {
        let remainingPrice = pkg.price_cents;

        for (const d of deductions) {
          if (remainingPrice <= 0) break;
          const useAmount = Math.min(d.amount_cents, remainingPrice);
          deductionCents += useAmount;
          remainingPrice -= useAmount;

          // 标记已使用的抵扣金
          await executeOp(req, 
            `UPDATE entry_deductions
             SET status = 'used', order_id = $1, used_at = NOW()
             WHERE id = $2`,
            [orderId, d.id]
          );
          deductionRecordIds.push(String(d.id));
        }

        console.log(`[订单] 用户${userId}使用抵扣金${deductionCents}分（${deductionRecordIds.length}张）`);
      }
    } catch (deductionErr: any) {
      console.error('[订单] 扣减抵扣金失败（不阻止下单）:', deductionErr?.message || deductionErr);
      // 抵扣金扣减失败不应阻止下单
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
               remaining_times, remaining_growth, status, created_at, operator_id, prepay_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), $9, '')`,
      [orderId, orderNo, userId, packageId, pkg.price_cents, deductionCents,
       remainingTimes, remainingGrowth,
       (req.user as any)?.operatorId || '']
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
 * 仅更新 status='paid'，不去重 — 微信回调 side effects 由 /pay/notify 统一处理
 */
router.post('/order/:id/confirm-payment', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;

  try {
    const result = await executeOp(req,
      `UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [id, userId]
    );
    res.json({ code: 0, data: { status: 'paid', updated: (result as any)?.rowCount > 0 } });
  } catch (e: any) {
    console.error('[Player] confirm-payment error:', e?.message || e);
    res.json({ code: 500, message: '确认失败', data: null });
  }
});

/**
 * GET /player/marketing/announcement
 * 查询首页公告（从运营商隔离库 marketing_config 表）
 */
router.get('/marketing/announcement', authMiddleware, async (req: Request, res: Response) => {
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
