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

export default router;
