import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../middleware/auth';
import { merchantAuthMiddleware } from './merchant-auth';
import { execute } from '../config/database';

const router = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// 确保 uploads 目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * POST /api/v1/upload/merchant-logo
 * 商家 Logo 上传（base64 或 dataURL）
 * Body: { image: "data:image/png;base64,..." }
 * Returns: { code: 0, data: { url: "/uploads/xxx.jpg" } }
 */
router.post('/merchant-logo', merchantAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) {
      res.json({ code: 400, message: '缺少图片数据', data: null });
      return;
    }

    // 解析 base64 data URL
    const matches = image.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
    if (!matches) {
      res.json({ code: 400, message: '图片格式不合法，仅支持 PNG/JPEG/GIF/WebP', data: null });
      return;
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // 限制 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      res.json({ code: 400, message: '图片大小不能超过 2MB', data: null });
      return;
    }

    const filename = `merchant_logo_${uuidv4().slice(0, 8)}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    const url = `/uploads/${filename}`;

    // 更新商家 logo_url
    const merchantId = req.merchantAdmin?.merchantId;
    if (merchantId) {
      await execute(
        `UPDATE merchants SET logo_url = $1, updated_at = datetime('now') WHERE id = $2`,
        [url, merchantId]
      );
    }

    res.json({
      code: 0,
      data: { url },
      message: '上传成功',
    });
  } catch (e: any) {
    console.error('[Upload] merchant logo error:', e?.message || e);
    res.json({ code: 500, message: '上传失败', data: null });
  }
});

/**
 * POST /api/v1/upload/admin-merchant-logo
 * 运营/总部后台设置商家 Logo（直接传 URL）
 * Body: { merchantId, logoUrl }
 */
router.post('/admin-merchant-logo', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { merchantId, logoUrl } = req.body;
    if (!merchantId || !logoUrl) {
      res.json({ code: 400, message: '缺少参数', data: null });
      return;
    }

    await execute(
      `UPDATE merchants SET logo_url = $1, updated_at = datetime('now') WHERE id = $2`,
      [logoUrl, merchantId]
    );

    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    console.error('[Upload] admin set logo error:', e?.message || e);
    res.json({ code: 500, message: '更新失败', data: null });
  }
});

export default router;
