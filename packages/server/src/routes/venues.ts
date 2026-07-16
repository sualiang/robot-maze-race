import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { createVenueMiniCode } from '../services/wechat-qrcode';
import { getOperatorContext } from '../middleware/operator-context';
import {
  ApiResponse,
  Venue,
  VenueStatus,
  CreateVenueParams,
  UpdateVenueParams,
  PaginatedResult,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// Venues 路由 — 赛场 CRUD
// ============================================================

/**
 * GET /api/v1/venues
 * 获取赛场列表（支持分页、状态筛选）
 * @query status - 筛选赛场状态: open | closed | maintenance
 * @query page - 页码，默认 1
 * @query pageSize - 每页数量，默认 20，最大 100
 * @returns { list: Venue[], total: number, page: number, pageSize: number }
 */
router.get('/', authMiddleware, async (req: Request, res: Response<ApiResponse<PaginatedResult<Venue>>>) => {
  try {
    const { status, page: pageStr = '1', pageSize: pageSizeStr = '20' } = req.query;
    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params: any[] = [];

    if (status && (status as string) !== '') {
      whereClause = 'WHERE status = $1';
      params.push(status);
    }

    const countResult = await queryOpOne<{ count: string }>(req, 
      `SELECT COUNT(*) as count FROM venues ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    const venues = await queryOp<any>(req, 
      `SELECT id, name, address, city, district, latitude, longitude, status,
              qrcode_url, checkin_radius_meters, max_queue_size,
              timeout_seconds, open_time, close_time, description, operator_id, created_at, updated_at
       FROM venues ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        list: venues,
        total,
        page,
        pageSize,
      },
    });
  } catch (error: any) {
    console.error('[Venues] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取赛场列表失败', data: null as any });
  }
});

/**
 * GET /api/v1/venues/:id
 * 获取赛场详情
 * @param id - 赛场 UUID
 * @returns Venue 完整信息
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<Venue>>) => {
  try {
    const { id } = req.params;

    const venue = await queryOpOne<any>(req, 
      `SELECT id, name, address, city, district, latitude, longitude, status,
              qrcode_url, checkin_radius_meters, max_queue_size,
              timeout_seconds, open_time, close_time, description, operator_id, created_at, updated_at
       FROM venues WHERE id = $1`,
      [id]
    );

    if (!venue) {
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null as any });
    }

    return res.json({ code: 0, message: 'ok', data: venue });
  } catch (error: any) {
    console.error('[Venues] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取赛场详情失败', data: null as any });
  }
});

/**
 * POST /api/v1/venues
 * 创建新赛场（需要 operator/admin 角色）
 * @header Authorization: Bearer <token>
 * @body name - 赛场名称（必填）
 * @body address - 地址
 * @body latitude - 纬度
 * @body longitude - 经度
 * @body open_time - 开门时间 HH:mm
 * @body close_time - 关门时间 HH:mm
 * @body checkin_radius_meters - 签到半径（米）
 * @body max_queue_size - 最大排队人数
 * @body timeout_seconds - 超时时间（秒）
 * @body description - 描述
 * @returns 创建的 Venue
 */
