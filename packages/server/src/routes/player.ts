import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { getConfigInt } from '../config/utils';
import { authMiddleware } from '../middleware/auth';
import { getOperatorContext } from '../middleware/operator-context';
import { autoAssignMerchantCoupons } from '../services/coupon-service';
import { rateLimiter } from '../middleware/rateLimiter';

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

router.get('/packages', async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT * FROM race_packages WHERE status = 'active' ORDER BY sort_order ASC, price_cents ASC`
    );

    const result = await Promise.all((rows || []).map(async (row: any) => {
      const coupons = await query<any>(
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
    const record = await queryOne<any>(
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
    const venue = await queryOne<any>(
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
    const existing = await queryOne<{ id: string }>(
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
 * 需要用户有剩余参赛次数
 */
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
    const venue = await queryOne<any>(
      `SELECT id, name, status, operator_id FROM venues WHERE id = $1`,
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

    // 检查剩余参赛次数
    const remainingRaces = await getUserRemainingRaces(userId);
    if (remainingRaces <= 0) {
      res.json({ code: 400, message: '您没有剩余参赛次数，请购买参赛包或发起好友助力', data: null });
      return;
    }

    // 检查是否已经在排队
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM checkins
       WHERE user_id = $1 AND venue_id = $2 AND status NOT IN ('cancelled', 'completed')`,
      [userId, venueId]
    );
    if (existing) {
      res.json({ code: 400, message: '您已在该赛场签到，无需重复签到', data: null });
      return;
    }

    // 计算排队号
    const maxQueue = await queryOne<{ max_q: number }>(
      `SELECT COALESCE(MAX(queue_number), 0) as max_q FROM checkins WHERE venue_id = $1 AND status NOT IN ('cancelled', 'completed')`,
      [venueId]
    );
    const queueNumber = (maxQueue?.max_q ?? 0) + 1;

    // 创建签到记录
    const checkinId = uuidv4();
    const venueOperatorId = venue?.operator_id || '';
    await query(
      `INSERT INTO checkins (id, user_id, venue_id, queue_number, status, checked_in_at, created_at, updated_at, operator_id)
       VALUES ($1, $2, $3, $4, 'queued', NOW(), NOW(), NOW(), $5)`,
      [checkinId, userId, venueId, queueNumber, venueOperatorId]
    );

    // 成长值发放：从已购且还有剩余次数的参赛包中，按包扣减
    // 找到最新一个有 remaining_times > 0 的订单，扣减一次，发放 growth_value / race_count
    await grantGrowthOnCheckin(userId, checkinId);

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
    const record = await queryOne<any>(
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
    const aheadRow = await queryOne<{ cnt: number }>(
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
  let opId = '';
  try {
    const ctx = await getOperatorContext(userId);
    opId = ctx?.operator_id || '';
  } catch { /* ignore */ }

  try {
    const user = await queryOne<{ nickname: string; phone: string; gender: string; race_count: number }>(
      `SELECT nickname, phone, gender, race_count FROM users WHERE id = $1`,
      [userId]
    );

    // 查询可用抵扣金余额
    let availableDeductionCents = 0;
    try {
      const deductionRow = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM entry_deductions WHERE user_id = $1 AND status = 'available' AND operator_id = $2`,
        [userId, opId]
      );
      availableDeductionCents = deductionRow?.total || 0;
    } catch (deductionErr) {
      console.error('[profile-check] 查询参赛抵扣卡失败:', (deductionErr as Error)?.message);
    }

    // 查询消费券总额
    let couponTotalCents = 0;
    try {
      const couponRow = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(denomination_cents), 0) as total FROM user_coupons WHERE user_id = $1 AND status = 1 AND (valid_end IS NULL OR valid_end >= NOW()) AND operator_id = $2`,
        [userId, opId]
      );
      couponTotalCents = couponRow?.total || 0;
    } catch (couponErr) {
      console.error('[profile-check] 查询消费券失败:', (couponErr as Error)?.message);
    }

    // 查询积分余额（从 users.points 字段读取）
    let pointsBalance = 0;
    try {
      const pointsRow = await queryOne<{ points: number }>(
        `SELECT COALESCE(points, 0) as points FROM users WHERE id = $1`,
        [userId]
      );
      pointsBalance = pointsRow?.points || 0;
    } catch (pointsErr) {
      // 静默失败，可能是旧版本没有 points 字段
    }

    const needPhone = !user || !user.nickname || !user.phone;
    const remainCount = await getUserRemainingRaces(userId);
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
    const remainingRaces = await getUserRemainingRaces(userId);

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
  let opId = '';
  try { const ctx = await getOperatorContext(userId); opId = ctx?.operator_id || ''; } catch {}

  try {
    const records = await query<any>(
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
  let opId = '';
  try { const ctx = await getOperatorContext(userId); opId = ctx?.operator_id || ''; } catch {}

  try {
    const deductions = await query<any>(
      `SELECT id, amount_cents, amount_cents as used_cents, source, status, order_id,
              race_package_id, expires_at, created_at
       FROM entry_deductions
       WHERE user_id = $1 AND operator_id = $2
       ORDER BY created_at DESC`,
      [userId, opId]
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

  // Get operator context for isolation
  let opId = '';
  try { const ctx = await getOperatorContext(userId); opId = ctx?.operator_id || ''; } catch {}

  try {
    let whereClause = 'WHERE uc.user_id = $1';
    const params: any[] = [userId];

    // Operator isolation
    if (opId) {
      params.push(opId);
      whereClause += ' AND uc.operator_id = $' + params.length;
    }

    // 按 coupon_type 筛选
    if (type) {
      const typeNum = parseInt(type as string, 10);
      if ([1, 3, 4].includes(typeNum)) {
        whereClause += ' AND uc.coupon_type = $2';
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

    const coupons = await query<any>(
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
    const orders = await query<any>(
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
    const pkg = await queryOne<{ id: string; name: string; price_cents: number; race_count: number; growth_value: number; point_value: number; free_deduction_cents: number; operator_id: string }>(
      `SELECT id, name, price_cents, race_count, growth_value, point_value, free_deduction_cents, operator_id FROM race_packages WHERE id = $1 AND status = 'active'`,
      [packageId]
    );

    if (!pkg) {
      res.json({ code: 404, message: '参赛包不存在或已下架', data: null });
      return;
    }

    const orderId = uuidv4();
    const orderNo = 'ORD_' + Date.now() + '_' + userId.substring(0, 8);
    const pkgOpId = pkg?.operator_id || '';

    // 自动使用可用参赛抵扣金
    let deductionCents = 0;
    let deductionRecordIds: string[] = [];
    try {
      // 查询用户所有可用抵扣金（按创建时间升序）
      const deductions = await query<{ id: any; amount_cents: number }>(
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
          await execute(
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

    // 创建订单（记录 remaining_times / remaining_growth 作为签到发成长值的依据）
    await query(
      `INSERT INTO orders (id, order_no, user_id, package_id, amount_cents, discount_cents,
               remaining_times, remaining_growth, status, paid_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', NOW(), NOW())`,
      [orderId, orderNo, userId, packageId, pkg.price_cents, deductionCents,
       remainingTimes, remainingGrowth]
    );

    // 购买参赛包后，更新用户参赛次数
    if (pkg.race_count > 0) {
      try {
        await execute(
          `UPDATE users SET race_count = COALESCE(race_count, 0) + $1, updated_at = NOW() WHERE id = $2`,
          [pkg.race_count, userId]
        );
        console.log('[订单] 购买参赛包增加参赛次数:', pkg.race_count, '次');
      } catch (raceCountErr: any) {
        console.error('[订单] 更新参赛次数失败:', raceCountErr?.message || raceCountErr);
      }
    }

    // 购买后自动赠送抵扣金（如参赛包有 free_deduction_cents 配置）
    const freeDeductionCents = (pkg as any).free_deduction_cents || 0;
    if (freeDeductionCents > 0) {
      try {
        const deductionId = uuidv4();
        await query(
          `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, order_id, race_package_id, expires_at, created_at, operator_id)
           VALUES ($1, $2, $3, 'order_purchase', 'available', $4, $5, DATE_ADD(NOW(), INTERVAL 365 DAY), NOW(), $6)`,
          [deductionId, userId, freeDeductionCents, orderId, packageId, pkgOpId]
        );
        console.log(`[订单] 购买参赛包赠送抵扣金${freeDeductionCents}分`);
      } catch (grantErr: any) {
        console.error('[订单] 赠送抵扣金失败:', grantErr?.message || grantErr);
      }
    }

    // 购买后自动配消费券（从券池按算法匹配，详见 coupon-service）
    try {
      const assignResult = await autoAssignMerchantCoupons(userId, orderId, packageId);
      if (assignResult.grantedCount > 0) {
        console.log(`[订单] 自动配券: ${assignResult.grantedCount}张, 总面额${assignResult.totalCents}分, 覆盖${assignResult.merchantCount}家商家`);
      }
    } catch (couponErr: any) {
      console.error('[订单] 自动配券失败:', couponErr?.message || couponErr);
    }

    // 购包成功后自动发放参赛抵扣卡
    // 专业包（tag='professional'）发3张2000分参赛抵扣卡，source='order_purchase_pro'
    // 其他包包根据 tag 发放对应的参赛抵扣卡
    try {
      // 查询参赛包的 tag
      const pkgTag = await queryOne<{ tag: string }>(
        `SELECT tag FROM race_packages WHERE id = $1`,
        [packageId]
      );
      const tag = pkgTag?.tag || '';

      if (tag === 'professional') {
        // 专业包：发3张20元参赛抵扣卡到 entry_deductions
        for (let i = 0; i < 3; i++) {
          const dedId = uuidv4();
          await execute(
            `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, order_id, race_package_id, expires_at, created_at, operator_id)
             VALUES ($1, $2, $3, 'order_purchase_pro', 'available', $4, $5, DATE_ADD(NOW(), INTERVAL 365 DAY), NOW(), $6)`,
            [dedId, userId, 2000, orderId, packageId, pkgOpId]
          );
        }
        console.log(`[订单] 专业包购包赠参赛抵扣金：用户${userId}，参赛包${packageId}，共3张×2000分`);
      } else if (tag === 'standard') {
        // 标准包：发1张1500分参赛抵扣卡
        const dedId = uuidv4();
        await execute(
          `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, order_id, race_package_id, expires_at, created_at, operator_id)
           VALUES ($1, $2, $3, 'order_purchase', 'available', $4, $5, DATE_ADD(NOW(), INTERVAL 365 DAY), NOW(), $6)`,
          [dedId, userId, 1500, orderId, packageId, pkgOpId]
        );
        console.log(`[订单] 标准包购包赠参赛抵扣金：用户${userId}，1张×1500分`);
      } else if (tag === 'basic') {
        // 基础包：发1张500分参赛抵扣卡
        const dedId = uuidv4();
        await execute(
          `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, order_id, race_package_id, expires_at, created_at, operator_id)
           VALUES ($1, $2, $3, 'order_purchase', 'available', $4, $5, DATE_ADD(NOW(), INTERVAL 365 DAY), NOW(), $6)`,
          [dedId, userId, 500, orderId, packageId, pkgOpId]
        );
        console.log(`[订单] 基础包购包赠参赛抵扣金：用户${userId}，1张×500分`);
      }
    } catch (giftErr: any) {
      console.error('[订单] 参赛包赠送抵扣金失败:', giftErr?.message || giftErr);
    }

    // 构造支付参数（开发环境直接返回模拟参数）
    const paymentParams = {
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: Math.random().toString(36).substring(2, 18),
      package: 'prepay_id=' + Math.random().toString(36).substring(2, 20),
      signType: 'MD5',
      paySign: 'MOCK_' + Math.random().toString(36).substring(2, 34),
    };

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
        status: 'paid',
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
 */
async function getUserRemainingRaces(userId: string): Promise<number> {
  try {
    // 从 orders.remaining_times 统计剩余可用参赛次数
    const row = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(remaining_times), 0) as total FROM orders
       WHERE user_id = $1 AND status = 'paid' AND remaining_times > 0`,
      [userId]
    );
    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 签到发放成长值（exp）
 * 从用户已购订单中找 remaining_times > 0 的订单，按包扣减一次
 * 每次发放额 = remaining_growth / original_game_times = growth_value / race_count
 * 点数 = point_value / race_count
 */
async function grantGrowthOnCheckin(userId: string, checkinId: string): Promise<void> {
  try {
    // 找到用户 remaining_times > 0 的订单（最早购买的优先消耗）
    const order = await queryOne<any>(
      `SELECT o.id, o.remaining_times, o.remaining_growth, rp.race_count, rp.growth_value, rp.point_value
       FROM orders o
       JOIN race_packages rp ON o.package_id = rp.id
       WHERE o.user_id = $1 AND o.status = 'paid' AND o.remaining_times > 0
       ORDER BY o.paid_at ASC
       LIMIT 1`,
      [userId]
    );

    if (!order) {
      console.log('[成长值发放] 用户', userId, '无可用参赛包剩余次数');
      return;
    }

    const raceCount = order.race_count || 1;
    const perCheckinGrowth = Math.floor((order.growth_value || 0) / raceCount);
    const perCheckinPoints = Math.floor((order.point_value || 0) / raceCount);

    if (perCheckinGrowth > 0) {
      // 发放成长值到 season_user_info
      const season = await queryOne<{ id: string }>(
        `SELECT id FROM seasons WHERE status = 1 ORDER BY created_at DESC LIMIT 1`
      );
      if (season) {
        const existingSeasonUser = await queryOne<{ id: string; exp: number; points: number }>(
          `SELECT id, exp, points FROM season_user_info WHERE user_id = $1 AND season_id = $2`,
          [userId, season.id]
        );
        if (existingSeasonUser) {
          await execute(
            `UPDATE season_user_info SET exp = exp + $1, points = points + $2, updated_at = NOW() WHERE id = $3`,
            [perCheckinGrowth, perCheckinPoints, existingSeasonUser.id]
          );
        } else {
          await query(
            `INSERT INTO season_user_info (id, user_id, season_id, level, exp, points)
             VALUES ($1, $2, $3, 1, $4, $5)`,
            [uuidv4(), userId, season.id, perCheckinGrowth, perCheckinPoints]
          );
        }
      }

      // 同时更新 users 表的 exp/points（供非赛季场景使用）
      await execute(
        `UPDATE users SET exp = COALESCE(exp, 0) + $1, points = COALESCE(points, 0) + $2, updated_at = NOW() WHERE id = $3`,
        [perCheckinGrowth, perCheckinPoints, userId]
      );

      console.log('[成长值发放] 用户', userId, '签到获得成长值:', perCheckinGrowth, '积分:', perCheckinPoints);
    }

    // 扣减订单的剩余次数和剩余成长值
    await execute(
      `UPDATE orders SET remaining_times = remaining_times - 1, updated_at = NOW() WHERE id = $1 AND remaining_times > 0`,
      [order.id]
    );
  } catch (err: any) {
    console.error('[成长值发放] 失败:', err?.message || err);
  }
}

/** 查询用户是否有已支付的订单（是否购买过参赛包） */
async function hasPurchasedPackage(userId: string): Promise<boolean> {
  try {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM orders WHERE user_id = $1 AND status = 'paid'`,
      [userId]
    );
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

/** 查询设备（deviceId）已助力次数 */
async function getDeviceHelpCount(deviceId: string): Promise<number> {
  try {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM help_helpers WHERE device_id = $1`,
      [deviceId]
    );
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

/** 查询用户已助力了几个不同的发起者 */
async function getUserHelpedInitiatorCount(helperUserId: string): Promise<number> {
  try {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT initiator_id) as cnt FROM helps WHERE helper_id = $1`,
      [helperUserId]
    );
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 幂等性辅助：查找已有 key 并返回缓存结果
 * @returns true=命中缓存已发送响应，false=继续正常处理
 */
async function checkIdempotency(key: string | undefined, res: Response): Promise<boolean> {
  if (!key) return false;
  try {
    const existing = await queryOne<{ response: string }>(
      `SELECT response FROM idempotency_keys WHERE \`key\` = $1`,
      [key]
    );
    if (existing) {
      const cached = JSON.parse(existing.response);
      res.json(cached);
      return true;
    }
  } catch (e: any) {
    console.error('[幂等] 查找失败:', e?.message || e);
  }
  return false;
}

/** 缓存幂等性结果 */
async function saveIdempotency(key: string | undefined, result: any): Promise<void> {
  if (!key) return;
  try {
    await query(
      `INSERT INTO idempotency_keys (id, \`key\`, response, created_at) VALUES ($1, $2, $3, NOW())`,
      [uuidv4(), key, JSON.stringify(result)]
    );
  } catch (e: any) {
    console.error('[幂等] 缓存失败:', e?.message || e);
  }
}

/** 查询用户发起中的助力活动数量 */
async function getUserActiveHelpCount(userId: string): Promise<number> {
  try {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM helps WHERE initiator_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

// ---------- API 端点 ----------

/**
 * GET /me/help-activities
 * 获取当前用户的助力记录（发起 + 参与）
 */
router.get('/me/help-activities', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // 发起的活动
    const initiated = await query<any>(
      `SELECT id, initiator_id, target_package_id, status, required_help_count, current_help_count,
              initiated_at, expires_at, created_at
       FROM helps
       WHERE initiator_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    // 参与助力的活动
    const assisted = await query<any>(
      `SELECT h.id, h.initiator_id, h.status, h.required_help_count, h.current_help_count,
              h.initiated_at, h.helped_at
       FROM helps h
       WHERE h.helper_id = $1
       ORDER BY h.helped_at DESC
       LIMIT 20`,
      [userId]
    );

    res.json({ code: 0, data: { initiated, assisted } });
  } catch (e: any) {
    console.error('[帮助] 查询助力记录失败:', e?.message || e);
    res.json({ code: 0, data: { initiated: [], assisted: [] } });
  }
});

/**
 * GET /me/help-status
 * 查询当前用户是否可以发起助力（用于个人中心入口显示）
 */
router.get('/me/help-status', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const hasPurchased = await hasPurchasedPackage(userId);
    const remainingRaces = await getUserRemainingRaces(userId);
    const activeHelpCount = await getUserActiveHelpCount(userId);
    res.json({
      code: 0,
      data: {
        canHelp: remainingRaces <= 0 && activeHelpCount === 0,
        hasPurchased,
        remainingRaces,
        activeHelpCount,
        reason: remainingRaces > 0
          ? '您还有剩余参赛次数，用完后再来吧'
          : activeHelpCount > 0
            ? '您已有一个正在进行中的助力活动'
            : '可以发起助力'
      }
    });
  } catch (e: any) {
    console.error('[帮助] 查询助力状态失败:', e?.message || e);
    res.json({ code: 0, data: { canHelp: false, reason: '查询失败' } });
  }
});

/**
 * GET /player/me/profile
 * 获取完整用户资料（含 V2 赛季字段）
 */
router.get('/me/profile', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const user = await queryOne<any>(
      `SELECT id, nickname, avatar_url, phone, gender, age, role, level, exp, points, race_count, first_login, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!user) {
      res.json({ code: 404, message: '用户不存在', data: null });
      return;
    }
    res.json({
      code: 0,
      data: {
        id: user.id,
        nickname: user.nickname || '',
        avatarUrl: user.avatar_url || '',
        phone: user.phone || '',
        gender: user.gender || '',
        age: user.age || 0,
        role: user.role || 'player',
        level: user.level || 1,
        exp: user.exp || 0,
        points: user.points || 0,
        raceCount: user.race_count || 0,
        firstLogin: !!user.first_login,
        createdAt: user.created_at,
      }
    });
  } catch (e: any) {
    console.error('[玩家] 查询资料失败:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /help/create
 * 创建助力活动
 *
 * 校验（R1, R2）：
 *   - 必须已购买过参赛包
 *   - 剩余参赛次数为 0
 *   - 当前没有进行中的助力活动
 */
router.post('/help/create', authMiddleware, rateLimiter(), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // R20: 幂等性校验 — 命中缓存则直接返回
  if (await checkIdempotency(idempotencyKey, res)) return;

  // R1（新规则）: 无需购买参赛包即可发起助力，只需满足剩余次数为0
  // R2: 剩余参赛次数为 0
  const remainingRaces = await getUserRemainingRaces(userId);
  if (remainingRaces > 0) {
    res.json({ code: 400, message: '您还有 ' + remainingRaces + ' 次参赛次数，用完后再来发起助力', data: null });
    return;
  }

  // 检查当前是否有进行中的助力活动
  const activeCount = await getUserActiveHelpCount(userId);
  if (activeCount > 0) {
    res.json({ code: 400, message: '您已有一个进行中的助力活动，请先完成它', data: null });
    return;
  }

  // R8: 读取系统配置中的助力人数要求（默认 5）
  const requiredHelpStr = await getSystemConfig('help_required_count', '5');
  const requiredHelpCount = parseInt(requiredHelpStr, 10) || 5;

  // 读取活动有效期（默认 7 天）
  const helpValidDaysStr = await getSystemConfig('help_valid_days', '7');
  const helpValidDays = parseInt(helpValidDaysStr, 10) || 7;

  const helpId = uuidv4();

  // 写入 helps 表
  try {
    await query(
      `INSERT INTO helps (id, initiator_id, required_help_count, current_help_count, status, initiated_at, expires_at, created_at)
       VALUES ($1, $2, $3, 0, 'active', NOW(), DATE_ADD(NOW(), INTERVAL CAST($4 AS SIGNED) DAY), NOW())`,
      [helpId, userId, requiredHelpCount, helpValidDays]
    );
  } catch (e: any) {
    console.error('[帮助] 创建助力失败:', e?.message || e);
    res.json({ code: 500, message: '创建助力活动失败', data: null });
    return;
  }

  // 读取用户昵称
  const user = await queryOne<{ nickname: string; avatar_url: string }>(
    `SELECT nickname, avatar_url FROM users WHERE id = $1`,
    [userId]
  );

  const result = {
    code: 0,
    data: {
      id: helpId,
      initiatorId: userId,
      initiatorName: user?.nickname || '玩家',
      initiatorAvatar: user?.avatar_url || '',
      requiredHelpCount,
      currentHelpCount: 0,
      helpers: [],
      createdAt: Date.now(),
      expiredAt: Date.now() + helpValidDays * 86400000,
      status: 'active'
    }
  };

  // R20: 缓存幂等性结果
  await saveIdempotency(idempotencyKey, result);

  res.json(result);
});

/**
 * GET /help/detail
 * 获取助力活动详情（可公开访问，用于分享页）
 */
router.get('/help/detail', async (req: Request, res: Response) => {
  const { helpId } = req.query;
  if (!helpId || typeof helpId !== 'string') {
    res.json({ code: 400, message: '缺少助力活动ID', data: null });
    return;
  }

  try {
    const help = await queryOne<any>(
      `SELECT id, initiator_id, target_package_id, required_help_count, current_help_count,
              status, initiated_at, expires_at, created_at
       FROM helps WHERE id = $1`,
      [helpId]
    );

    if (!help) {
      res.json({ code: 404, message: '助力活动不存在', data: null });
      return;
    }

    // 检查是否过期
    const now = new Date().toISOString();
    if (help.status === 'active' && help.expires_at && help.expires_at < now) {
      // 自动标记过期（静默更新）
      try {
        await query(`UPDATE helps SET status = 'expired' WHERE id = $1 AND status = 'active' AND expires_at < NOW()`, [helpId]);
      } catch {}
      help.status = 'expired';
    }

    // 查询发起者信息
    const initiator = await queryOne<{ nickname: string; avatar_url: string }>(
      `SELECT nickname, avatar_url FROM users WHERE id = $1`,
      [help.initiator_id]
    );

    // 查询已助力的好友列表
    const helpers = await query<any>(
      `SELECT h.helped_at, u.nickname as helper_nickname, u.avatar_url as helper_avatar
       FROM helps h
       LEFT JOIN users u ON h.helper_id = u.id
       WHERE h.id = $1 AND h.helper_id IS NOT NULL
       ORDER BY h.helped_at ASC`,
      [helpId]
    );

    const currentHelpCount = help.current_help_count || 0;
    const requiredHelpCount = help.required_help_count || 5;
    const isExpired = help.status === 'expired';
    const isCompleted = help.status === 'completed';
    const canHelp = help.status === 'active' && currentHelpCount < requiredHelpCount;

    res.json({
      code: 0,
      data: {
        activity: {
          id: help.id,
          initiatorId: help.initiator_id,
          initiatorName: initiator?.nickname || '玩家',
          initiatorAvatar: initiator?.avatar_url || '',
          targetPackageId: help.target_package_id || '',
          requiredHelpCount,
          currentHelpCount,
          helpers: helpers.map((h: any) => ({
            helperNickname: h.helper_nickname || '热心网友',
            helpedAt: new Date(h.helped_at).getTime()
          })),
          createdAt: new Date(help.initiated_at).getTime(),
          expiredAt: help.expires_at ? new Date(help.expires_at).getTime() : null,
          status: help.status,
          progressPercent: requiredHelpCount > 0 ? Math.round(currentHelpCount / requiredHelpCount * 100) : 0,
          isExpired,
          isCompleted
        },
        canHelp
      }
    });
  } catch (e: any) {
    console.error('[帮助] 查询助力详情失败:', e?.message || e);
    res.json({ code: 500, message: '查询助力详情失败', data: null });
  }
});

/**
 * POST /help/assist
 * 为好友助力
 *
 * 校验：
 *   R3/R7 — 不能给自己助力
 *   R4 — 必须登录（authMiddleware）
 *   R5 — 同一设备永久最多助力 3 次
 *   R6 — 同一用户永久最多为 1 人助力
 */
router.post('/help/assist', authMiddleware, rateLimiter(), async (req: Request, res: Response) => {
  const helperUserId = req.user!.userId;
  const { helpId, deviceId } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!helpId) {
    res.json({ code: 400, message: '缺少助力活动ID', data: null });
    return;
  }

  // R20: 幂等性校验
  if (await checkIdempotency(idempotencyKey, res)) return;

  try {
    // 查询助力活动
    const help = await queryOne<any>(
      `SELECT id, initiator_id, status, required_help_count, current_help_count, expires_at
       FROM helps WHERE id = $1`,
      [helpId]
    );

    if (!help) {
      res.json({ code: 404, message: '助力活动不存在', data: null });
      return;
    }

    // R3/R7: 不能给自己助力
    if (help.initiator_id === helperUserId) {
      res.json({ code: 400, message: '不能为自己助力', data: null });
      return;
    }

    // 检查活动状态
    if (help.status === 'completed') {
      res.json({ code: 400, message: '该助力活动已满额', data: null });
      return;
    }

    if (help.status === 'expired') {
      res.json({ code: 400, message: '该助力活动已过期', data: null });
      return;
    }

    // 检查是否过期（双重校验）
    if (help.expires_at && new Date(help.expires_at).toISOString() < new Date().toISOString()) {
      // 自动过期
      await query(`UPDATE helps SET status = 'expired' WHERE id = $1 AND status = 'active'`, [helpId]);
      res.json({ code: 400, message: '该助力活动已过期', data: null });
      return;
    }

    // 检查是否已满
    if ((help.current_help_count || 0) >= (help.required_help_count || 5)) {
      // 自动标记完成
      await query(`UPDATE helps SET status = 'completed' WHERE id = $1 AND status = 'active'`, [helpId]);
      res.json({ code: 400, message: '该助力活动已满额', data: null });
      return;
    }

    // R6（新规则）: 已参与过助力的用户（含发起者和助力者），永久不能再助力别人
    // 用 help_helpers 表查询用户是否曾作为助力者参与过
    const helpedAnywhere = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM help_helpers WHERE user_id = $1`,
      [helperUserId]
    );
    if ((helpedAnywhere?.cnt ?? 0) > 0) {
      res.json({ code: 400, message: '您已经参与过助力，不能再助力别人', data: null });
      return;
    }

    // 检查是否已经为这个发起者助力过（防止重复助力）
    const alreadyHelped = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM help_helpers WHERE user_id = $1 AND help_id IN (SELECT id FROM helps WHERE initiator_id = $2)`,
      [helperUserId, help.initiator_id]
    );
    if ((alreadyHelped?.cnt ?? 0) > 0) {
      res.json({ code: 400, message: '您已经为TA助力过了', data: null });
      return;
    }

    // R6-附: 已发起过助力的用户也不能再助力别人（只能当发起者）
    const hasInitiated = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM helps WHERE initiator_id = $1`,
      [helperUserId]
    );
    if ((hasInitiated?.cnt ?? 0) > 0) {
      res.json({ code: 400, message: '您已经发起过助力，不能再助力别人', data: null });
      return;
    }

    // R5: 同一设备永久最多助力 3 次
    if (deviceId) {
      const deviceHelpCount = await getDeviceHelpCount(deviceId);
      if (deviceHelpCount >= 3) {
        res.json({ code: 400, message: '该设备已达助力上限（3次）', data: null });
        return;
      }
    }

    // ---- 助力成功 ----

    // 更新 current_help_count
    const newCount = (help.current_help_count || 0) + 1;
    const isComplete = newCount >= (help.required_help_count || 5);

    // 构建 UPDATE 语句，有 deviceId 时写入 helper_device_id
    let sql: string;
    let sqlParams: any[];

    if (deviceId) {
      if (isComplete) {
        sql = `UPDATE helps SET current_help_count = $1, status = 'completed', helper_id = $2, helped_at = NOW(), helper_device_id = $3 WHERE id = $4`;
        sqlParams = [newCount, helperUserId, deviceId, helpId];
      } else {
        sql = `UPDATE helps SET current_help_count = $1, helper_id = $2, helped_at = NOW(), helper_device_id = $3 WHERE id = $4 AND current_help_count = $5`;
        sqlParams = [newCount, helperUserId, deviceId, helpId, help.current_help_count];
      }
    } else {
      if (isComplete) {
        sql = `UPDATE helps SET current_help_count = $1, status = 'completed', helper_id = $2, helped_at = NOW() WHERE id = $3`;
        sqlParams = [newCount, helperUserId, helpId];
      } else {
        sql = `UPDATE helps SET current_help_count = $1, helper_id = $2, helped_at = NOW() WHERE id = $3 AND current_help_count = $4`;
        sqlParams = [newCount, helperUserId, helpId, help.current_help_count];
      }
    }

    await query(sql, sqlParams);

    // 将本次助力关系写入 help_helpers 表（用于 R6 校验和记录）
    const helpHelperId = uuidv4();
    await query(
      `INSERT INTO help_helpers (id, help_id, user_id, device_id, helped_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [helpHelperId, helpId, helperUserId, deviceId || null]
    );

    if (isComplete) {
      // 助力完成：给发起者奖励参赛次数
      await issueRaceCountRewardForCompletion(help.initiator_id, helpId);
    }

    // 查询发起者昵称
    const initiator = await queryOne<{ nickname: string }>(
      `SELECT nickname FROM users WHERE id = $1`,
      [help.initiator_id]
    );

    const result = {
      code: 0,
      data: {
        activity: {
          id: help.id,
          currentHelpCount: newCount,
          requiredHelpCount: help.required_help_count || 5,
          helpers: [{ helperNickname: '我', helpedAt: Date.now() }]
        },
        isComplete,
        initiatorName: initiator?.nickname || '玩家'
      }
    };

    // R20: 缓存幂等性结果
    await saveIdempotency(idempotencyKey, result);

    res.json(result);
  } catch (e: any) {
    console.error('[帮助] 助力失败:', e?.message || e);
    res.json({ code: 500, message: '助力失败，请稍后再试', data: null });
  }
});

// ---------- 参赛次数奖励 ----------

/**
 * 助力完成时，给发起者奖励参赛次数（直接加到用户 race_count）
 */
async function issueRaceCountRewardForCompletion(initiatorId: string, helpId: string): Promise<void> {
  try {
    // 读取运营商配置的发起者奖励次数（默认 1）
    const rewardStr = await getSystemConfig('help_initiator_reward_count', '1');
    const rewardCount = parseInt(rewardStr, 10) || 1;

    // 直接给用户加参赛次数
    await query(
      `UPDATE users SET race_count = race_count + $1, updated_at = NOW() WHERE id = $2`,
      [rewardCount, initiatorId]
    );

    console.log(`[帮助] 发起者 ${initiatorId} 助力完成，奖励 ${rewardCount} 次参赛次数`);
  } catch (e: any) {
    console.error('[帮助] 发放发起者奖励失败:', e?.message || e);
  }
}

export default router;
