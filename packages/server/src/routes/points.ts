import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { getConfigInt } from '../config/utils';

const router = Router();

// ============================================================
// 简单内存锁防止超发
// ============================================================
const drawLocks = new Map<string, boolean>();

/**
 * GET /api/v1/points/balance
 * 获取用户当前积分余额
 */
router.get('/balance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await queryOne<{ points: number }>(
      `SELECT points FROM users WHERE id = $1`,
      [req.user!.userId]
    );
    res.json({ code: 0, data: { points: user?.points || 0 } });
  } catch (e: any) {
    res.json({ code: 500, message: '查询积分失败', data: null });
  }
});

/**
 * GET /api/v1/points/lottery/config
 * 获取抽奖配置
 */
router.get('/lottery/config', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const lotteryCost = await getConfigInt('season_lottery_cost', 100);
    res.json({ code: 0, data: { costPerDraw: lotteryCost, maxDrawCount: 10 } });
  } catch (e: any) {
    res.json({ code: 500, message: '获取配置失败', data: null });
  }
});

/**
 * GET /api/v1/points/lottery/history
 * 获取抽奖历史记录
 */
router.get('/lottery/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const records = await query<any>(
      `SELECT * FROM lottery_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user!.userId]
    );
    res.json({ code: 0, data: records || [] });
  } catch (e: any) {
    res.json({ code: 500, message: '查询记录失败', data: null });
  }
});

/**
 * POST /api/v1/points/lottery/draw
 * 积分抽奖
 * 参数: draw_count (抽奖次数，默认1)
 * 返回: Table 12 字段
 */
router.post('/lottery/draw', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { draw_count = 1 } = req.body;
  const drawCount = Math.min(Math.max(parseInt(draw_count, 10) || 1, 1), 10); // 一次最多10连抽

  // 分布式锁（简单实现）
  const lockKey = `draw:${userId}`;
  if (drawLocks.get(lockKey)) {
    res.json({ code: 400, message: '抽奖进行中，请勿重复操作', data: null });
    return;
  }
  drawLocks.set(lockKey, true);

  try {
    // 读取单次抽奖所需积分
    const lotteryCost = await getConfigInt('season_lottery_cost', 100);
    const totalCost = lotteryCost * drawCount;

    // 查询用户当前积分
    const user = await queryOne<{ points: number }>(
      `SELECT points FROM users WHERE id = $1`,
      [userId]
    );

    const userPoints = user?.points || 0;
    if (userPoints < totalCost) {
      res.json({
        code: 400,
        message: `积分不足，需要 ${totalCost} 积分，当前 ${userPoints} 积分`,
        data: null
      });
      return;
    }

    // 查询可用奖品列表
    const prizes = await query<any>(
      `SELECT * FROM lottery_prizes
       WHERE status = 1 AND remain_count > 0
       ORDER BY sort_order ASC, weight DESC`,
      [userId]  // 不需要userId参数但这个函数签名不需要
    );

    const prizeList = prizes as any[] || [];

    // 执行抽奖
    const results: any[] = [];
    let totalWinCost = 0;

    for (let i = 0; i < drawCount; i++) {
      const result = await doDraw(userId, prizeList, lotteryCost);
      results.push(result);
      if (result.record) {
        totalWinCost += lotteryCost;
      }
    }

    // 扣除积分
    await execute(
      `UPDATE users SET points = points - $1, updated_at = datetime('now') WHERE id = $2`,
      [totalCost, userId]
    );

    // 记录积分支出流水
    await execute(
      `INSERT INTO points_transactions (id, user_id, points, type, remark, created_at)
       VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
      [uuidv4(), userId, -totalCost, 'lottery', `抽奖${drawCount}次`]
    );

    // 查询剩余积分
    const updatedUser = await queryOne<{ points: number }>(
      `SELECT points FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      code: 0,
      data: {
        results,
        totalCost,
        remainingPoints: updatedUser?.points || 0,
      }
    });
  } catch (e: any) {
    console.error('[积分] 抽奖失败:', e?.message || e);
    res.json({ code: 500, message: '抽奖失败，请稍后再试', data: null });
  } finally {
    drawLocks.delete(lockKey);
  }
});

/**
 * 单次抽奖逻辑
 */
async function doDraw(
  userId: string,
  prizes: any[],
  lotteryCost: number
): Promise<any> {
  const recordId = uuidv4();

  if (prizes.length === 0) {
    // 没有可用奖品，返回未中奖
    await execute(
      `INSERT INTO lottery_records (id, user_id, prize_id, prize_name, points_cost, is_win, created_at)
       VALUES ($1, $2, NULL, '未中奖', $3, 0, datetime('now'))`,
      [recordId, userId, lotteryCost]
    );
    return {
      isWin: false,
      prizeName: '未中奖',
      recordId,
    };
  }

  // 计算总权重
  const totalWeight = prizes.reduce((sum: number, p: any) => sum + (p.weight || 1), 0);
  let roll = Math.random() * totalWeight;

  let selectedPrize: any = null;
  for (const prize of prizes) {
    roll -= (prize.weight || 1);
    if (roll <= 0) {
      selectedPrize = prize;
      break;
    }
  }

  if (!selectedPrize) {
    selectedPrize = prizes[prizes.length - 1];
  }

  // 减库存（防超发）
  const updateResult = await execute(
    `UPDATE lottery_prizes SET remain_count = remain_count - 1
     WHERE id = $1 AND remain_count > 0`,
    [selectedPrize.id]
  );

  const isWin = (updateResult?.changes || 0) > 0;

  if (isWin) {
    await execute(
      `INSERT INTO lottery_records (id, user_id, prize_id, prize_name, points_cost, is_win, created_at)
       VALUES ($1, $2, $3, $4, $5, 1, datetime('now'))`,
      [recordId, userId, selectedPrize.id, selectedPrize.name, lotteryCost]
    );
  } else {
    // 库存已空
    await execute(
      `INSERT INTO lottery_records (id, user_id, prize_id, prize_name, points_cost, is_win, created_at)
       VALUES ($1, $2, NULL, '未中奖', $3, 0, datetime('now'))`,
      [recordId, userId, lotteryCost]
    );
  }

  return {
    isWin,
    prizeId: isWin ? selectedPrize.id : null,
    prizeName: isWin ? selectedPrize.name : '未中奖',
    prizeImageUrl: isWin ? (selectedPrize.image_url || '') : '',
    recordId,
  };
}

// ============================================================
// 积分商城
// ============================================================

/**
 * 从数据库/系统配置获取积分兑换商品列表
 * 优先从 exchange_items 表读取，降级读 system_config
 */
async function getExchangeItems(): Promise<any[]> {
  try {
    // 先尝试从 exchange_items 表读取（如果存在）
    const items = await query<any>(
      `SELECT * FROM exchange_items WHERE status = 1 ORDER BY sort_order ASC, id ASC`
    );
    if (items && items.length > 0) {
      return items.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        category: item.category || 1,
        pointsCost: item.points_cost || 0,
        icon: item.icon || '',
        stock: item.stock || 0,
      }));
    }
  } catch {
    // 表不存在，降级处理
  }

  // 降级: 从 system_config 读取 JSON 配置
  try {
    const configRow = await queryOne<{ value: string }>(
      `SELECT value FROM system_config WHERE key = $1`,
      ['exchange_mall_items']
    );
    if (configRow && configRow.value) {
      return JSON.parse(configRow.value);
    }
  } catch {
    // 降级到默认配置
  }

  // 最终降级: 返回默认商品列表
  return [
    {
      id: 'item-1',
      name: '参赛抵扣券',
      description: '兑换后可抵扣一次参赛费用',
      category: 1,
      pointsCost: 100,
      icon: '🎫',
      stock: 999,
    },
    {
      id: 'item-2',
      name: '到店满减券',
      description: '到店消费满额立减',
      category: 2,
      pointsCost: 200,
      icon: '💰',
      stock: 999,
    },
    {
      id: 'item-3',
      name: '实物兑换 — 限定徽章',
      description: '铁甲快狗限定实物徽章',
      category: 3,
      pointsCost: 500,
      icon: '🏅',
      stock: 100,
    },
    {
      id: 'item-4',
      name: '铁甲快狗周边 T恤',
      description: '限量版主题 T恤',
      category: 4,
      pointsCost: 1000,
      icon: '👕',
      stock: 50,
    },
  ];
}

/**
 * GET /api/v1/points/mall/items
 * 积分兑换商品列表
 */
router.get('/mall/items', async (_req: Request, res: Response) => {
  try {
    const items = await getExchangeItems();
    res.json({ code: 0, data: items });
  } catch (e: any) {
    console.error('[Points] mall/items error:', e?.message || e);
    res.json({ code: 500, message: '获取商品列表失败', data: null });
  }
});

/**
 * POST /api/v1/points/mall/exchange
 * 积分兑换接口
 * body: { itemId }
 */
router.post('/mall/exchange', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { itemId } = req.body;

  if (!itemId) {
    res.json({ code: 400, message: '缺少商品ID', data: null });
    return;
  }

  try {
    // 查找商品
    const items = await getExchangeItems();
    const item = items.find((i: any) => i.id === itemId);

    if (!item) {
      res.json({ code: 404, message: '商品不存在', data: null });
      return;
    }

    if (item.stock !== undefined && item.stock <= 0) {
      res.json({ code: 400, message: '商品库存不足', data: null });
      return;
    }

    // 查询用户积分
    const user = await queryOne<{ points: number }>(
      `SELECT points FROM users WHERE id = $1`,
      [userId]
    );

    const userPoints = user?.points || 0;
    if (userPoints < item.pointsCost) {
      res.json({
        code: 400,
        message: `积分不足，需要 ${item.pointsCost} 积分，当前 ${userPoints} 积分`,
        data: null,
      });
      return;
    }

    // 扣减积分
    await execute(
      `UPDATE users SET points = points - $1, updated_at = datetime('now') WHERE id = $2`,
      [item.pointsCost, userId]
    );

    // 记录积分流水
    const txId = uuidv4();
    await execute(
      `INSERT INTO points_transactions (id, user_id, points, type, remark, created_at)
       VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
      [txId, userId, -item.pointsCost, 'exchange', `兑换 ${item.name}`]
    );

    // 根据分类发放对应券
    let exchangeResult: any = { exchangeId: txId };

    if (item.category === 1) {
      // 参赛抵扣 → 发放参赛抵扣券
      const couponId = uuidv4();
      await execute(
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, datetime('now'), datetime('now'))`,
        [couponId, userId, itemId, 'exchange_mall', item.name, item.description,
         0, 0, 1,
         new Date().toISOString(),
         new Date(Date.now() + 30 * 86400000).toISOString(),
         1]
      );
      exchangeResult.couponId = couponId;
    } else if (item.category === 2) {
      // 到店满减券
      const couponId = uuidv4();
      await execute(
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, datetime('now'), datetime('now'))`,
        [couponId, userId, itemId, 'exchange_mall', item.name, item.description,
         item.pointsCost * 10, 0, 1,
         new Date().toISOString(),
         new Date(Date.now() + 30 * 86400000).toISOString(),
         2]
      );
      exchangeResult.couponId = couponId;
    } else if (item.category === 3) {
      // 实物兑换 → 创建兑换记录
      try {
        await execute(
          `INSERT INTO ticket_redemptions (id, user_id, item_name, item_type, points_cost, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
          [uuidv4(), userId, item.name, 'product', item.pointsCost, 'pending']
        );
      } catch {
        // ticket_redemptions 表可能不存在
      }
      exchangeResult.isPhysicalGood = true;
      exchangeResult.status = 'pending';
    } else if (item.category === 4) {
      // 周边礼品 → 同实物兑换逻辑
      try {
        await execute(
          `INSERT INTO ticket_redemptions (id, user_id, item_name, item_type, points_cost, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
          [uuidv4(), userId, item.name, 'gift', item.pointsCost, 'pending']
        );
      } catch {
        // 表不存在
      }
      exchangeResult.isPhysicalGood = true;
      exchangeResult.status = 'pending';
    }

    // 查询剩余积分
    const updatedUser = await queryOne<{ points: number }>(
      `SELECT points FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      code: 0,
      data: {
        success: true,
        itemName: item.name,
        pointsCost: item.pointsCost,
        remainingPoints: updatedUser?.points || 0,
        ...exchangeResult,
      },
    });
  } catch (e: any) {
    console.error('[Points] mall/exchange error:', e?.message || e);
    res.json({ code: 500, message: '兑换失败，请稍后再试', data: null });
  }
});

export default router;
