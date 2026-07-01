import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * GET /api/v1/task/list
 * 获取用户任务列表
 */
router.get('/list', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // 查询所有活跃任务
    const tasks = await query<any>(
      `SELECT * FROM tasks WHERE status = 1 ORDER BY sort_order ASC, created_at DESC`
    );

    // 查询用户的任务进度
    const userTasks = await query<any>(
      `SELECT * FROM user_tasks WHERE user_id = $1`,
      [userId]
    );

    const userTaskMap = new Map<string, any>();
    for (const ut of (userTasks || [])) {
      userTaskMap.set(ut.task_id, ut);
    }

    const list = (tasks || []).map((task: any) => {
      const ut = userTaskMap.get(task.id);
      return {
        id: task.id,
        name: task.name,
        description: task.description,
        taskType: task.task_type,
        targetValue: task.target_value || '',
        rewardType: task.reward_type || '',
        rewardValue: task.reward_value || 0,
        progressValue: ut?.progress_value || '',
        status: ut?.status || 0, // 0=未开始 1=已领取 2=已过期
        rewarded: ut?.status === 1 && ut?.rewarded_at !== null,
        rewardedAt: ut?.rewarded_at || null,
      };
    });

    res.json({
      code: 0,
      data: { list }
    });
  } catch (e: any) {
    console.error('[任务] 查询列表失败:', e?.message || e);
    res.json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/task/reward
 * 领取任务奖励
 */
router.post('/reward', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { taskId } = req.body;

  if (!taskId) {
    res.json({ code: 400, message: '缺少任务ID', data: null });
    return;
  }

  try {
    // 查询任务模板
    const task = await queryOne<any>(
      `SELECT * FROM tasks WHERE id = $1 AND status = 1`,
      [taskId]
    );

    if (!task) {
      res.json({ code: 404, message: '任务不存在或已下架', data: null });
      return;
    }

    // 查询用户任务进度
    const userTask = await queryOne<any>(
      `SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2`,
      [userId, taskId]
    );

    if (!userTask || userTask.status !== 0) {
      res.json({ code: 400, message: '任务未完成或奖励已领取', data: null });
      return;
    }

    // 发放奖励
    const rewardType = task.reward_type || '';
    const rewardValue = task.reward_value || 0;

    if (rewardType === 'exp') {
      await execute(
        `UPDATE users SET exp = exp + $1, updated_at = NOW() WHERE id = $2`,
        [rewardValue, userId]
      );
    } else if (rewardType === 'points') {
      await execute(
        `UPDATE users SET points = points + $1, updated_at = NOW() WHERE id = $2`,
        [rewardValue, userId]
      );
    } else if (rewardType === 'race_count') {
      await execute(
        `UPDATE users SET race_count = race_count + $1, updated_at = NOW() WHERE id = $2`,
        [rewardValue, userId]
      );
    }

    // 标记为已领取
    await execute(
      `UPDATE user_tasks SET status = 1, rewarded_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND task_id = $2 AND status = 0`,
      [userId, taskId]
    );

    res.json({
      code: 0,
      data: {
        taskId,
        rewardType,
        rewardValue,
      }
    });
  } catch (e: any) {
    console.error('[任务] 领取奖励失败:', e?.message || e);
    res.json({ code: 500, message: '领取失败', data: null });
  }
});

export default router;
