import { Router, Request, Response } from 'express';
import { queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * GET /api/v1/entry-deductions/balance
 * 获取当前用户可用参赛抵扣金额
 */
router.get('/balance', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const row = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM entry_deductions WHERE user_id = $1 AND status = 'available'`,
      [userId]
    );
    const availableCents = row?.total || 0;
    res.json({ code: 0, data: { availableCents } });
  } catch (e: any) {
    console.error('[EntryDeductions] balance error:', e?.message || e);
    res.json({ code: 500, message: '查询参赛抵扣卡失败', data: null });
  }
});

export default router;
