import { Router, Request, Response } from 'express';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ============================================================
// 辅助：仅运营商/admin可操作
// ============================================================
function operatorOnly(req: Request, res: Response, next: Function): void {
  if (req.user?.role !== 'operator' && req.user?.role !== 'admin') {
    res.status(403).json({ code: 403, message: '仅运营商可操作', data: null });
    return;
  }
  next();
}

/**
 * GET /api/v1/points-shop/items
 * 列出积分商城可兑换商品（玩家端，仅上架商品）
 */
router.get('/points-shop/items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const items = await queryOp<any>(req, 
      `SELECT id, item_type, item_id, name, description, image, need_points, face_value, stock, exchange_limit,
              sort_weight, status, created_at
       FROM point_shop
       WHERE status = 1
       ORDER BY sort_weight ASC, created_at ASC`
    );

    // 同时查询用户积分余额
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
          image: item.image ? (item.image.startsWith('/uploads/') ? `${process.env.SITE_URL || 'https://dog.amberrobot.com.cn'}${item.image}` : item.image) : '',
          needPoints: item.need_points,
          faceValue: item.face_value || 0,
          exchangeLimit: item.exchange_limit || 0,
          sortWeight: item.sort_weight || 0,
          status: item.status,
          stock: item.stock || 0,
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
 * GET /api/v1/points-shop/items/all
 * 获取全部商品（含下架）（运营后台使用）
 * ⚠️ 放在 /items/:id 之前避免 all 被当作 id 捕获
 */
router.get('/points-shop/items/all', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const items = await queryOp<any>(req, 
      `SELECT id, item_type, item_id, name, description, need_points, stock, sort_weight, status, created_at, updated_at
       FROM point_shop
       ORDER BY sort_weight ASC, created_at ASC`
    );
    res.json({
      code: 0,
      data: (items || []).map((item: any) => ({
        id: item.id,
        itemType: item.item_type,
        itemId: item.item_id,
        name: item.name,
        description: item.description,
        image: item.image || '',
        needPoints: item.need_points,
        sortWeight: item.sort_weight || 0,
        status: item.status,
        stock: item.stock || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }))
    });
  } catch (error: any) {
    console.error('[PointsShop] list all error:', error.message);
    res.status(500).json({ code: 500, message: '获取商品列表失败', data: null });
  }
});

/**
 * POST /api/v1/points-shop/items
 * 新建积分商品（运营后台）
 */
router.post('/points-shop/items', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { name, itemType, itemId, description, needPoints, faceValue, sortWeight, stock, image } = req.body;
    if (!name || !itemType || !needPoints) {
      return res.status(400).json({ code: 400, message: 'name, itemType, needPoints 不能为空', data: null });
    }
    // 禁止创建商家消费券类型
    if (itemType === 'merchant_coupon') {
      return res.status(400).json({ code: 400, message: '不支持创建商家消费券类型', data: null });
    }
    const id = uuidv4();
    await executeOp(req, 
      `INSERT INTO point_shop (id, item_type, item_id, name, description, need_points, face_value, sort_weight, stock, image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, itemType, itemId || '', name, description || '', needPoints, faceValue || 0, sortWeight || 0, stock ?? 0, image || '']
    );
    res.status(201).json({ code: 0, message: '商品已创建', data: { id } });
  } catch (error: any) {
    console.error('[PointsShop] create error:', error.message);
    res.status(500).json({ code: 500, message: '创建商品失败', data: null });
  }
});

/**
 * PUT /api/v1/points-shop/items/:id
 * 更新积分商品（运营后台）
 */
router.put('/points-shop/items/:id', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, itemType, itemId, description, needPoints, faceValue, sortWeight, status, stock, image } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (itemType !== undefined) {
      if (itemType === 'merchant_coupon') {
        return res.status(400).json({ code: 400, message: '不支持设置为商家消费券类型', data: null });
      }
      updates.push(`item_type = $${idx++}`); params.push(itemType);
    }
    if (itemId !== undefined) { updates.push(`item_id = $${idx++}`); params.push(String(itemId)); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (needPoints !== undefined) { updates.push(`need_points = $${idx++}`); params.push(needPoints); }
    if (faceValue !== undefined) { updates.push(`face_value = $${idx++}`); params.push(faceValue); }
    if (sortWeight !== undefined) { updates.push(`sort_weight = $${idx++}`); params.push(sortWeight); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
    if (stock !== undefined) { updates.push(`stock = $${idx++}`); params.push(stock); }
    if (image !== undefined) { updates.push(`image = $${idx++}`); params.push(image); }

    if (updates.length === 0) {
      return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);
    await executeOp(req, 
      `UPDATE point_shop SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );
    res.json({ code: 0, message: '商品已更新', data: null });
  } catch (error: any) {
    console.error('[PointsShop] update error:', error.message);
    res.status(500).json({ code: 500, message: '更新商品失败', data: null });
  }
});

/**
 * DELETE /api/v1/points-shop/items/:id
 * 删除积分商品（运营后台）
 */
