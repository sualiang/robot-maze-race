import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { getConfigInt } from '../config/utils';
import { authMiddleware } from '../middleware/auth';
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

// 参赛包列表（从数据库取 + 返回关联礼券）
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

      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        salePrice: row.price_cents,
        originalPrice: row.price_cents,
        raceCount: row.race_count,
        validDays: row.valid_days || 365,
        isHot: row.sort_order <= 1,
        isRecommend: row.sort_order <= 2,
        isActive: row.status === 'active',
        coupons: couponList,
        totalRewardValue,
      };
    }));

    // 有礼券信息 + 总价值说明
    result.forEach((pkg: any) => {
      if (pkg.totalRewardValue > 0) {
        const rewardYuan = (pkg.totalRewardValue / 100).toFixed(0);
        pkg.description = pkg.description
          ? `${pkg.description}（赠价值 ¥${rewardYuan} 礼券）`
          : `赠价值 ¥${rewardYuan} 礼券`;
        pkg.tag = '🎁 超值礼券';
        pkg.tagType = 'gift';
      }
    });

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
    await query(
      `INSERT INTO checkins (id, user_id, venue_id, queue_number, status, checked_in_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'queued', datetime('now'), datetime('now'), datetime('now'))`,
      [checkinId, userId, venueId, queueNumber]
    );

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
  try {
    const user = await queryOne<{ nickname: string; phone: string; gender: string }>(
      `SELECT nickname, phone, gender FROM users WHERE id = $1`,
      [userId]
    );
    const needPhone = !user || !user.nickname || !user.phone;
    res.json({
      code: 0,
      data: { needPhone, nickname: user?.nickname || '', phone: user?.phone || '', gender: user?.gender || '' }
    });
  } catch {
    res.json({ code: 0, data: { needPhone: true, nickname: '', phone: '', gender: '' } });
  }
});

/**
 * POST /player/me/profile
 * 更新玩家个人信息（昵称、手机号、头像）
 */
