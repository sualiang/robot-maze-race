import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// 奖品池管理 API (adminMiddleware)
// ============================================================
function adminMiddleware(req: Request, res: Response, next: Function): void {
  const permissions = req.user?.permissions;
  if (!permissions || (!permissions.includes('*') && !permissions.includes('marketing:read'))) {
    res.status(403).json({ code: 403, message: '权限不足', data: null });
    return;
  }
  next();
}

/**
 * GET /api/v1/admin/prize/list
 * 奖品列表
 */
router.get('/prize/list', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const prizes = await query<any>(
      `SELECT * FROM lottery_prizes ORDER BY sort_order ASC, created_at DESC`
    );

    res.json({
      code: 0,
      data: {
        list: (prizes || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          imageUrl: p.image_url || '',
          prizeType: p.prize_type || 1,
          prizeValue: p.prize_value || '',
          totalCount: p.total_count || 0,
          remainCount: p.remain_count || 0,
          probability: p.probability || 0,
          weight: p.weight || 1,
          status: p.status || 1,
          sortOrder: p.sort_order || 0,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        }))
      }
    });
  } catch (e: any) {
    console.error('[AdminPrize] list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/admin/prize/prize
 * 新增奖品
 */
router.post('/prize', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { name, imageUrl, prizeType, prizeValue, totalCount, probability, weight, sortOrder } = req.body;

  if (!name) {
    res.json({ code: 400, message: '奖品名称不能为空', data: null });
    return;
  }

  try {
    const id = uuidv4();
    const remainCount = totalCount || 0;
    await execute(
      `INSERT INTO lottery_prizes (id, name, image_url, prize_type, prize_value, total_count, remain_count, probability, weight, status, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, datetime('now'), datetime('now'))`,
      [
        id,
        name,
        imageUrl || '',
        prizeType || 1,
        prizeValue || '',
        totalCount || 0,
        remainCount,
        probability || 0,
        weight || 1,
        sortOrder || 0,
      ]
    );

    res.json({
      code: 0,
      data: { id, name }
    });
  } catch (e: any) {
    console.error('[AdminPrize] create error:', e?.message || e);
    res.json({ code: 500, message: '创建失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/prize/prize/:id
 * 编辑奖品
 */
router.put('/prize/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, imageUrl, prizeType, prizeValue, totalCount, remainCount, probability, weight, sortOrder, status } = req.body;

  try {
    const existing = await queryOne<{ id: string }>('SELECT id FROM lottery_prizes WHERE id = $1', [id]);
    if (!existing) {
      res.json({ code: 404, message: '奖品不存在', data: null });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (imageUrl !== undefined) { updates.push(`image_url = $${idx++}`); params.push(imageUrl); }
    if (prizeType !== undefined) { updates.push(`prize_type = $${idx++}`); params.push(prizeType); }
    if (prizeValue !== undefined) { updates.push(`prize_value = $${idx++}`); params.push(prizeValue); }
    if (totalCount !== undefined) { updates.push(`total_count = $${idx++}`); params.push(totalCount); }
    if (remainCount !== undefined) { updates.push(`remain_count = $${idx++}`); params.push(remainCount); }
    if (probability !== undefined) { updates.push(`probability = $${idx++}`); params.push(probability); }
    if (weight !== undefined) { updates.push(`weight = $${idx++}`); params.push(weight); }
    if (sortOrder !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(sortOrder); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    params.push(id);

    await execute(
      `UPDATE lottery_prizes SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    console.error('[AdminPrize] update error:', e?.message || e);
    res.json({ code: 500, message: '更新失败', data: null });
  }
});

/**
 * DELETE /api/v1/admin/prize/prize/:id
 * 下架奖品
 */
router.delete('/prize/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await queryOne<{ id: string }>('SELECT id FROM lottery_prizes WHERE id = $1', [id]);
    if (!existing) {
      res.json({ code: 404, message: '奖品不存在', data: null });
      return;
    }

    // 将状态设为 0（下架）
    await execute(
      `UPDATE lottery_prizes SET status = 0, updated_at = datetime('now') WHERE id = $1`,
      [id]
    );

    res.json({ code: 0, message: '下架成功' });
  } catch (e: any) {
    console.error('[AdminPrize] delete error:', e?.message || e);
    res.json({ code: 500, message: '下架失败', data: null });
  }
});

export default router;
