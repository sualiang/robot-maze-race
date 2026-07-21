import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// 加载银行支行数据（启动时只加载一次）
const banksData: any[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../banks.json'), 'utf-8')
);

/**
 * GET /api/v1/admin/banks
 * 返回银行列表（仅银行ID和名称）
 */
router.get('/', (_req: Request, res: Response) => {
  const list = banksData.map((b: any) => ({
    bankId: b.bankId,
    name: b.name,
  }));
  return res.json({ code: 0, message: 'ok', data: list });
});

/**
 * GET /api/v1/admin/banks/:bankId/branches?q=xxx
 * 根据银行ID和关键词搜索支行
 */
router.get('/:bankId/branches', (req: Request, res: Response) => {
  const { bankId } = req.params;
  const q = (req.query.q as string || '').trim();

  const bank = banksData.find((b: any) => b.bankId === bankId);
  if (!bank) {
    return res.status(404).json({ code: 404, message: '银行不存在', data: null });
  }

  let branches = bank.branches;
  if (q) {
    branches = branches.filter((br: any) => br.name.includes(q));
  }

  // 限制返回条数
  const limited = branches.slice(0, 50);

  return res.json({ code: 0, message: 'ok', data: { bankId, total: branches.length, list: limited } });
});

export default router;
