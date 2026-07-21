import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();

// ============================================================
// Admin Marketing 路由 — 营销配置管理（RBAC 权限控制）
// ============================================================

/** 将 system_config 的 key-value 行转为扁平对象 */
function rowsToMap(rows: { key: string; value: string }[]): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const r of rows) {
    const key = r.key.replace(/^mkt_/, '');
    // Try parse as number first
    const num = Number(r.value);
    obj[key] = isNaN(num) ? r.value : num;
  }
  return obj;
}

/** 确保配置项存在 */
async function ensureConfigKey(key: string, defaultValue: string): Promise<void> {
  const existing = await queryOne<{ id: string }>('SELECT id FROM system_config WHERE `key` = $1', [key]);
  if (!existing) {
    await execute('INSERT INTO system_config (id, `key`, value) VALUES ($1, $2, $3)', [uuidv4(), key, defaultValue]);
  }
}

/** 初始化默认营销配置 */
const defaultConfigs: Record<string, string> = {
  'mkt_help_default_enabled': 'true',
  'mkt_help_required_count_min': '1',
  'mkt_help_required_count_max': '10',
  'mkt_help_required_count_default': '3',
  'mkt_help_reward_count_min': '1',
  'mkt_help_reward_count_max': '50',
  'mkt_help_reward_count_default': '1',
};

// ============================================================
// GET /api/v1/admin/marketing/config
// 获取全局营销配置（扁平对象）— marketing:read
// ============================================================
router.get('/config', authMiddleware, checkPermission('marketing:read'), async (req: Request, res: Response) => {
  try {
    // 确保默认配置存在
    for (const [key, value] of Object.entries(defaultConfigs)) {
      await ensureConfigKey(key, value);
    }

    const configs = await query<{ key: string; value: string }>(
      "SELECT `key`, value FROM system_config WHERE `key` LIKE 'mkt_%' ORDER BY `key` ASC"
    );

    const data = rowsToMap(configs);
    return res.json({ code: 0, message: 'ok', data });
  } catch (error: any) {
    console.error('[AdminMarketing] get config error:', error.message);
    return res.status(500).json({ code: 500, message: '获取营销配置失败', data: null });
  }
});

// ============================================================
// PUT /api/v1/admin/marketing/config
// 批量保存全局营销配置 — marketing:edit
// body: { help_default_enabled, help_required_count, ... }
// ============================================================
router.put('/config', authMiddleware, checkPermission('marketing:edit'), async (req: Request, res: Response) => {
  try {
    const body = req.body;

    for (const [fieldName, fieldValue] of Object.entries(body)) {
      const key = `mkt_${fieldName}`;
      const value = String(fieldValue);

      const existing = await queryOne<{ id: string }>('SELECT id FROM system_config WHERE `key` = $1', [key]);
      if (existing) {
        await execute("UPDATE system_config SET value = $1, updated_at = NOW() WHERE `key` = $2", [value, key]);
      } else {
        await execute('INSERT INTO system_config (id, `key`, value) VALUES ($1, $2, $3)', [uuidv4(), key, value]);
      }
    }

    return res.json({ code: 0, message: '全局营销配置已保存', data: null });
  } catch (error: any) {
    console.error('[AdminMarketing] save config error:', error.message);
    return res.status(500).json({ code: 500, message: '保存营销配置失败', data: null });
  }
});

