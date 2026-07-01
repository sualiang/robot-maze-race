import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// 任务模板管理 API (adminMiddleware)
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
 * GET /api/v1/admin/task/list
 * 任务模板列表
 */
router.get('/task/list', authMiddleware, adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const tasks = await query<any>(
      `SELECT * FROM tasks ORDER BY sort_order ASC, created_at DESC`
    );

    res.json({
      code: 0,
      data: {
        list: (tasks || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description || '',
          taskType: t.task_type || '',
          targetValue: t.target_value || '',
          rewardType: t.reward_type || '',
          rewardValue: t.reward_value || 0,
          status: t.status || 1,
          sortOrder: t.sort_order || 0,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        }))
      }
    });
  } catch (e: any) {
    console.error('[AdminTask] list error:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/admin/task/task
 * 新增任务模板
 */
router.post('/task', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { name, description, taskType, targetValue, rewardType, rewardValue, sortOrder } = req.body;

  if (!name || !taskType || !rewardType) {
    res.json({ code: 400, message: '名称、任务类型、奖励类型不能为空', data: null });
    return;
  }

  try {
    const id = uuidv4();
    await execute(
      `INSERT INTO tasks (id, name, description, task_type, target_value, reward_type, reward_value, status, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, NOW(), NOW())`,
      [
        id,
        name,
        description || '',
        taskType,
        targetValue || '',
        rewardType,
        rewardValue || 0,
        sortOrder || 0,
      ]
    );

    res.json({
      code: 0,
      data: { id, name }
    });
  } catch (e: any) {
    console.error('[AdminTask] create error:', e?.message || e);
    res.json({ code: 500, message: '创建失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/task/task/:id
 * 编辑任务模板
 */
router.put('/task/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, taskType, targetValue, rewardType, rewardValue, sortOrder, status } = req.body;

  try {
    const existing = await queryOne<{ id: string }>('SELECT id FROM tasks WHERE id = $1', [id]);
    if (!existing) {
      res.json({ code: 404, message: '任务不存在', data: null });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (taskType !== undefined) { updates.push(`task_type = $${idx++}`); params.push(taskType); }
    if (targetValue !== undefined) { updates.push(`target_value = $${idx++}`); params.push(targetValue); }
    if (rewardType !== undefined) { updates.push(`reward_type = $${idx++}`); params.push(rewardType); }
    if (rewardValue !== undefined) { updates.push(`reward_value = $${idx++}`); params.push(rewardValue); }
    if (sortOrder !== undefined) { updates.push(`sort_order = $${idx++}`); params.push(sortOrder); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }

    if (updates.length === 0) {
      res.json({ code: 400, message: '没有需要更新的字段', data: null });
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await execute(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    console.error('[AdminTask] update error:', e?.message || e);
    res.json({ code: 500, message: '更新失败', data: null });
  }
});

export default router;
