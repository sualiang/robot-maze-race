import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
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
      const roleMember = await queryOpOne<{ operator_id: string }>(req, 
        'SELECT operator_id FROM operator_members WHERE id = $1',
        [req.user!.userId]
      );
      const operatorId = roleMember?.operator_id || 
        ((req.user as any).operatorId) || 
        req.user!.userId;
      venue_id = 'operator_' + operatorId;
    }

    const configs = await queryOp<{
      id: string;
      venue_id: string;
      key: string;
      value: string;
      description: string | null;
      created_at: string;
      updated_at: string;
    }>(req, 
      `SELECT id, venue_id, \`key\`, value, description, created_at, updated_at
       FROM marketing_config
       WHERE venue_id = $1
       ORDER BY \`key\` ASC`,
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

    const existing = await queryOpOne<{ id: string }>(req, 
      'SELECT id FROM marketing_config WHERE venue_id = $1 AND `key` = $2',
      [venue_id, key]
    );

    if (existing) {
      await executeOp(req, 
        'UPDATE marketing_config SET value = $1, description = COALESCE($2, description), updated_at = NOW() WHERE venue_id = $3 AND `key` = $4',
        [value, description || null, venue_id, key]
      );
      const updated = await queryOpOne<any>(req, 
        'SELECT id, venue_id, `key`, value, description, created_at, updated_at FROM marketing_config WHERE venue_id = $1 AND `key` = $2',
        [venue_id, key]
      );
      return res.json({ code: 0, message: '营销配置已更新', data: updated! });
    } else {
      const opId = String(venue_id).replace(/^operator_/, '');
      if (opId && String(venue_id).startsWith('operator_')) {
        await executeOp(req, 
          'INSERT IGNORE INTO venues (id, name, status) VALUES ($1, $2, $3, \'active\')',
          [String(venue_id), String(venue_id), opId]
        );
      }

      const id = uuidv4();
      await executeOp(req, 
        'INSERT INTO marketing_config (id, venue_id, `key`, value, description) VALUES ($1, $2, $3, $4, $5)',
        [id, venue_id, key, value, description || null]
      );
      const created = await queryOpOne<any>(req, 
        'SELECT id, venue_id, `key`, value, description, created_at, updated_at FROM marketing_config WHERE id = $1',
        [id]
      );
      return res.status(201).json({ code: 0, message: '营销配置已创建', data: created! });
    }
  } catch (error: any) {
    console.error('[OperatorMarketing] upsert error:', error.message);
    return res.status(500).json({ code: 500, message: '更新营销配置失败', data: null });
  }
});

// POST 别名，兼容前端调用 POST /operator/marketing
router.post('/', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  const { venue_id, key, value, description } = req.body;
  if (!venue_id || !key || value === undefined || value === null) {
    return res.status(400).json({ code: 400, message: 'venue_id, key, value 不能为空', data: null });
  }
  const existing = await queryOpOne<{ id: string }>(req, 
    'SELECT id FROM marketing_config WHERE venue_id = $1 AND `key` = $2',
    [venue_id, key]
  );
  if (existing) {
    await executeOp(req, 
      'UPDATE marketing_config SET value = $1, description = COALESCE($2, description), updated_at = NOW() WHERE venue_id = $3 AND `key` = $4',
      [value, description || null, venue_id, key]
    );
    const updated = await queryOpOne<any>(req, 
      'SELECT id, venue_id, `key`, value, description, created_at, updated_at FROM marketing_config WHERE venue_id = $1 AND `key` = $2',
      [venue_id, key]
    );
    return res.json({ code: 0, message: '营销配置已更新', data: updated! });
  }
  const opId = String(venue_id).replace(/^operator_/, '');
  if (opId && String(venue_id).startsWith('operator_')) {
    await executeOp(req, 
      'INSERT IGNORE INTO venues (id, name, status) VALUES ($1, $2, $3, \'active\')',
      [String(venue_id), String(venue_id), opId]
    );
  }
  const id = uuidv4();
  await executeOp(req, 
    'INSERT INTO marketing_config (id, venue_id, `key`, value, description) VALUES ($1, $2, $3, $4, $5)',
    [id, venue_id, key, value, description || null]
  );
  const created = await queryOpOne<any>(req, 
    'SELECT id, venue_id, `key`, value, description, created_at, updated_at FROM marketing_config WHERE id = $1',
    [id]
  );
  return res.status(201).json({ code: 0, message: '营销配置已创建', data: created! });
});