router.post('/', authMiddleware, async (req: Request, res: Response<ApiResponse<Venue>>) => {
  try {
    const body = req.body as CreateVenueParams & {
      checkin_radius_meters?: number;
      max_queue_size?: number;
      max_capacity?: number;
      timeout_seconds?: number;
      latitude?: number;
      longitude?: number;
      city?: string;
      district?: string;
    };

    // 前端传 max_capacity 时映射到 max_queue_size
    if ((body as any).max_capacity !== undefined && body.max_queue_size === undefined) {
      body.max_queue_size = (body as any).max_capacity;
    }

    if (!body.name) {
      return res.status(400).json({ code: 400, message: '赛场名称不能为空', data: null as any });
    }

    const id = uuidv4();
    // 读取系统默认分润比例
    const rateRow = await queryOne<{ value: string }>(
      `SELECT setting_value AS value FROM settings WHERE setting_key = 'default_profit_share_rate'`
    );
    const defaultRate = parseInt(rateRow?.value || '80', 10);

    // 获取 operator_id：优先从 req.user 的 JWT 中取，回退到 Redis
    const operatorId = (req.user as any)?.operatorId || '';

    await executeOp(req, 
      `INSERT INTO venues (id, name, address, latitude, longitude, status,
        checkin_radius_meters, max_queue_size, timeout_seconds,
        open_time, close_time, city, district, description, profit_share_rate, operator_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        body.name,
        body.address || '',
        body.latitude || null,
        body.longitude || null,
        VenueStatus.OPEN,
        body.checkin_radius_meters || 100,
        body.max_queue_size || 50,
        body.timeout_seconds || 300,
        body.open_time || '09:00:00',
        body.close_time || '21:00:00',
        body.city || '',
        body.district || '',
        body.description || null,
        defaultRate,
        operatorId,
      ]
    );
    const venue = await queryOpOne<Venue>(req, 
      `SELECT id, name, address, latitude, longitude, status,
              qrcode_url, checkin_radius_meters, max_queue_size,
              timeout_seconds, open_time, close_time, city, district,
              description, profit_share_rate, operator_id, created_at, updated_at
       FROM venues WHERE id = $1`,
      [id]
    );

    return res.status(201).json({ code: 0, message: '赛场创建成功', data: venue! });
  } catch (error: any) {
    console.error('[Venues] create error:', error.message);
    return res.status(500).json({ code: 500, message: '创建赛场失败', data: null as any });
  }
});

/**
 * PUT /api/v1/venues/:id
 * 更新赛场信息（需要 operator/admin 角色）
 * @param id - 赛场 UUID
 * @header Authorization: Bearer <token>
 * @body name - 名称
 * @body address - 地址
 * @body status - 状态: open | closed | maintenance
 * @body open_time - 开门时间
 * @body close_time - 关门时间
 * @body checkin_radius_meters - 签到半径
 * @body max_queue_size - 最大排队人数
 * @body timeout_seconds - 超时时间
 * @body description - 描述
 * @returns 更新后的 Venue
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<Venue>>) => {
  try {
    const { id } = req.params;
    const body: UpdateVenueParams & {
      address?: string;
      latitude?: number;
      longitude?: number;
      checkin_radius_meters?: number;
      max_queue_size?: number;
      timeout_seconds?: number;
      open_time?: string;
      close_time?: string;
      description?: string;
    } = req.body;

    // 检查赛场是否存在
    const existing = await queryOpOne<{ id: string }>(req, 
      'SELECT id FROM venues WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null as any });
    }

    // 构建动态 UPDATE 语句
    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    const allowedFields: Record<string, any> = {
      name: body.name,
      address: body.address,
      city: (body as any).city,
      district: (body as any).district,
      latitude: body.latitude,
      longitude: body.longitude,
      status: body.status,
      open_time: body.open_time,
      close_time: body.close_time,
      checkin_radius_meters: body.checkin_radius_meters,
      max_queue_size: body.max_queue_size,
      timeout_seconds: body.timeout_seconds,
      description: body.description,
    };

    for (const [key, val] of Object.entries(allowedFields)) {
      if (val !== undefined) {
        fields.push(`${key} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null as any });
    }

    // 始终更新 updated_at
    fields.push(`updated_at = $${paramIdx}`);
    values.push(new Date().toISOString());
    paramIdx++;

    values.push(id);

    await executeOp(req, 
      `UPDATE venues SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );
    const venue = await queryOpOne<Venue>(req, 
      `SELECT id, name, address, latitude, longitude, status,
              qrcode_url, checkin_radius_meters, max_queue_size,
              timeout_seconds, open_time, close_time, description, operator_id, created_at, updated_at
       FROM venues WHERE id = $1`,
      [id]
    );

    return res.json({ code: 0, message: '赛场更新成功', data: venue! });
  } catch (error: any) {
    console.error('[Venues] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新赛场失败', data: null as any });
  }
});

/**
 * PATCH /api/v1/venues/:id/status
 * 更新赛场状态（open/closed/maintenance）
 * @param id - 赛场 UUID
 * @header Authorization: Bearer <token>
 * @body status - open | closed | maintenance
 */
router.patch('/:id/status', authMiddleware, async (req: Request, res: Response<ApiResponse<null>>) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['open', 'closed', 'maintenance'].includes(status)) {
      return res.status(400).json({ code: 400, message: '无效的状态值', data: null });
    }

    const existing = await queryOpOne<{ id: string }>(req, 
      'SELECT id FROM venues WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null });
    }

    await queryOp(req, 
      `UPDATE venues SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, new Date().toISOString(), id]
    );

    return res.json({ code: 0, message: '赛场状态已更新', data: null });
  } catch (error: any) {
    console.error('[Venues] status update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新赛场状态失败', data: null });
  }
});

