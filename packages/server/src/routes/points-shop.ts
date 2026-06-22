import { Router, Request, Response } from 'express';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * GET /api/v1/points-shop/items
 * 列出积分商城可兑换商品
 */
router.get('/points-shop/items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const items = await query<any>(
      `SELECT id, item_type, item_id, name, description, need_points, exchange_limit,
              sort_weight, status, created_at
       FROM point_shop
       WHERE status = 1
       ORDER BY sort_weight ASC, created_at ASC`
    );

    // 同时查询用户积分余额
    const userId = req.user!.userId;
    const userPoints = await queryOne<{ points: number }>(
      `SELECT COALESCE(points, 0) as points FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      code: 0,
      data: {
        items: (items || []).map((item: any) => ({
          id: item.id,
          itemType: item.item_type,
          itemId: item.item_id,
          name: item.name,
          description: item.description,
          needPoints: item.need_points,
          exchangeLimit: item.exchange_limit || 0,
          sortWeight: item.sort_weight || 0,
          status: item.status,
        })),
        userPoints: userPoints?.points || 0,
      },
    });
  } catch (e: any) {
    console.error('[PointsShop] items error:', e?.message || e);
    res.json({ code: 500, message: '查询积分商品失败', data: null });
  }
});

/**
 * POST /api/v1/points-shop/exchange
 * 兑换积分商品
 * @param body.itemId - 商品 ID
 * @returns { data: { exchangeId, itemName, needPoints } }
 */
router.post('/points-shop/exchange', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { itemId } = req.body;

  if (!itemId) {
    res.json({ code: 400, message: '缺少商品ID', data: null });
    return;
  }

  try {
    // 1. 查询商品信息
    const item = await queryOne<any>(
      `SELECT * FROM point_shop WHERE id = $1 AND status = 1`,
      [itemId]
    );

    if (!item) {
      res.json({ code: 404, message: '商品不存在或已下架', data: null });
      return;
    }

    const needPoints = item.need_points;

    // 2. 查询用户积分余额
    const userPoints = await queryOne<{ points: number }>(
      `SELECT COALESCE(points, 0) as points FROM users WHERE id = $1`,
      [userId]
    );

    if (!userPoints || userPoints.points < needPoints) {
      res.json({ code: 400, message: '积分不足', data: null });
      return;
    }

    // 3. 检查兑换限制（exchange_limit > 0 时限制每人兑换次数）
    if (item.exchange_limit && item.exchange_limit > 0) {
      const exchangeCount = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM points_exchange_log WHERE user_id = $1 AND item_id = $2`,
        [userId, itemId]
      );
      if (exchangeCount && exchangeCount.cnt >= item.exchange_limit) {
        res.json({ code: 400, message: `已达兑换上限（${item.exchange_limit}次）`, data: null });
        return;
      }
    }

    // 4. 扣减积分（原子操作）
    await execute(
      `UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1`,
      [needPoints, userId]
    );

    // 5. 根据商品类型发放对应奖励
    const itemType = item.item_type;
    const itemValue = item.item_id; // 对于 entry_deduction 是金额（分），对于 merchant_coupon 也是金额（分）

    if (itemType === 'entry_deduction') {
      // 发放参赛抵扣金到 entry_deductions（id 是 INTEGER 自增主键，传 NULL）
      await execute(
        `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, expires_at, created_at)
         VALUES (NULL, $1, $2, 'point_shop_exchange', 'available', datetime('now', '+365 days'), datetime('now'))`,
        [userId, itemValue]
      );
      console.log('[PointsShop] 兑换参赛抵扣金:', userId, 'item:', item.name, '金额:', itemValue / 100, '元');
    } else if (itemType === 'merchant_coupon') {
      // 发放商家消费券
      const couponId = uuidv4();
      const validEnd = '2070-01-01 00:00:00';
      await execute(
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, extra_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, 11, $11, datetime('now'), datetime('now'))`,
        [
          couponId, userId, couponId, 'platform',
          item.name,
          `积分商城兑换·${item.description || item.name}`, itemValue, 0,
          new Date().toISOString(), validEnd,
          JSON.stringify({ source: 'point_shop', item_id: itemId })
        ]
      );
      console.log('[PointsShop] 兑换商家消费券:', userId, 'item:', item.name, '面额:', itemValue / 100, '元');
    } else if (itemType === 'platform_coupon') {
      // 通用平台券（旧格式兼容）
      const couponId = uuidv4();
      const validEnd = '2070-01-01 00:00:00';
      const couponType = item.item_id || 20;
      await execute(
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, extra_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, $12, datetime('now'), datetime('now'))`,
        [
          couponId, userId, couponId, 'platform',
          item.name,
          `积分商城兑换·${item.description || item.name}`, itemValue, 0,
          new Date().toISOString(), validEnd, couponType,
          JSON.stringify({ source: 'point_shop', item_id: itemId })
        ]
      );
      console.log('[PointsShop] 兑换平台券:', userId, 'item:', item.name, 'coupon_type:', couponType);
    } else {
      // 未知类型，回滚积分
      await execute(
        `UPDATE users SET points = points + $1 WHERE id = $2`,
        [needPoints, userId]
      );
      res.json({ code: 400, message: '不支持的商品类型', data: null });
      return;
    }

    // 6. 记录兑换日志
    const exchangeId = uuidv4();
    try {
      // 先尝试创建兑换日志表（如不存在）
      await execute(
        `CREATE TABLE IF NOT EXISTS points_exchange_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_type TEXT NOT NULL,
          item_name TEXT NOT NULL,
          spent_points INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      );
    } catch {
      // ignore
    }
    try {
      await execute(
        `INSERT INTO points_exchange_log (id, user_id, item_id, item_type, item_name, spent_points)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [exchangeId, userId, itemId, itemType, item.name, needPoints]
      );
    } catch {
      // ignore
    }

    // 7. 记积分流水
    try {
      const txnId = uuidv4();
      await execute(
        `INSERT INTO points_transactions (id, user_id, points, type, remark)
         VALUES ($1, $2, $3, 'point_shop_exchange', $4)`,
        [txnId, userId, -needPoints, `积分商城兑换·${item.name}`]
      );
    } catch {
      // ignore
    }

    res.json({
      code: 0,
      data: {
        exchangeId,
        itemName: item.name,
        itemType,
        needPoints,
      },
    });
  } catch (e: any) {
    console.error('[PointsShop] exchange error:', e?.message || e);
    // 尝试回滚积分
    try {
      const item = await queryOne<any>(
        `SELECT need_points FROM point_shop WHERE id = $1`,
        [req.body.itemId]
      );
      if (item) {
        await execute(
          `UPDATE users SET points = points + $1 WHERE id = $2`,
          [item.need_points, req.body.userId]
        );
      }
    } catch {
      // ignore rollback failure
    }
    res.json({ code: 500, message: '兑换失败，积分已返还', data: null });
  }
});

/**
 * GET /api/v1/points-shop/history
 * 查询用户兑换历史
 */
router.get('/points-shop/history', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const logs = await query<any>(
      `SELECT id, item_id, item_type, item_name, spent_points, created_at
       FROM points_exchange_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      code: 0,
      data: {
        list: (logs || []).map((log: any) => ({
          id: log.id,
          itemId: log.item_id,
          itemType: log.item_type,
          itemName: log.item_name,
          spentPoints: log.spent_points,
          createdAt: log.created_at,
        })),
      },
    });
  } catch (e: any) {
    console.error('[PointsShop] history error:', e?.message || e);
    res.json({ code: 500, message: '查询兑换历史失败', data: null });
  }
});

export default router;
