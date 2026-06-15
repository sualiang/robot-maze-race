import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import {
  ApiResponse,
  PaginatedResult,
  RacePackage,
  CreateRacePackageParams,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// Race Packages 路由 — 参赛包 CRUD
// ============================================================

/** 参赛包数据库行格式 */
interface RacePackageRow {
  id: string;
  operator_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  race_count: number;
  valid_days: number;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 数据库行 → API 响应格式 */
function toRacePackage(row: RacePackageRow): RacePackage {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    price: row.price_cents / 100,
    race_count: row.race_count,
    valid_days: row.valid_days,
    is_active: row.status === 'active',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * GET /api/v1/race-packages
 * 获取参赛包列表（公开接口，用户选购参赛包）
 * @query status - 筛选状态: active | inactive（默认 active）
 * @query page - 页码，默认 1
 * @query pageSize - 每页数量，默认 20
 * @returns PaginatedResult<RacePackage>
 */
router.get('/', async (req: Request, res: Response<ApiResponse<PaginatedResult<RacePackage>>>) => {
  try {
    const {
      status = 'active',
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params: any[] = [];

    if (status && (status as string) !== '') {
      whereClause = 'WHERE status = $1';
      params.push(status);
    }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM race_packages ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    const rows = await query<RacePackageRow>(
      `SELECT id, name, description, price_cents, race_count,
              valid_days, status, sort_order, created_at, updated_at
       FROM race_packages ${whereClause}
       ORDER BY sort_order ASC, created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const list = rows.map(toRacePackage);

    return res.json({
      code: 0,
      message: 'ok',
      data: { list, total, page, pageSize },
    });
  } catch (error: any) {
    console.error('[RacePackages] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取参赛包列表失败', data: null as any });
  }
});

/**
 * GET /api/v1/race-packages/:id
 * 获取参赛包详情
 * @param id - 参赛包 UUID
 * @returns RacePackage
 */
router.get('/:id', async (req: Request, res: Response<ApiResponse<RacePackage>>) => {
  try {
    const { id } = req.params;

    const row = await queryOne<RacePackageRow>(
      `SELECT id, name, description, price_cents, race_count,
              valid_days, status, sort_order, created_at, updated_at
       FROM race_packages WHERE id = $1`,
      [id]
    );

    if (!row) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    return res.json({ code: 0, message: 'ok', data: toRacePackage(row) });
  } catch (error: any) {
    console.error('[RacePackages] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取参赛包详情失败', data: null as any });
  }
});

/**
 * POST /api/v1/race-packages
 * 创建参赛包（admin/operator 专用）
 * @header Authorization: Bearer <token>
 * @body name - 参赛包名称（必填）
 * @body description - 描述
 * @body price - 价格（元），内部会转换为分存储
 * @body race_count - 可参赛次数
 * @body valid_days - 有效天数
 * @body sort_order - 排序序号
 * @returns 创建的 RacePackage
 */
router.post('/', authMiddleware, async (req: Request, res: Response<ApiResponse<RacePackage>>) => {
  try {
    const body = req.body as CreateRacePackageParams & { sort_order?: number };
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营人员可创建参赛包', data: null as any });
    }

    if (!body.name) {
      return res.status(400).json({ code: 400, message: '参赛包名称不能为空', data: null as any });
    }

    if (!body.price || body.price <= 0) {
      return res.status(400).json({ code: 400, message: '请填写有效的价格', data: null as any });
    }

    if (!body.race_count || body.race_count <= 0) {
      return res.status(400).json({ code: 400, message: '请填写有效的参赛次数', data: null as any });
    }

    const id = uuidv4();
    const priceCents = Math.round(body.price * 100); // 元转分
    const validDays = body.valid_days || 365;
    const sortOrder = body.sort_order || 0;

    const opId = req.user?.operatorId || '00000000-0000-0000-0000-000000000000';
    const row = await queryOne<RacePackageRow>(
      `INSERT INTO race_packages (id, operator_id, name, description, price_cents,
               race_count, valid_days, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, operator_id, name, description, price_cents, race_count,
                 valid_days, status, sort_order, created_at, updated_at`,
      [
        id,
        opId,
        body.name,
        body.description || null,
        priceCents,
        body.race_count,
        validDays,
        'active',
        sortOrder,
      ]
    );

    return res.status(201).json({
      code: 0,
      message: '参赛包创建成功',
      data: toRacePackage(row!),
    });
  } catch (error: any) {
    console.error('[RacePackages] create error:', error.message);
    return res.status(500).json({ code: 500, message: '创建参赛包失败', data: null as any });
  }
});

/**
 * PUT /api/v1/race-packages/:id
 * 更新参赛包（admin/operator 专用）
 * @param id - 参赛包 UUID
 * @header Authorization: Bearer <token>
 * @body name - 名称
 * @body description - 描述
 * @body price - 价格（元）
 * @body race_count - 可参赛次数
 * @body valid_days - 有效天数
 * @body status - 状态: active | inactive
 * @body sort_order - 排序序号
 * @returns 更新后的 RacePackage
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<RacePackage>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营人员可编辑参赛包', data: null as any });
    }

    // 检查参赛包是否存在
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM race_packages WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    // 构建动态更新
    const body = req.body as {
      name?: string;
      description?: string;
      price?: number;
      race_count?: number;
      valid_days?: number;
      status?: string;
      sort_order?: number;
      is_active?: boolean;
    };

    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    // 处理普通字段（排除特殊字段和 is_active，它映射到 status）
    const excludeKeys = ['price', 'race_count', 'valid_days', 'is_active'];
    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined && !excludeKeys.includes(key)) {
        fields.push(`${key} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    // is_active → status 映射
    if (body.is_active !== undefined) {
      fields.push(`status = $${paramIdx}`);
      values.push(body.is_active ? 'active' : 'inactive');
      paramIdx++;
    }

    // 价格：元转分
    if (body.price !== undefined) {
      fields.push(`price_cents = $${paramIdx}`);
      values.push(Math.round(body.price * 100));
      paramIdx++;
    }

    // 参赛次数
    if (body.race_count !== undefined) {
      fields.push(`race_count = $${paramIdx}`);
      values.push(body.race_count);
      paramIdx++;
    }

    // 有效天数
    if (body.valid_days !== undefined) {
      fields.push(`valid_days = $${paramIdx}`);
      values.push(body.valid_days);
      paramIdx++;
    }

    // 状态
    if (body.status !== undefined) {
      if (!['active', 'inactive'].includes(body.status)) {
        return res.status(400).json({
          code: 400,
          message: '状态值无效，请使用 active 或 inactive',
          data: null as any,
        });
      }
      fields.push(`status = $${paramIdx}`);
      values.push(body.status);
      paramIdx++;
    }

    if (fields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null as any });
    }

    fields.push(`updated_at = $${paramIdx}`);
    values.push(new Date().toISOString());
    paramIdx++;

    values.push(id);

    const row = await queryOne<RacePackageRow>(
      `UPDATE race_packages SET ${fields.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, name, description, price_cents, race_count,
                 valid_days, status, sort_order, created_at, updated_at`,
      values
    );

    return res.json({ code: 0, message: '参赛包更新成功', data: toRacePackage(row!) });
  } catch (error: any) {
    console.error('[RacePackages] update error:', error.message);
    return res.status(500).json({ code: 500, message: '更新参赛包失败', data: null as any });
  }
});

/**
 * DELETE /api/v1/race-packages/:id
 * 删除参赛包（软删除：设为 inactive）（admin 专用）
 * @param id - 参赛包 UUID
 * @header Authorization: Bearer <token>
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<null>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营商可删除参赛包', data: null });
    }

    // 软删除：将状态设为 inactive
    const result = await queryOne<{ id: string }>(
      `UPDATE race_packages SET status = 'inactive', updated_at = $1
       WHERE id = $2 RETURNING id`,
      [new Date().toISOString(), id]
    );

    if (!result) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null });
    }

    return res.json({ code: 0, message: '参赛包已下架', data: null });
  } catch (error: any) {
    console.error('[RacePackages] delete error:', error.message);
    return res.status(500).json({ code: 500, message: '删除参赛包失败', data: null });
  }
});

/**
 * PATCH /api/v1/race-packages/:id
 * 部分更新参赛包（切换上架/下架状态等）
 * @param id - 参赛包 UUID
 * @body is_active - 是否上架
 */
router.patch('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<RacePackage>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营人员可操作', data: null as any });
    }

    const existing = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM race_packages WHERE id = $1',
      [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    const { is_active } = req.body as { is_active?: boolean };

    if (is_active !== undefined) {
      const newStatus = is_active ? 'active' : 'inactive';
      await query(
        `UPDATE race_packages SET status = $1, updated_at = $2 WHERE id = $3`,
        [newStatus, new Date().toISOString(), id]
      );

      const row = await queryOne<RacePackageRow>(
        `SELECT id, name, description, price_cents, race_count,
                valid_days, status, sort_order, created_at, updated_at
         FROM race_packages WHERE id = $1`,
        [id]
      );

      return res.json({
        code: 0,
        message: is_active ? '参赛包已上架' : '参赛包已下架',
        data: toRacePackage(row!),
      });
    }

    return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null as any });
  } catch (error: any) {
    console.error('[RacePackages] patch error:', error.message);
    return res.status(500).json({ code: 500, message: '操作失败', data: null as any });
  }
});

export default router;
