import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// Operator Marketing 路由 — 赛场级营销配置（需要 operator/admin 角色）
// ============================================================

function operatorOnly(req: Request, res: Response, next: Function): void {
  if (req.user?.role !== 'operator' && req.user?.role !== 'admin') {
    res.status(403).json({ code: 403, message: '仅运营商可操作', data: null });
    return;
  }
  next();
}

/**
 * GET /api/v1/operator/marketing?venue_id=xxx
 * 获取某个赛场/运营商的营销配置
 */
router.get('/', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    let { venue_id } = req.query;

    if (!venue_id) {
      // 统一获取运营商ID：先从 operator_members 查，再回退到 operators
      const roleMember = await queryOne<{ operator_id: string }>(
        'SELECT operator_id FROM operator_members WHERE id = $1',
        [req.user!.userId]
      );
      const operatorId = roleMember?.operator_id || 
        ((req.user as any).operatorId) || 
        req.user!.userId;
      venue_id = 'operator_' + operatorId;
    }

    const configs = await query<{
      id: string;
      venue_id: string;
      key: string;
      value: string;
      description: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, venue_id, \`key\`, value, description, created_at, updated_at
       FROM marketing_config
       WHERE venue_id = $1
       ORDER BY key ASC`,
      [venue_id]
    );

    return res.json({ code: 0, message: 'ok', data: configs });
  } catch (error: any) {
    console.error('[OperatorMarketing] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取营销配置失败', data: null });
  }
});

/**
 * PUT /api/v1/operator/marketing
 * upsert 营销配置（存在更新，不存在插入）
 * body: { venue_id: string, key: string, value: string, description?: string }
 */
router.put('/', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { venue_id, key, value, description } = req.body;

    if (!venue_id || !key || value === undefined || value === null) {
      return res.status(400).json({ code: 400, message: 'venue_id, key, value 不能为空', data: null });
    }

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM marketing_config WHERE venue_id = $1 AND `key` = $2',
      [venue_id, key]
    );

    if (existing) {
      // 更新
      const updated = await queryOne<{
        id: string;
        venue_id: string;
        key: string;
        value: string;
        description: string | null;
      }>(
        `UPDATE marketing_config
         SET value = $1, description = COALESCE($2, description), updated_at = NOW()
         WHERE venue_id = $3 AND \`key\` = $4
         RETURNING id, venue_id, \`key\`, value, description, created_at, updated_at`,
        [value, description || null, venue_id, key]
      );

      return res.json({ code: 0, message: '营销配置已更新', data: updated! });
    } else {
      // 插入
      const id = uuidv4();
      const created = await queryOne<{
        id: string;
        venue_id: string;
        key: string;
        value: string;
        description: string | null;
      }>(
        `INSERT INTO marketing_config (id, venue_id, \`key\`, value, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, venue_id, \`key\`, value, description, created_at, updated_at`,
        [id, venue_id, key, value, description || null]
      );

      return res.status(201).json({ code: 0, message: '营销配置已创建', data: created! });
    }
  } catch (error: any) {
    console.error('[OperatorMarketing] upsert error:', error.message);
    return res.status(500).json({ code: 500, message: '更新营销配置失败', data: null });
  }
});

// ============================================================
// GET /api/v1/operator/marketing/range
// 获取总部设的全局参数范围（最小值/最大值/默认值）
// ============================================================
router.get('/range', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const configs = await query<{ key: string; value: string }>(
      `SELECT key, value FROM system_config WHERE key LIKE 'mkt_%' ORDER BY key ASC`
    );

    const obj: Record<string, any> = {};
    for (const r of configs) {
      const key = r.key.replace(/^mkt_/, '');
      const num = Number(r.value);
      obj[key] = isNaN(num) ? r.value : num;
    }

    return res.json({ code: 0, message: 'ok', data: obj });
  } catch (error: any) {
    console.error('[OperatorMarketing] get range error:', error.message);
    return res.status(500).json({ code: 500, message: '获取全局配置范围失败', data: null });
  }
});

// ============================================================
// POST /api/v1/operator/marketing/batch
// 批量保存运营商的营销配置（key-value 数组）
// body: { venue_id: string, configs: { key: string, value: string }[] }
// ============================================================
router.post('/batch', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    let { venue_id, configs } = req.body;

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ code: 400, message: 'configs 不能为空', data: null });
    }

    // 不传 venue_id 时，统一获取运营商ID
    if (!venue_id) {
      const roleMember = await queryOne<{ operator_id: string }>(
        'SELECT operator_id FROM operator_members WHERE id = $1',
        [req.user!.userId]
      );
      const operatorId = roleMember?.operator_id || 
        ((req.user as any).operatorId) || 
        req.user!.userId;
      venue_id = 'operator_' + operatorId;
    }

    for (const { key, value } of configs) {
      const existing = await queryOne<{ id: string }>('SELECT id FROM marketing_config WHERE venue_id = $1 AND `key` = $2', [venue_id, key]);
      if (existing) {
        await execute("UPDATE marketing_config SET value = $1, updated_at = NOW() WHERE venue_id = $2 AND `key` = $3", [value, venue_id, key]);
      } else {
        await execute('INSERT INTO marketing_config (id, venue_id, `key`, value) VALUES ($1, $2, $3, $4)', [uuidv4(), venue_id, key, value]);
      }
    }

    return res.json({ code: 0, message: '营销配置已批量保存', data: null });
  } catch (error: any) {
    console.error('[OperatorMarketing] batch save error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '批量保存失败: ' + error.message, data: null });
  }
});

// ============================================================
// POST /api/v1/operator/marketing/announcement
// 设置首页公告（纯文字，最多30字）
// body: { text: string }
// ============================================================
router.post('/announcement', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string' || text.length > 30) {
      return res.status(400).json({ code: 400, message: '公告内容不能为空且不超过30字', data: null });
    }
    const existing = await queryOne<{ id: string }>('SELECT id FROM system_config WHERE `key` = $1', ['home_announcement']);
    if (existing) {
      await execute("UPDATE system_config SET value = $1, updated_at = NOW() WHERE `key` = 'home_announcement'", [text]);
    } else {
      await execute('INSERT INTO system_config (id, `key`, value) VALUES ($1, $2, $3)', [uuidv4(), 'home_announcement', text]);
    }
    return res.json({ code: 0, message: '公告已更新', data: { text, updatedAt: new Date().toISOString() } });
  } catch (error: any) {
    console.error('[OperatorMarketing] set announcement error:', error.message);
    return res.status(500).json({ code: 500, message: '更新公告失败', data: null });
  }
});

export default router;