router.post('/me/profile', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { nickname, phone, avatarUrl, gender } = req.body;

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
    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${idx++}`);
      params.push(avatarUrl);
    }
    if (gender !== undefined) {
      updates.push(`gender = $${idx++}`);
      params.push(gender);
    }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
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

// 参赛记录
router.get('/me/race-records', (_req: Request, res: Response) => {
  res.json({
    code: 0,
    data: [
      { id: 'r1', arenaName: '北京主赛场', bestTime: 38.1, rank: 3, createdAt: Date.now() - 86400000 },
      { id: 'r2', arenaName: '上海分赛场', bestTime: 42.5, rank: 5, createdAt: Date.now() - 172800000 }
    ]
  });
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
    // 查询参赛包
    const pkg = await queryOne<{ id: string; name: string; price_cents: number; race_count: number }>(
      `SELECT id, name, price_cents, race_count FROM race_packages WHERE id = $1 AND status = 'active'`,
      [packageId]
    );

    if (!pkg) {
      res.json({ code: 404, message: '参赛包不存在或已下架', data: null });
      return;
    }

    const orderId = uuidv4();
    const orderNo = 'ORD_' + Date.now() + '_' + userId.substring(0, 8);

    // 创建订单
    await query(
      `INSERT INTO orders (id, order_no, user_id, package_id, amount_cents, status, paid_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'paid', datetime('now'), datetime('now'))`,
      [orderId, orderNo, userId, packageId, pkg.price_cents]
    );

    // V2.0: 购买参赛包后发放经验 + 积分（根据参赛包价格档位）
    const expAwardMapping: Record<string, { expKey: string }> = {
      '3900': { expKey: 'season_score_buy_pkg_39' },
      '9900': { expKey: 'season_score_buy_pkg_99' },
      '19900': { expKey: 'season_score_buy_pkg_199' },
    };

    // 根据价格近似匹配档位
    const priceKey = String(pkg.price_cents);
    let expAward = 0;
    if (pkg.price_cents >= 19900) {
      expAward = await getConfigInt('season_score_buy_pkg_199', 700);
    } else if (pkg.price_cents >= 9900) {
      expAward = await getConfigInt('season_score_buy_pkg_99', 300);
    } else {
      expAward = await getConfigInt('season_score_buy_pkg_39', 100);
    }

    if (expAward > 0) {
      await execute(
        `UPDATE users SET exp = COALESCE(exp, 0) + $1, updated_at = datetime('now') WHERE id = $2`,
        [expAward, userId]
      );
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
        finalPrice: pkg.price_cents,
        raceCount: pkg.race_count,
        expAward,
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
      `SELECT value FROM system_config WHERE key = $1`,
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
    // 来源①：查出所有已支付订单
    const orders = await query<any>(
      `SELECT rp.race_count
       FROM orders o
       JOIN race_packages rp ON o.package_id = rp.id
       WHERE o.user_id = $1 AND o.status = 'paid'`,
      [userId]
    );

    const purchasedTotal = (orders || []).reduce(
      (sum: number, o: any) => sum + (o.race_count || 0),
      0
    );

    // 已使用的参赛次数
    const usedRow = await queryOne<{ used: number }>(
      `SELECT COUNT(*) as used FROM checkins WHERE user_id = $1 AND status != 'cancelled'`,
      [userId]
    );
    const used = usedRow?.used ?? 0;

    // 来源②：好友助力奖励的参赛次数（users.race_count）
    const userRow = await queryOne<{ race_count: number }>(
      `SELECT race_count FROM users WHERE id = $1`,
      [userId]
    );
    const bonusRaces = userRow?.race_count ?? 0;

    return purchasedTotal - used + bonusRaces;
  } catch {
    return 0;
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
      `SELECT response FROM idempotency_keys WHERE key = $1`,
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
      `INSERT INTO idempotency_keys (id, key, response, created_at) VALUES ($1, $2, $3, datetime('now'))`,
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
      `SELECT COUNT(*) as cnt FROM helps WHERE initiator_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))`,
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
       VALUES ($1, $2, $3, 0, 'active', datetime('now'), datetime('now', '+' || $4 || ' days'), datetime('now'))`,
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
        await query(`UPDATE helps SET status = 'expired' WHERE id = $1 AND status = 'active' AND expires_at < datetime('now')`, [helpId]);
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
        sql = `UPDATE helps SET current_help_count = $1, status = 'completed', helper_id = $2, helped_at = datetime('now'), helper_device_id = $3 WHERE id = $4`;
        sqlParams = [newCount, helperUserId, deviceId, helpId];
      } else {
        sql = `UPDATE helps SET current_help_count = $1, helper_id = $2, helped_at = datetime('now'), helper_device_id = $3 WHERE id = $4 AND current_help_count = $5`;
        sqlParams = [newCount, helperUserId, deviceId, helpId, help.current_help_count];
      }
    } else {
      if (isComplete) {
        sql = `UPDATE helps SET current_help_count = $1, status = 'completed', helper_id = $2, helped_at = datetime('now') WHERE id = $3`;
        sqlParams = [newCount, helperUserId, helpId];
      } else {
        sql = `UPDATE helps SET current_help_count = $1, helper_id = $2, helped_at = datetime('now') WHERE id = $3 AND current_help_count = $4`;
        sqlParams = [newCount, helperUserId, helpId, help.current_help_count];
      }
    }

    await query(sql, sqlParams);

    // 将本次助力关系写入 help_helpers 表（用于 R6 校验和记录）
    const helpHelperId = uuidv4();
    await query(
      `INSERT INTO help_helpers (id, help_id, user_id, device_id, helped_at)
       VALUES ($1, $2, $3, $4, datetime('now'))`,
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
      `UPDATE users SET race_count = race_count + $1, updated_at = datetime('now') WHERE id = $2`,
      [rewardCount, initiatorId]
    );

    console.log(`[帮助] 发起者 ${initiatorId} 助力完成，奖励 ${rewardCount} 次参赛次数`);
  } catch (e: any) {
    console.error('[帮助] 发放发起者奖励失败:', e?.message || e);
  }
}

export default router;