/**
 * DELETE /api/v1/venues/:id
 * 删除赛场（需要 admin 角色）
 * @param id - 赛场 UUID
 * @header Authorization: Bearer <token>
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<null>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    console.log('[Venues] delete request:', { id, role });

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可删除赛场', data: null });
    }

    const existing = await queryOpOne<{ id: string; name: string }>(req, 'SELECT id, name FROM venues WHERE id = $1', [id]);
    if (!existing) {
      console.log('[Venues] delete: venue not found:', id);
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null });
    }
    console.log('[Venues] deleting venue:', existing.name, id);

    // 先删除（或尝试删除）所有引用该 venue 的数据
    const tables = [
      'marketing_config',
      'race_records',
      'checkins',
      'race_results',
      'races',
    ];
    for (const table of tables) {
      try {
        const r = await execute(`DELETE FROM ${table} WHERE venue_id = $1`, [id]);
        console.log(`[Venues] delete from ${table}:`, r.changes, 'rows');
      } catch (e: any) {
        // 表可能不存在或列名不对，忽略
        console.log(`[Venues] skip ${table}:`, e.message);
      }
    }

    // 解绑裁判
    try {
      const r2 = await executeOp(req, 'UPDATE referees SET venue_id = NULL WHERE venue_id = $1', [id]);
      console.log('[Venues] unbind referees:', r2.changes, 'rows');
    } catch (e: any) {
      console.log('[Venues] skip unbind referees:', e.message);
    }

    // 最后删除赛场本身
    const result = await executeOp(req, 'DELETE FROM venues WHERE id = $1', [id]);
    console.log('[Venues] delete result:', result);

    if (!result.changes || result.changes === 0) {
      return res.json({ code: 404, message: '赛场不存在', data: null });
    }

    return res.json({ code: 0, message: '赛场已删除', data: null });
  } catch (error: any) {
    console.error('[Venues] delete error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '删除赛场失败', data: null });
  }
});

/**
 * GET /api/v1/venues/:id/referees
 * 获取绑定到指定赛场的所有裁判员列表
 */
router.get('/:id/referees', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const referees = await queryOp<any>(req, 
      'SELECT id, user_id, cert_status, phone, id_number, created_at, name FROM referees WHERE venue_id = $1',
      [id]
    );
    return res.json({ code: 0, message: 'ok', data: referees });
  } catch (error: any) {
    console.error('[Venues] get referees error:', error.message);
    return res.status(500).json({ code: 500, message: '获取裁判列表失败', data: null });
  }
});

/**
 * PUT /api/v1/venues/:id/referees
 * 绑定裁判员到赛场（覆盖式：传哪些裁判员就绑定哪些）
 * body: { referee_ids: string[] }
 */
router.put('/:id/referees', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { referee_ids } = req.body;

    if (!Array.isArray(referee_ids)) {
      return res.status(400).json({ code: 400, message: 'referee_ids 必须为数组', data: null });
    }

    // 解绑所有已绑定的裁判员
    await queryOp(req, 'UPDATE referees SET venue_id = NULL WHERE venue_id = $1', [id]);

    // 绑定新裁判员
    for (const refId of referee_ids) {
      await queryOp(req, 'UPDATE referees SET venue_id = $1 WHERE id = $2', [id, refId]);
    }

    return res.json({ code: 0, message: '裁判绑定成功', data: null });
  } catch (error: any) {
    console.error('[Venues] bind referees error:', error.message);
    return res.status(500).json({ code: 500, message: '绑定裁判失败', data: null });
  }
});

/**
 * GET /api/v1/venues/:id/qrcode
 * 生成赛场带参数小程序码
 *
 * 调用微信 getwxacodeunlimit API，scene 携带 operator_id + venue_id，
 * 用户扫码进入小程序后自动建立运营商上下文。
 *
 * 返回 base64 图片，前端可直接用 <img src="data:..."/> 预览。
 */
router.get('/:id/qrcode', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    
    // 优先从 JWT 获取 operatorId，回退到 Redis
    const operatorId = (req.user as any)?.operatorId || (await getOperatorContext(userId))?.operator_id;
    if (!operatorId) {
      return res.status(400).json({ code: 400, message: '无法获取运营商上下文', data: null });
    }

    const venue = await queryOpOne<{ id: string; name: string }>(req, 
      'SELECT id, name FROM venues WHERE id = $1', [id]
    );
    if (!venue) {
      return res.status(404).json({ code: 404, message: '赛场不存在', data: null });
    }

    const { imageBase64, contentType } = await createVenueMiniCode(operatorId, venue.id);

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        venueId: venue.id,
        venueName: venue.name,
        operatorId,
        imageBase64: `data:${contentType};base64,${imageBase64}`,
      },
    });
  } catch (error: any) {
    console.error('[Venues] qrcode error:', error.message);
    return res.status(500).json({
      code: 500,
      message: `生成小程序码失败: ${error.message}`,
      data: null,
    });
  }
});

export default router;