// ============================================================
// GET /api/v1/operator/marketing/range
// 获取总部设的全局参数范围（最小值/最大值/默认值）
// ============================================================
router.get('/range', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const configs = await query<{ key: string; value: string }>(
      "SELECT `key`, value FROM system_config WHERE `key` LIKE 'mkt_%' ORDER BY `key` ASC"
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

    // 不传 venue_id 时，统一获取运营商ID；同时获取 operatorId 用于 venue 占位
    let operatorId: string;
    if (!venue_id) {
      const roleMember = await queryOpOne<{ operator_id: string }>(req, 
        'SELECT operator_id FROM operator_members WHERE id = $1',
        [req.user!.userId]
      );
      operatorId = roleMember?.operator_id || 
        ((req.user as any).operatorId) || 
        req.user!.userId;
      venue_id = 'operator_' + operatorId;
    } else {
      // 从 venue_id 提取 operatorId（格式：operator_xxx）
      operatorId = venue_id.replace(/^operator_/, '') || 
        ((req.user as any).operatorId) || 
        req.user!.userId;
    }

    // 确保 venue 记录存在（满足 foreign key 约束）
    await executeOp(req, 
      'INSERT IGNORE INTO venues (id, name, status) VALUES ($1, $2, $3, \'active\')',
      [venue_id, venue_id, operatorId]
    );

    for (const { key, value } of configs) {
      const existing = await queryOpOne<{ id: string }>(req, 'SELECT id FROM marketing_config WHERE venue_id = $1 AND `key` = $2', [venue_id, key]);
      if (existing) {
        await executeOp(req, "UPDATE marketing_config SET value = $1, updated_at = NOW() WHERE venue_id = $2 AND `key` = $3", [value, venue_id, key]);
      } else {
        await executeOp(req, 'INSERT INTO marketing_config (id, venue_id, `key`, value) VALUES ($1, $2, $3, $4)', [uuidv4(), venue_id, key, value]);
      }
    }

    return res.json({ code: 0, message: '营销配置已批量保存', data: null });
  } catch (error: any) {
    console.error('[OperatorMarketing] batch save error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '批量保存失败: ' + error.message, data: null });
  }
});

// ============================================================
// GET /api/v1/operator/marketing/check-init
// 检查运营商是否可以初始化模板数据
// ============================================================
router.get('/check-init', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const roleMember = await queryOpOne<{ operator_id: string }>(req, 
      'SELECT operator_id FROM operator_members WHERE id = $1',
      [req.user!.userId]
    );
    const operatorId = roleMember?.operator_id ||
      (req.user as any).operatorId ||
      req.user!.userId;
    const venue_id = 'operator_' + operatorId;

    const pkgCount = await queryOpOne<{ cnt: number }>(req, 
      'SELECT COUNT(*) as cnt FROM race_packages WHERE operator_id = $1',
      [operatorId]
    );
    const mktCount = await queryOpOne<{ cnt: number }>(req, 
      'SELECT COUNT(*) as cnt FROM marketing_config WHERE venue_id = $1',
      [venue_id]
    );
    const initialized = (pkgCount?.cnt ?? 0) > 0 || (mktCount?.cnt ?? 0) > 0;
    return res.json({ code: 0, message: 'ok', data: { initialized } });
  } catch (error: any) {
    console.error('[OperatorMarketing] check-init error:', error.message);
    return res.status(500).json({ code: 500, message: '检查初始化状态失败', data: null });
  }
});

// ============================================================
// POST /api/v1/operator/marketing/init-templates
// 一键初始化基础数据
// ============================================================
router.post('/init-templates', authMiddleware, operatorOnly, async (req: Request, res: Response) => {
  try {
    const roleMember = await queryOpOne<{ operator_id: string }>(req, 
      'SELECT operator_id FROM operator_members WHERE id = $1',
      [req.user!.userId]
    );
    const operatorId = roleMember?.operator_id ||
      (req.user as any).operatorId ||
      req.user!.userId;
    const venue_id = 'operator_' + operatorId;

    // 防重复
    const pkgCount = await queryOpOne<{ cnt: number }>(req, 
      'SELECT COUNT(*) as cnt FROM race_packages WHERE operator_id = $1',
      [operatorId]
    );
    if ((pkgCount?.cnt ?? 0) > 0) {
      return res.status(400).json({ code: 400, message: '已有参赛包数据，不能重复初始化', data: null });
    }

    // 3档参赛包模板
    const packages = [
      { name: '基础参赛包', price: 6800, description: '基础参赛体验' },
      { name: '标准参赛包', price: 16800, description: '标准参赛体验' },
      { name: '专业参赛包', price: 36800, description: '专业参赛体验，含更多权益' },
    ];
    for (const pkg of packages) {
      await executeOp(req, 
        `INSERT INTO race_packages (id, name, price_cents, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())`,
        [uuidv4(), operatorId, pkg.name, pkg.price, pkg.description]
      );
    }

    // 确保 venue 记录存在（满足 foreign key 约束）
    await executeOp(req, 
      `INSERT INTO venues (id, name, status)
       VALUES ($1, $2, $3, 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [venue_id, venue_id, operatorId]
    );

    // 默认营销配置
    const defaultMktConfigs = [
      { key: 'home_announcement', value: '' },
      { key: 'help_enabled', value: 'true' },
      { key: 'help_required_count', value: '3' },
      { key: 'help_reward_count', value: '1' },
      { key: 'welcome_deduction_cents', value: '500' },
    ];
    for (const cfg of defaultMktConfigs) {
      await executeOp(req, 
        `INSERT INTO marketing_config (id, venue_id, \`key\`, value) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), venue_id, cfg.key, cfg.value]
      );
    }

    // 测试消费券
    for (let i = 0; i < 3; i++) {
      const amounts = [500, 1000, 1500];
      await executeOp(req, 
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, extra_data, created_at, updated_at)
         VALUES ($1, '', '', 'platform', $2, $3, $4, 0, 1, NOW(), '2070-01-01 00:00:00', 20, '{}', NOW(), NOW())`,
        [uuidv4(), `测试消费券${i + 1}号`, `初始化模板·${amounts[i] / 100}元消费券`, amounts[i]]
      );
    }

    return res.json({ code: 0, message: '初始化成功', data: { venue_id } });
  } catch (error: any) {
    console.error('[OperatorMarketing] init-templates error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '初始化失败: ' + error.message, data: null });
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
