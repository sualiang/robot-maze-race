import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * GET /api/v1/announcement
 * 公开接口：获取当前生效的首页公告文字
 * 返回：{ text: string, updated_at: string }
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const row = await queryOne<{ value: string; updated_at: string }>(
      `SELECT value, updated_at FROM system_config WHERE \`key\` = 'home_announcement'`
    );
    return res.json({
      code: 0,
      data: {
        text: row?.value || '',
        updatedAt: row?.updated_at || '',
      }
    });
  } catch (error: any) {
    console.error('[Announcement] get error:', error.message);
    return res.json({ code: 0, data: { text: '', updatedAt: '' } });
  }
});

export default router;
