// 客户端错误日志上报路由
// 写入 SQLite + 打印日志，轮询脚本读完即删，不长期留存

import { Router, Request, Response } from 'express';
import { execute } from '../config/database';

const router = Router();

router.post('/client-log', async (req: Request, res: Response) => {
  const { level, message, source, detail, url } = req.body;
  try {
    await execute(
      `INSERT INTO client_logs (level, message, source, detail, url)
       VALUES (?, ?, ?, ?, ?)`,
      [level || 'info', message || '', source || '', detail || '', url || '']
    );
    console.log(`[FECLIENT] ${message}`);
  } catch {
    // 表可能不存在，忽略
  }
  res.json({ code: 0, data: null });
});

// Image beacon 用的 GET（前端 100% 发起，不依赖任何 JS API）
router.get('/client-log', async (req: Request, res: Response) => {
  const { level, message, source, detail, url, beacon } = req.query;
  if (!beacon) {
    res.status(404).end();
    return;
  }
  try {
    await execute(
      `INSERT INTO client_logs (level, message, source, detail, url)
       VALUES (?, ?, ?, ?, ?)`,
      [level || 'info', message || '', source || '', detail || '', url || '']
    );
    console.log(`[FECLIENT-BEACON] ${message}`);
  } catch {}
  // 返回 1x1 gif
  res.set('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

export default router;
