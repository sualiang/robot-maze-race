import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';

const router = Router();

// ============================================================
// 裁判注册路由 (单数路径 /api/v1/referee)
// 流程：运营商定向邀请 → 裁判提交手机号+姓名 → 直接注册成功
// 注：定向邀请无需审核，提交即激活
// ============================================================

/**
 * POST /api/v1/referee/apply
 * 裁判注册（从邀请链接提交信息）
 * @body name - 姓名
 * @body phone - 手机号
 * @body operatorId - 运营商ID（从URL参数传入）
 */
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { name, phone, operatorId } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ code: 400, message: '请填写姓名和手机号', data: null });
    }
    if (!/^\d{11}$/.test(phone)) {
      return res.status(400).json({ code: 400, message: '手机号格式不正确', data: null });
    }

    // 检查手机号是否已被注册
    const existing = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM referees WHERE phone = ?',
      [phone]
    );
    if (existing) {
      const label = existing.status === 'approved' ? '已注册' :
        existing.status === 'pending' ? '正在审核中' : '已被驳回';
      return res.status(400).json({ code: 400, message: `该手机号已有注册（${label}）`, data: null });
    }

    // 创建 users 记录（直接 active）
    const userId = uuidv4();
    const refOpenid = 'ref_apply_' + phone;
    await execute(
      `INSERT INTO users (id, openid, nickname, phone, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'referee', 'active', NOW(), NOW())`,
      [userId, refOpenid, name, phone]
    );

    // 创建 referees 记录（直接 approved）
    const refereeId = uuidv4();
    await execute(
      `INSERT INTO referees (id, user_id, name, phone, status, operator_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'approved', ?, NOW(), NOW())`,
      [refereeId, userId, name, phone, operatorId || null]
    );

    return res.status(201).json({
      code: 0,
      message: '注册成功',
      data: { id: refereeId, name, phone, status: 'approved' },
    });
  } catch (error: any) {
    console.error('[Referee] apply error:', error.message);
    return res.status(500).json({ code: 500, message: '注册失败', data: null });
  }
});

export default router;
