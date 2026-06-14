import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../config/database';
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

// 参赛包列表
router.get('/packages', (_req: Request, res: Response) => {
  res.json({
    code: 0,
    data: [
      { id: 'pkg_01', name: '单次体验包', originalPrice: 4900, salePrice: 2900, description: '1次参赛机会', isActive: true },
      { id: 'pkg_02', name: '青铜勇士包', originalPrice: 9900, salePrice: 7900, description: '3次参赛机会', isActive: true },
      { id: 'pkg_03', name: '白银战士包', originalPrice: 19900, salePrice: 14900, description: '8次参赛机会', isActive: true },
      { id: 'pkg_04', name: '黄金大师包', originalPrice: 29900, salePrice: 22900, description: '15次参赛机会+专属排行榜', isActive: true }
    ]
  });
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

// 签到状态
router.get('/checkin/current', (_req: Request, res: Response) => {
  res.json({ code: 0, data: null });
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

    const couponRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM expand_coupons WHERE user_id = $1 AND status = 'active' AND valid_until > datetime('now')`,
      [userId]
    );
    const couponCount = couponRow?.cnt || 0;

    res.json({
      code: 0,
      data: { raceCount: remainingRaces, helpCount, couponCount }
    });
  } catch (e: any) {
    res.json({ code: 0, data: { raceCount: 0, helpCount: 0, couponCount: 0 } });
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

// 膨胀券列表（个人中心的"我的优惠券"）
router.get('/me/coupons', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const rows = await query<any>(
      `SELECT id, amount_cents, status, valid_from, valid_until, used_at, created_at
       FROM expand_coupons WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    const coupons = rows.map((r: any) => ({
      id: r.id,
      name: '助力膨胀券',
      discount: r.amount_cents,
      minAmount: 0,
      status: r.status,
      validFrom: r.valid_from ? new Date(r.valid_from).getTime() : null,
      expireAt: r.valid_until ? new Date(r.valid_until).getTime() : null,
      usedAt: r.used_at ? new Date(r.used_at).getTime() : null,
      createdAt: new Date(r.created_at).getTime(),
    }));

    res.json({ code: 0, data: coupons });
  } catch (e: any) {
    console.error('[优惠券] 查询失败:', e?.message || e);
    res.json({ code: 0, data: [] });
  }
});

/**
 * POST /player/orders
 * 购买参赛包（含膨胀券自动核销逻辑）
 *
 * 核销规则：
 *   - 用户可用膨胀券中取 bonus_count 最大的一张
 *   - 自动核销（status='used'）
 *   - 参赛次数 = 参赛包原始次数 + 膨胀券加成次数
 *   - 一次只能用 1 张
 *   - 膨胀券加成次数由运营商后台设置（expand_coupon_helper_gift_count）
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

    // 查询用户可用的膨胀券（有效期内、未使用的），取 bonus_count 最大的一张
    const coupon = await queryOne<{ id: string; bonus_count: number }>(
      `SELECT id, bonus_count FROM expand_coupons
       WHERE user_id = $1 AND status = 'active' AND valid_until > datetime('now')
       ORDER BY bonus_count DESC LIMIT 1`,
      [userId]
    );

    let usedCouponId: string | null = null;
    let couponBonusCount = 0;

    if (coupon) {
      usedCouponId = coupon.id;
      couponBonusCount = coupon.bonus_count;
    }

    // 最终获得的参赛次数 = 参赛包原始次数 + 膨胀券加成次数
    const actualRaceCount = pkg.race_count + couponBonusCount;

    const orderId = uuidv4();
    const orderNo = 'ORD_' + Date.now() + '_' + userId.substring(0, 8);

    // 创建订单（原价不变，coupon_multiplier 用于记录加成次数）
    await query(
      `INSERT INTO orders (id, order_no, user_id, package_id, amount_cents, status, coupon_multiplier, paid_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'paid', $6, datetime('now'), datetime('now'))`,
      [orderId, orderNo, userId, packageId, pkg.price_cents, couponBonusCount + 1]
    );

    // 核销膨胀券
    if (usedCouponId) {
      await query(
        `UPDATE expand_coupons SET status = 'used', used_order_id = $1, used_at = datetime('now') WHERE id = $2 AND status = 'active'`,
        [orderId, usedCouponId]
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
        couponBonusCount,
        raceCount: actualRaceCount,
        hasUsedCoupon: !!usedCouponId,
        usedCouponId,
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
// 规则清单（参照需求文档 V5.1）：
//
// 发起资格：
//   R1. 必须已购买过参赛包（有订单记录）
//   R2. 剩余参赛次数必须为 0
//   R3. 不能给自己助力
//
// 助力者资格：
//   R4. 必须已微信登录（authMiddleware 强制）
//   R5. 同一设备（deviceId）永久最多助力 3 次
//   R6. 同一用户永久最多为 1 人助力
//   R7. 不能对自己的活动助力
//
// 助力活动：
//   R8. 助力人数默认 5 人（从 system_config 读取）
//   R9. 活动有效期写入 helps 表
//   R10. 助力完成后自动发放膨胀券（valid_until = 当前时间 + 15天，从 system_config 读取）
//   R11. 膨胀券一次性使用，购买参赛包时自动核销
//
// 数据源：
//   - helps 表：持久化存储助力活动
//   - expand_coupons 表：持久化存储膨胀券
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
 * 来源 ① 购包次数（orders + race_packages × coupon_multiplier 减去已使用 checkins）
 * 来源 ② 好友助力完成的 race_count 奖励（存入 users.race_count）
 *
 * 膨胀券翻倍逻辑：
 *   用户购买参赛包时若有可用膨胀券，coupon_multiplier=2（次数翻倍）
 *   买30元/3次的包 × 2 = 获得6次参赛机会
 *
 * race_count 同步：由 issueRaceCountRewardForCompletion 写入，本函数一起统计
 */
async function getUserRemainingRaces(userId: string): Promise<number> {
  try {
    // 来源①：查出所有已支付订单及其翻倍倍数
    const orders = await query<any>(
      `SELECT o.coupon_multiplier, rp.race_count
       FROM orders o
       JOIN race_packages rp ON o.package_id = rp.id
       WHERE o.user_id = $1 AND o.status = 'paid'`,
      [userId]
    );

    const purchasedTotal = (orders || []).reduce(
      (sum: number, o: any) => sum + (o.race_count || 0) * (o.coupon_multiplier || 1),
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
      `SELECT COUNT(*) as cnt FROM helps WHERE helper_device_id = $1`,
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
        canHelp: hasPurchased && remainingRaces <= 0 && activeHelpCount === 0,
        hasPurchased,
        remainingRaces,
        activeHelpCount,
        reason: !hasPurchased
          ? '请先购买参赛包'
          : remainingRaces > 0
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

  // R1: 必须已购买过参赛包
  const hasPurchased = await hasPurchasedPackage(userId);
  if (!hasPurchased) {
    const result = { code: 400, message: '请先购买参赛包后再发起助力', data: null };
    await saveIdempotency(idempotencyKey, result);
    res.json(result);
    return;
  }

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

  // 读取膨胀券有效期（默认 15 天）
  const couponValidDaysStr = await getSystemConfig('expand_coupon_valid_days', '15');
  const couponValidDays = parseInt(couponValidDaysStr, 10) || 15;

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
      status: 'active',
      couponValidDays
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

    // R6: 同一用户永久最多为 1 人助力
    const helpedInitiatorCount = await getUserHelpedInitiatorCount(helperUserId);
    if (helpedInitiatorCount >= 1) {
      // 检查是否已经为这个发起者助力过（如果是，允许；如果是新的发起者，拒绝）
      const alreadyHelpedThis = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM helps WHERE helper_id = $1 AND initiator_id = $2`,
        [helperUserId, help.initiator_id]
      );
      if ((alreadyHelpedThis?.cnt ?? 0) === 0) {
        res.json({ code: 400, message: '您已经为其他好友助力过，每人只能助力一次', data: null });
        return;
      }
    }

    // 检查是否已经为这个发起者助力过（防止重复助力）
    const alreadyHelped = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM helps WHERE helper_id = $1 AND initiator_id = $2`,
      [helperUserId, help.initiator_id]
    );
    if ((alreadyHelped?.cnt ?? 0) > 0) {
      res.json({ code: 400, message: '您已经为TA助力过了', data: null });
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

    if (isComplete) {
      // R10: 发放膨胀券给发起者（助力完成奖励）
      await issueRaceCountRewardForCompletion(help.initiator_id, helpId);

      // R10: 发放膨胀券给助力者
      await issueExpandCouponForHelper(helperUserId, helpId);
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
 * 助力完成时，给发起者奖励参赛次数（直接加到用户 race_count，非膨胀券）
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

/**
 * 助力成功后，给助力者奖励参赛次数
 */
async function issueExpandCouponForHelper(helperUserId: string, helpId: string): Promise<void> {
  try {
    // 读取运营商配置的助力者膨胀券赠送次数（默认 1）
    const giftStr = await getSystemConfig('expand_coupon_helper_gift_count', '1');
    const giftCount = parseInt(giftStr, 10) || 1;

    // 读取膨胀券有效期（默认 15 天）
    const validDaysStr = await getSystemConfig('expand_coupon_valid_days', '15');
    const validDays = parseInt(validDaysStr, 10) || 15;

    // 创建膨胀券（bonus_count = 额外增加的参赛次数）
    const couponId = uuidv4();
    await query(
      `INSERT INTO expand_coupons (id, user_id, help_id, bonus_count, status, valid_from, valid_until, created_at)
       VALUES ($1, $2, $3, $4, 'active', datetime('now'), datetime('now', '+' || $5 || ' days'), datetime('now'))`,
      [couponId, helperUserId, helpId, giftCount, validDays]
    );

    console.log(`[帮助] 助力者 ${helperUserId} 助力成功，发放膨胀券 ${couponId}（加${giftCount}次）`);
  } catch (e: any) {
    console.error('[帮助] 发放助力者膨胀券失败:', e?.message || e);
  }
}

export default router;
