import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// 总部后台赛季管理 API (adminMiddleware)
// require 超级管理员或管理员权限
// ============================================================
function adminMiddleware(req: Request, res: Response, next: Function): void {
  const permissions = req.user?.permissions;
  if (!permissions || (!permissions.includes('*') && !permissions.includes('operators:list'))) {
    res.status(403).json({ code: 403, message: '权限不足', data: null });
    return;
  }
  next();
}

/**
 * GET /api/v1/admin/season/season
 * 获取赛季列表配置
 */
router.get('/season', authMiddleware, adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const seasons = await query<any>(
      `SELECT * FROM seasons ORDER BY sort_order ASC, created_at DESC`
    );

    res.json({
      code: 0,
      data: {
        list: (seasons || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
          startTime: s.start_date,
          endTime: s.end_date,
          status: s.status || 0,
          sortOrder: s.sort_order || 0,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        }))
      }
    });
  } catch (e: any) {
    console.error('[AdminSeason] list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/admin/season/season
 * 创建赛季
 */
router.post('/season', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { name, description, startTime, endTime, sortOrder } = req.body;

  if (!name) {
    res.json({ code: 400, message: '赛季名称不能为空', data: null });
    return;
  }

  try {
    const id = uuidv4();
    await execute(
      `INSERT INTO seasons (id, name, description, start_date, end_date, status, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6, NOW(), NOW())`,
      [id, name, description || '', startTime || null, endTime || null, sortOrder || 0]
    );

    res.json({
      code: 0,
      data: { id, name }
    });
  } catch (e: any) {
    console.error('[AdminSeason] create error:', e?.message || e);
    res.json({ code: 500, message: '创建赛季失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/season/season/:id
 * 更新赛季
 */
router.put('/season/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, startTime, endTime, sortOrder, status } = req.body;

  try {
    const existing = await queryOne<{ id: string }>('SELECT id FROM seasons WHERE id = $1', [id]);
    if (!existing) {
      res.json({ code: 404, message: '赛季不存在', data: null });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (startTime !== undefined) { updates.push(`start_date = $${idx++}`); params.push(startTime); }
    if (endTime !== undefined) { updates.push(`end_date = $${idx++}`); params.push(endTime); }
    if (sortOrder !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(sortOrder); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await execute(
      `UPDATE seasons SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    console.error('[AdminSeason] update error:', e?.message || e);
    res.json({ code: 500, message: '更新失败', data: null });
  }
});

/**
 * POST /api/v1/admin/season/season/:id/toggle
 * 开启/关闭赛季
 */
router.post('/season/:id/toggle', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const season = await queryOne<any>('SELECT * FROM seasons WHERE id = $1', [id]);
    if (!season) {
      res.json({ code: 404, message: '赛季不存在', data: null });
      return;
    }

    const newStatus = season.status === 1 ? 0 : 1;
    await execute(
      `UPDATE seasons SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    res.json({
      code: 0,
      data: {
        id,
        status: newStatus,
        statusText: newStatus === 1 ? '已启用' : '已禁用',
      }
    });
  } catch (e: any) {
    console.error('[AdminSeason] toggle error:', e?.message || e);
    res.json({ code: 500, message: '操作失败', data: null });
  }
});

export default router;
