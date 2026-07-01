import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// Admin Settings 路由 — 系统配置管理（仅 super_admin 角色）
// ============================================================

function superAdminOnly(req: Request, res: Response, next: Function): void {
  const permissions = req.user?.permissions;
  if (!permissions || !permissions.includes('*')) {
    res.status(403).json({ code: 403, message: '仅超级管理员可操作', data: null });
    return;
  }
  next();
}

// ============================================================
// Helper: 将 system_config 行转为前端扁平对象
// ============================================================
function rowsToFlatObject(rows: { key: string; value: string }[]): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const r of rows) {
    const key = r.key.replace(/^cfg_/, '');
    const lower = r.value.toLowerCase();
    if (lower === 'true') obj[key] = true;
    else if (lower === 'false') obj[key] = false;
    else {
      const num = Number(r.value);
      obj[key] = isNaN(num) ? r.value : num;
    }
  }
  return obj;
}

/** 确保配置项存在 */
async function ensureSettingKey(key: string, defaultValue: string): Promise<void> {
  const existing = await queryOne<{ id: string }>('SELECT id FROM system_config WHERE `key` = $1', [key]);
  if (!existing) {
    await execute('INSERT INTO system_config (id, `key`, value) VALUES ($1, $2, $3)', [uuidv4(), key, defaultValue]);
  }
}

const defaultSettings: Record<string, string> = {
  'cfg_default_search_radius': '100',
  'cfg_max_queue_size': '50',
  'cfg_default_timeout_seconds': '300',
  'cfg_checkin_enabled': 'true',
  'cfg_help_enabled': 'true',
  'cfg_gps_check_enabled': 'true',
  'cfg_gps_check_radius': '500',
  'cfg_auto_assign_venue': 'true',
  'cfg_maintenance_mode': 'false',
  'cfg_api_rate_limit': '100',
  'cfg_max_race_per_day': '50',
  'cfg_help_required_count': '5',
  'cfg_help_valid_days': '7',
  'cfg_help_initiator_reward_count': '1',
};

/**
 * GET /api/v1/admin/settings
 * 获取所有系统设置（返回扁平对象）
 */
router.get('/', authMiddleware, superAdminOnly, async (req: Request, res: Response) => {
  try {
    for (const [key, value] of Object.entries(defaultSettings)) {
      await ensureSettingKey(key, value);
    }

    const configs = await query<{ key: string; value: string }>(
      `SELECT key, value FROM system_config WHERE key LIKE 'cfg_%' ORDER BY key ASC`
    );

    const data = rowsToFlatObject(configs);
    return res.json({ code: 0, message: 'ok', data });
  } catch (error: any) {
    console.error('[AdminSettings] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取系统配置失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/settings
 * 批量保存系统设置
 */
router.put('/', authMiddleware, superAdminOnly, async (req: Request, res: Response) => {
  try {
    const body = req.body;

    for (const [fieldName, fieldValue] of Object.entries(body)) {
      const key = `cfg_${fieldName}`;
      const value = String(fieldValue);

      const existing = await queryOne<{ id: string }>('SELECT id FROM system_config WHERE `key` = $1', [key]);
      if (existing) {
        await execute("UPDATE system_config SET value = $1, updated_at = NOW() WHERE `key` = $2", [value, key]);
      } else {
        await execute('INSERT INTO system_config (id, `key`, value) VALUES ($1, $2, $3)', [uuidv4(), key, value]);
      }
    }

    return res.json({ code: 0, message: '系统设置已保存，部分设置将在下次重启后生效', data: null });
  } catch (error: any) {
    console.error('[AdminSettings] save error:', error.message);
    return res.status(500).json({ code: 500, message: '保存系统设置失败', data: null });
  }
});

/**
 * GET /api/v1/admin/settings/profit-share-rate
 * 获取全局默认分润比例（放在 /:key 通配路由之前）
 */
router.get('/profit-share-rate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const row = await queryOne<{ value: string }>(
      `SELECT value FROM settings WHERE \`key\` = 'default_profit_share_rate'`
    );
    return res.json({
      code: 0,
      message: 'ok',
      data: { rate: parseInt(row?.value || '80', 10) },
    });
  } catch (error: any) {
    return res.status(500).json({ code: 500, message: '获取分润比例失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/settings/profit-share-rate
 * 更新全局默认分润比例（放在 /:key 通配路由之前）
 */
router.put('/profit-share-rate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { rate, syncToAll } = req.body;
    if (typeof rate !== 'number' || rate < 0 || rate > 100) {
      return res.status(400).json({ code: 400, message: '分润比例应在0-100之间', data: null });
    }
    const rateStr = String(rate);
    await execute(
      `INSERT INTO settings (\`key\`, value) VALUES ('default_profit_share_rate', $1)
       ON CONFLICT(\`key\`) DO UPDATE SET value = $2, updated_at = NOW()`,
      [rateStr, rateStr]
    );

    let syncedCount = 0;
    if (syncToAll === true) {
      const result = await execute(
        'UPDATE operators SET profit_share_rate = $1',
        [rate]
      );
      syncedCount = result?.changes || 0;
    }

    return res.json({
      code: 0,
      message: syncToAll
        ? `分润比例已更新，并同步到 ${syncedCount} 家运营商`
        : '更新成功',
      data: { rate, syncedCount },
    });
  } catch (error: any) {
    return res.status(500).json({ code: 500, message: '更新分润比例失败', data: null });
  }
});

/**
 * PUT /api/v1/admin/settings/:key (legacy — 单 key 更新)
 * 放置在特定路由（如 /profit-share-rate）之后，防止通配路由截胡
 */
router.put('/:key', authMiddleware, superAdminOnly, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ code: 400, message: 'value 不能为空', data: null });
    }

    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM system_config WHERE `key` = $1',
      [key]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '配置项不存在', data: null });
    }

    await execute("UPDATE system_config SET value = $1, updated_at = NOW() WHERE `key` = $2", [value, key]);

    return res.json({ code: 0, message: '配置已更新', data: null });
  } catch (error: any) {
    console.error('[AdminSettings] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新配置失败', data: null });
  }
});

export default router;