router.delete('/points-shop/items/:id', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check record exists
    const existing = await queryOpOne<{ id: string }>(req, 
      'SELECT id FROM point_shop WHERE id = $1', [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '商品不存在', data: null });
    }

    await executeOp(req, 'DELETE FROM point_shop WHERE id = $1', [id]);
    res.json({ code: 0, message: '商品已删除', data: null });
  } catch (error: any) {
    console.error('[PointsShop] delete error:', error.message);
    res.status(500).json({ code: 500, message: '删除商品失败', data: null });
  }
});

/**
 * POST /api/v1/points-shop/exchange
 * 兑换积分商品
 * @param body.itemId - 商品 ID
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
    const item = await queryOpOne<any>(req, 
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
      const exchangeCount = await queryOpOne<{ cnt: number }>(req, 
        `SELECT COUNT(*) as cnt FROM points_exchange_log WHERE user_id = $1 AND item_id = $2`,
        [userId, itemId]
      );
      if (exchangeCount && exchangeCount.cnt >= item.exchange_limit) {
        res.json({ code: 400, message: `已达兑换上限（${item.exchange_limit}次）`, data: null });
        return;
      }
    }

    // 3b. 校验库存并原子扣减
    if (item.stock !== undefined) {
      if (item.stock === 0) {
        res.json({ code: 400, message: '库存不足', data: null });
        return;
      }
      const stockResult = await executeOp(req, 
        `UPDATE point_shop SET stock = stock - 1 WHERE id = $1 AND stock > 0`,
        [itemId]
      );
      if (stockResult.changes === 0) {
        res.json({ code: 400, message: '库存不足', data: null });
        return;
      }
    }

    // 4. 扣减积分（原子操作，按运营商隔离）
    const opId = (req.user as any)?.operatorId || '';
    await executeOp(req,
      `INSERT INTO points_transactions (id, user_id, operator_id, points, type, remark, created_at)
       VALUES ($1, $2, $3, $4, 'point_shop_exchange', $5, NOW())`,
      [uuidv4(), userId, opId, -needPoints, `积分商城兑换·${item.name}`]
    );

    // 5. 根据商品类型发放对应奖励
    const itemType = item.item_type;
    const itemValue = item.item_id; // 对于 entry_deduction 是金额（分），对于 merchant_coupon 也是金额（分）

    if (itemType === 'entry_deduction') {
      // 发放参赛抵扣金到 entry_deductions（id 是 INTEGER 自增主键，传 NULL）
      await executeOp(req, 
        `INSERT INTO entry_deductions (id, user_id, amount_cents, source, status, expires_at, created_at)
         VALUES (NULL, $1, $2, 'point_shop_exchange', 'available', DATE_ADD(NOW(), INTERVAL 365 DAY), NOW())`,
        [userId, itemValue]
      );
      console.log('[PointsShop] 兑换参赛抵扣金:', userId, 'item:', item.name, '金额:', itemValue / 100, '元');
    } else if (itemType === 'merchant_coupon') {
      // 发放商家消费券
      const couponId = uuidv4();
      const validEnd = '2070-01-01 00:00:00';
      await executeOp(req, 
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, extra_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, 11, $11, NOW(), NOW())`,
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
      await executeOp(req, 
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, extra_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, $12, NOW(), NOW())`,
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
      // 未知类型，回滚积分（按运营商隔离）
      const opId2 = (req.user as any)?.operatorId || '';
      await executeOp(req,
        `INSERT INTO points_transactions (id, user_id, operator_id, points, type, remark, created_at)
         VALUES ($1, $2, $3, $4, 'refund', $5, NOW())`,
        [uuidv4(), userId, opId2, needPoints, `不支持的商品类型退款·${item.name}`]
      );
      res.json({ code: 400, message: '不支持的商品类型', data: null });
      return;
    }

    // 6. 记录兑换日志
    const exchangeId = uuidv4();
    try {
      await executeOp(req,
        `CREATE TABLE IF NOT EXISTS points_exchange_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_type TEXT NOT NULL,
          item_name TEXT NOT NULL,
          spent_points INTEGER NOT NULL,
          created_at TEXT DEFAULT (NOW())
        )`
      );
    } catch { /* ignore */ }
    try {
      await executeOp(req, 
        `INSERT INTO points_exchange_log (id, user_id, item_id, item_type, item_name, spent_points)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [exchangeId, userId, itemId, itemType, item.name, needPoints]
      );
    } catch { /* ignore */ }

    res.json({
      code: 0,
      data: { exchangeId, itemName: item.name, itemType, needPoints },
    });
  } catch (e: any) {
    console.error('[PointsShop] exchange error:', e?.message || e);
    // 尝试回滚积分
    try {
      const opId = (req.user as any)?.operatorId || '';
      const item = await queryOpOne<any>(req, `SELECT need_points FROM point_shop WHERE id = $1`, [itemId]);
      if (item) {
        await executeOp(req,
          `INSERT INTO points_transactions (id, user_id, operator_id, points, type, remark, created_at)
           VALUES ($1, $2, $3, $4, 'refund', $5, NOW())`,
          [uuidv4(), userId, opId, item.need_points, `兑换失败退款·${item.name || ''}`]
        );
      }
      // 回滚库存（+1）
      await executeOp(req, `UPDATE point_shop SET stock = stock + 1 WHERE id = $1`, [itemId]);
    } catch { /* ignore rollback failure */ }
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
    const logs = await queryOp<any>(req, 
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