// ============================================================
// GET /api/v1/admin/marketing/operators
// 获取各运营商的营销状态 — marketing:read
// ============================================================
router.get('/operators', authMiddleware, checkPermission('marketing:read'), async (req: Request, res: Response) => {
  try {
    const operators = await query<any>(
      `SELECT o.id, o.name as operator_name
       FROM operators o
       ORDER BY o.name ASC`
    );
    const result = [];
    for (const op of operators) {
      const venues = await queryOp<{ id: string }>(req, 
        'SELECT id FROM venues WHERE operator_id = $1',
        [op.id]
      );

      let help_enabled = true;
      let help_required_count = 3;
      let help_reward_count = 1;
      let updated_at = new Date().toISOString();

      if (venues.length > 0) {
        const venueIds = venues.map((v: any) => v.id);
        const placeholders = venueIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        const mcRows = await queryOp<{ key: string; value: string; updated_at: string }>(req, 
          `SELECT \`key\`, value, updated_at FROM marketing_config
           WHERE venue_id IN (${placeholders}) AND \`key\` IN ('help_enabled', 'help_required_count', 'help_reward_count')`,
          venueIds
        );

        for (const mc of mcRows) {
          if (mc.key === 'help_enabled') help_enabled = mc.value === 'true';
          if (mc.key === 'help_required_count') help_required_count = parseInt(mc.value, 10) || 3;
          if (mc.key === 'help_reward_count') help_reward_count = parseInt(mc.value, 10) || 1;
          if (mc.updated_at) updated_at = mc.updated_at;
        }
      }

      result.push({
        id: op.id,
        operator_name: op.operator_name,
        help_enabled,
        help_required_count,
        help_reward_count,
        updated_at,
      });
    }

    return res.json({ code: 0, message: 'ok', data: { list: result } });
  } catch (error: any) {
    console.error('[AdminMarketing] list operators error:', error.message);
    return res.status(500).json({ code: 500, message: '获取运营商营销状态失败', data: null });
  }
});

/**
 * GET /api/v1/admin/marketing (legacy - returns raw list of config rows)
 * marketing:read
 */
router.get('/', authMiddleware, checkPermission('marketing:read'), async (req: Request, res: Response) => {
  try {
    const configs = await query<any>(
      `SELECT id, \`key\`, value, description, created_at, updated_at
       FROM system_config
       WHERE \`key\` LIKE 'mkt_%'
       ORDER BY \`key\` ASC`
    );
    return res.json({ code: 0, message: 'ok', data: configs });
  } catch (error: any) {
    console.error('[AdminMarketing] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取营销配置失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/marketing (legacy - single key update)
 * marketing:edit
 */
router.put('/', authMiddleware, checkPermission('marketing:edit'), async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined || value === null) {
      return res.status(400).json({ code: 400, message: 'key 和 value 不能为空', data: null });
    }
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM system_config WHERE `key` = $1',
      [key]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '配置项不存在', data: null });
    }
    await execute(
      'UPDATE system_config SET value = $1, updated_at = NOW() WHERE `key` = $2',
      [value, key]
    );
    const updated = await queryOne<any>(
      'SELECT id, `key`, value, description, created_at, updated_at FROM system_config WHERE `key` = $1',
      [key]
    );
    return res.json({ code: 0, message: '营销配置已更新', data: updated! });
  } catch (error: any) {
    console.error('[AdminMarketing] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新营销配置失败', data: null });
  }
});

/**
 * POST /api/v1/admin/marketing (legacy - create config)
 * marketing:edit
 */
router.post('/', authMiddleware, checkPermission('marketing:edit'), async (req: Request, res: Response) => {
  try {
    const { key, value, description } = req.body;
    if (!key || value === undefined || value === null) {
      return res.status(400).json({ code: 400, message: 'key 和 value 不能为空', data: null });
    }
    if (!key.startsWith('mkt_')) {
      return res.status(400).json({ code: 400, message: '营销配置 key 必须以 mkt_ 开头', data: null });
    }
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM system_config WHERE `key` = $1',
      [key]
    );
    if (existing) {
      return res.status(409).json({ code: 409, message: '配置项已存在，请使用 PUT 更新', data: null });
    }
    const id = uuidv4();
    await execute('INSERT INTO system_config (id, `key`, value, description) VALUES ($1, $2, $3, $4)', [id, key, value, description || null]);
    const created = await queryOne<any>(
      'SELECT id, `key`, value, description, created_at, updated_at FROM system_config WHERE id = $1',
      [id]
    );
    return res.status(201).json({ code: 0, message: '营销配置已创建', data: created! });
  } catch (error: any) {
    console.error('[AdminMarketing] create error:', error.message);
    return res.status(500).json({ code: 500, message: '创建营销配置失败', data: null });
  }
});

export default router;
