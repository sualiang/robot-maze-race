import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import {
  ApiResponse,
  PaginatedResult,
  RacePackage,
  CreateRacePackageParams,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// Race Packages 路由 — 参赛包 CRUD + 礼券自动选配
// ============================================================

/** 参赛包数据库行格式 */
interface RacePackageRow {
  id: string;
  operator_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  standard_price_cents: number;
  tag: string;
  special_rights: string;
  growth_value: number;
  point_value: number;
  race_count: number;
  valid_days: number;
  status: string;
  sort_order: number;
  coupon_reward_min_cents: number;
  coupon_reward_max_cents: number;
  free_deduction_cents: number;
  created_at: string;
  updated_at: string;
}

/** 关联优惠券行 */
interface PackageCouponRow {
  id: string;
  package_id: string;
  coupon_id: string;
  denomination_cents: number;
  coupon_type: number;
  merchant_name: string;
  coupon_name: string;
}

/** 数据库行 → API 响应格式 */
function toRacePackage(row: RacePackageRow): any {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    price: row.price_cents / 100,
    standard_price_cents: row.standard_price_cents || 0,
    tag: row.tag || '',
    special_rights: row.special_rights || '',
    race_count: row.race_count,
    valid_days: row.valid_days,
    is_active: row.status === 'active',
    coupon_reward_min: row.coupon_reward_min_cents / 100,
    coupon_reward_max: row.coupon_reward_max_cents / 100,
    free_deduction_cents: row.free_deduction_cents || 0,
    growth_value: row.growth_value || 0,
    point_value: row.point_value || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * GET /api/v1/race-packages
 * 获取参赛包列表（公开接口）
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
      `SELECT COUNT(*) as count FROM race_packages ${whereClause}`, params
    );
    const total = parseInt(countResult?.count || '0', 10);

    const rows = await query<RacePackageRow>(
      `SELECT * FROM race_packages ${whereClause}
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
    return res.status(500).json({ code: 500, message: '获取失败', data: null as any });
  }
});

/**
 * GET /api/v1/race-packages/:id
 * 获取参赛包详情（含关联礼券）
 */
router.get('/:id', async (req: Request, res: Response<ApiResponse<any>>) => {
  try {
    const { id } = req.params;

    const row = await queryOne<RacePackageRow>(
      `SELECT * FROM race_packages WHERE id = $1`, [id]
    );

    if (!row) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    // 查关联礼券
    const coupons = await query<PackageCouponRow>(
      `SELECT * FROM race_package_coupons WHERE package_id = $1`, [id]
    );

    const pkg = toRacePackage(row);
    const couponList = (coupons || []).map((c) => ({
      id: c.id,
      couponId: c.coupon_id,
      denominationCents: c.denomination_cents,
      couponType: c.coupon_type,
      merchantName: c.merchant_name,
      couponName: c.coupon_name,
    }));

    const totalRewardValue = couponList.reduce((sum, c) => sum + c.denominationCents, 0);

    return res.json({
      code: 0,
      message: 'ok',
      data: { ...pkg, coupons: couponList, totalRewardValue },
    });
  } catch (error: any) {
    console.error('[RacePackages] get error:', error.message);
    return res.status(500).json({ code: 500, message: '获取详情失败', data: null as any });
  }
});

/**
 * POST /api/v1/race-packages
 * 创建参赛包
 */
router.post('/', authMiddleware, async (req: Request, res: Response<ApiResponse<RacePackage>>) => {
  try {
    const body = req.body as CreateRacePackageParams & {
      sort_order?: number;
      coupon_reward_min?: number;
      coupon_reward_max?: number;
      free_deduction_cents?: number;
    };
    const role = req.user!.role;

    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营人员可创建', data: null as any });
    }

    if (!body.name) {
      return res.status(400).json({ code: 400, message: '参赛包名称不能为空', data: null as any });
    }
    if (!body.price || body.price <= 0) {
      return res.status(400).json({ code: 400, message: '请填写有效的价格', data: null as any });
    }
    const raceCount = body.race_count && body.race_count > 0 ? body.race_count : 1;

    const id = uuidv4();
    const priceCents = Math.round(body.price * 100);
    const validDays = body.valid_days || 365;
    const sortOrder = body.sort_order || 0;

    const rewardMinCents = body.coupon_reward_min !== undefined ? Math.round(body.coupon_reward_min * 100) : 0;
    const rewardMaxCents = body.coupon_reward_max !== undefined ? Math.round(body.coupon_reward_max * 100) : 0;
    const freeDeductionCents = body.free_deduction_cents !== undefined ? body.free_deduction_cents : 0;

    // 新字段（通过 any 访问，body 类型为 CreateRacePackageParams 扩展）
    const b = body as any;
    const standardPriceCents = b.standardPriceCents !== undefined ? b.standardPriceCents : priceCents;
    const discountPriceCents = b.discountPriceCents !== undefined ? b.discountPriceCents : priceCents;
    const tag = b.tag || '';
    const specialRights = b.specialRights || '';
    const growthValue = b.growthValue || 0;
    const pointValue = b.pointValue || 0;

    const opId = req.user?.operatorId || '00000000-0000-0000-0000-000000000000';
    await execute(
      `INSERT INTO race_packages (id, operator_id, name, description, price_cents,
               standard_price_cents, discount_price_cents, tag, special_rights,
               growth_value, point_value,
               race_count, valid_days, status, sort_order,
               coupon_reward_min_cents, coupon_reward_max_cents, free_deduction_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [id, opId, body.name, body.description || null, priceCents,
       standardPriceCents, discountPriceCents, tag, specialRights,
       growthValue, pointValue,
       raceCount, validDays, 'active', sortOrder,
       rewardMinCents, rewardMaxCents, freeDeductionCents]
    );
    const row = await queryOne<RacePackageRow>('SELECT * FROM race_packages WHERE id = $1', [id]);
    const created = toRacePackage(row!);

    // 如果有礼券区间，自动匹配
    if (rewardMaxCents > 0) {
      try {
        await autoMatchCoupons(id, rewardMinCents, rewardMaxCents);
      } catch (matchErr) {
        console.warn('[RacePackages] auto-match failed (non-fatal):', matchErr);
      }
    }

    return res.status(201).json({ code: 0, message: '参赛包创建成功', data: created });
  } catch (error: any) {
    console.error('[RacePackages] create error:', error.message);
    return res.status(500).json({ code: 500, message: '创建失败', data: null as any });
  }
});

/**
 * PUT /api/v1/race-packages/:id
 * 更新参赛包
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<RacePackage>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '仅管理员或运营人员可编辑', data: null as any });
    }

    const existing = await queryOne<{ id: string }>('SELECT id FROM race_packages WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    const body = req.body as any;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    const excludeKeys = ['price', 'race_count', 'valid_days', 'is_active', 'coupon_reward_min', 'coupon_reward_max', 'free_deduction_cents',
      'standardPriceCents', 'tag', 'specialRights', 'growthValue', 'pointValue', 'discountPriceCents'];
    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined && !excludeKeys.includes(key)) {
        fields.push(`${key} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (body.is_active !== undefined) {
      fields.push(`status = $${paramIdx}`);
      values.push(body.is_active ? 'active' : 'inactive');
      paramIdx++;
    }
    if (body.price !== undefined) {
      fields.push(`price_cents = $${paramIdx}`);
      values.push(Math.round(body.price * 100));
      paramIdx++;
    }
    if (body.standardPriceCents !== undefined) {
      fields.push(`standard_price_cents = $${paramIdx}`);
      values.push(body.standardPriceCents);
      paramIdx++;
    }
    if (body.discountPriceCents !== undefined) {
      fields.push(`discount_price_cents = $${paramIdx}`);
      values.push(body.discountPriceCents);
      paramIdx++;
    }
    if (body.tag !== undefined) {
      fields.push(`tag = $${paramIdx}`);
      values.push(body.tag);
      paramIdx++;
    }
    if (body.specialRights !== undefined) {
      fields.push(`special_rights = $${paramIdx}`);
      values.push(body.specialRights);
      paramIdx++;
    }
    if (body.growthValue !== undefined) {
      fields.push(`growth_value = $${paramIdx}`);
      values.push(body.growthValue);
      paramIdx++;
    }
    if (body.pointValue !== undefined) {
      fields.push(`point_value = $${paramIdx}`);
      values.push(body.pointValue);
      paramIdx++;
    }
    if (body.race_count !== undefined) {
      fields.push(`race_count = $${paramIdx}`);
      values.push(body.race_count);
      paramIdx++;
    }
    if (body.valid_days !== undefined) {
      fields.push(`valid_days = $${paramIdx}`);
      values.push(body.valid_days);
      paramIdx++;
    }
    if (body.coupon_reward_min !== undefined) {
      fields.push(`coupon_reward_min_cents = $${paramIdx}`);
      values.push(Math.round(body.coupon_reward_min * 100));
      paramIdx++;
    }
    if (body.coupon_reward_max !== undefined) {
      fields.push(`coupon_reward_max_cents = $${paramIdx}`);
      values.push(Math.round(body.coupon_reward_max * 100));
      paramIdx++;
    }
    if (body.free_deduction_cents !== undefined) {
      fields.push(`free_deduction_cents = $${paramIdx}`);
      values.push(body.free_deduction_cents);
      paramIdx++;
    }
    if (body.status !== undefined) {
      if (!['active', 'inactive'].includes(body.status)) {
        return res.status(400).json({ code: 400, message: '状态值无效', data: null as any });
      }
      fields.push(`status = $${paramIdx}`);
      values.push(body.status);
      paramIdx++;
    }

    if (fields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有需要更新的字段', data: null as any });
    }

    fields.push(`updated_at = $${paramIdx++}`);
    values.push(new Date().toISOString());
    values.push(id);

    await execute(
      `UPDATE race_packages SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );
    const row = await queryOne<RacePackageRow>('SELECT * FROM race_packages WHERE id = $1', [id]);

    // 如果更新了礼券区间，重新匹配
    if (body.coupon_reward_min !== undefined || body.coupon_reward_max !== undefined) {
      const updated = await queryOne<RacePackageRow>('SELECT * FROM race_packages WHERE id = $1', [id]);
      if (updated && updated.coupon_reward_max_cents > 0) {
        try {
          await clearAndRematchCoupons(id, updated.coupon_reward_min_cents, updated.coupon_reward_max_cents);
        } catch (matchErr) {
          console.warn('[RacePackages] re-match failed:', matchErr);
        }
      }
    }

    return res.json({ code: 0, message: '更新成功', data: toRacePackage(row!) });
  } catch (error: any) {
    console.error('[RacePackages] update error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '更新失败', data: null as any });
  }
});

/**
 * POST /api/v1/race-packages/:id/match-coupons
 * 自动匹配礼券（预览，不保存）
 */
router.post('/:id/match-coupons', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pkg = await queryOne<RacePackageRow>('SELECT * FROM race_packages WHERE id = $1', [id]);
    if (!pkg) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    const minCents = pkg.coupon_reward_min_cents;
    const maxCents = pkg.coupon_reward_max_cents;
    if (maxCents <= 0) {
      return res.json({
        code: 0,
        data: { matched: [], totalValue: 0, message: '未设置礼券匹配区间' }
      });
    }

    const result = await doMatch(minCents, maxCents);
    return res.json({ code: 0, data: result });
  } catch (error: any) {
    console.error('[RacePackages] match error:', error.message);
    return res.status(500).json({ code: 500, message: '匹配失败', data: null as any });
  }
});

/**
 * POST /api/v1/race-packages/:id/save-matched-coupons
 * 手动触发保存匹配结果
 */
router.post('/:id/save-matched-coupons', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pkg = await queryOne<RacePackageRow>('SELECT * FROM race_packages WHERE id = $1', [id]);
    if (!pkg) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    const minCents = pkg.coupon_reward_min_cents;
    const maxCents = pkg.coupon_reward_max_cents;
    if (maxCents <= 0) {
      return res.json({ code: 400, message: '未设置礼券匹配区间', data: null });
    }

    await clearAndRematchCoupons(id, minCents, maxCents);

    const saved = await query<PackageCouponRow>(
      `SELECT rpc.*, mc.name as coupon_name, m.merchant_name as merchant_name
       FROM race_package_coupons rpc
       JOIN merchant_coupons mc ON rpc.coupon_id = mc.id
       JOIN merchants m ON mc.merchant_id = m.id
       WHERE rpc.package_id = $1`, [id]
    );

    const totalVal = (saved || []).reduce((s, c) => s + c.denomination_cents, 0);

    return res.json({
      code: 0,
      data: {
        saved: (saved || []).map((c) => ({
          id: c.id, couponId: c.coupon_id,
          denominationCents: c.denomination_cents,
          couponType: c.coupon_type,
          merchantName: c.merchant_name,
          couponName: c.coupon_name,
        })),
        totalValue: totalVal,
      }
    });
  } catch (error: any) {
    console.error('[RacePackages] save-matched error:', error.message);
    return res.status(500).json({ code: 500, message: '保存失败', data: null as any });
  }
});

/**
 * DELETE /api/v1/race-packages/:id
 * 真删除参赛包
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<null>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '无权限', data: null });
    }

    console.log('[RacePackages] delete request:', id);

    const existing = await queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM race_packages WHERE id = $1', [id]
    );
    if (!existing) {
      console.log('[RacePackages] delete: not found');
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null });
    }
    console.log('[RacePackages] deleting:', existing.name, id);

    // 先删除关联表数据（容错处理）
    try {
      const r1 = await execute(`DELETE FROM race_package_coupons WHERE package_id = $1`, [id]);
      console.log('[RacePackages] delete race_package_coupons:', r1.changes, 'rows');
    } catch (e: any) {
      console.log('[RacePackages] skip race_package_coupons:', e.message);
    }

    // 删除参赛包本身
    const result = await execute(`DELETE FROM race_packages WHERE id = $1`, [id]);
    console.log('[RacePackages] delete result:', result.changes, 'rows');

    return res.json({ code: 0, message: '已删除', data: null });
  } catch (error: any) {
    console.error('[RacePackages] delete error:', error.message, error.stack);
    return res.status(500).json({ code: 500, message: '删除失败: ' + error.message, data: null });
  }
});

/**
 * PATCH /api/v1/race-packages/:id
 */
router.patch('/:id', authMiddleware, async (req: Request, res: Response<ApiResponse<RacePackage>>) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;
    if (role !== 'admin' && role !== 'operator') {
      return res.status(403).json({ code: 403, message: '无权限', data: null as any });
    }

    const existing = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM race_packages WHERE id = $1', [id]
    );
    if (!existing) {
      return res.status(404).json({ code: 404, message: '参赛包不存在', data: null as any });
    }

    const { is_active } = req.body as { is_active?: boolean };
    if (is_active !== undefined) {
      const newStatus = is_active ? 'active' : 'inactive';
      await query(`UPDATE race_packages SET status = $1, updated_at = $2 WHERE id = $3`,
        [newStatus, new Date().toISOString(), id]);

      const row = await queryOne<RacePackageRow>('SELECT * FROM race_packages WHERE id = $1', [id]);
      return res.json({ code: 0, message: is_active ? '已上架' : '已下架', data: toRacePackage(row!) });
    }

    return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null as any });
  } catch (error: any) {
    console.error('[RacePackages] patch error:', error.message);
    return res.status(500).json({ code: 500, message: '操作失败', data: null as any });
  }
});

// ============================================================
// 自动匹配算法
// ============================================================

/**
 * 自动匹配礼券（背包变种）
 * 从所有可用的券池中选出总面值在 [minCents, maxCents] 区间的组合
 * 优先跨商家、跨类型
 */
async function doMatch(minCents: number, maxCents: number): Promise<{
  matched: any[];
  totalValue: number;
  message: string;
}> {
  // 取所有已上架、审核通过、剩余库存>0的券，附带商家名
  const allCoupons = await query<any>(`
    SELECT mc.id, mc.name, mc.denomination_cents, mc.coupon_type,
           mc.remain_count, mc.merchant_id, m.merchant_name as merchant_name
    FROM merchant_coupons mc
    JOIN merchants m ON mc.merchant_id = m.id
    WHERE mc.audit_status = 2
      AND mc.status = 1
      AND mc.remain_count > 0
    ORDER BY mc.denomination_cents DESC
  `);

  if (!allCoupons || allCoupons.length === 0) {
    return { matched: [], totalValue: 0, message: '当前没有可用的礼券' };
  }

  // 贪心 + 回溯：先尝试大面值，尽量接近 maxCents
  const selected: any[] = [];
  let currentSum = 0;

  // 先排序：大面值优先
  const sorted = [...allCoupons].sort((a, b) => b.denomination_cents - a.denomination_cents);

  // 如果单张最大面值超过区间上限，取最接近上限的单张
  if (sorted[0].denomination_cents >= minCents && sorted[0].denomination_cents <= maxCents) {
    // 直接用最大的
    selected.push({
      couponId: sorted[0].id,
      couponName: sorted[0].name,
      merchantName: sorted[0].merchant_name,
      denominationCents: sorted[0].denomination_cents,
      couponType: sorted[0].coupon_type,
    });
    currentSum = sorted[0].denomination_cents;
  } else {
    // 多张组合：贪心选大面值，直到接近 maxCents 或超过上限
    let remaining = maxCents;
    for (const c of sorted) {
      if (c.denomination_cents > remaining) continue; // 超过剩余额度，跳过
      selected.push({
        couponId: c.id,
        couponName: c.name,
        merchantName: c.merchant_name,
        denominationCents: c.denomination_cents,
        couponType: c.coupon_type,
      });
      currentSum += c.denomination_cents;
      remaining -= c.denomination_cents;
      if (remaining <= 0) break;
    }
  }

  // 检查是否达到下限
  if (currentSum < minCents) {
    // 没达到下限，尝试再加一张小的
    for (const c of allCoupons) {
      if (selected.find((s) => s.couponId === c.id)) continue;
      const newSum = currentSum + c.denomination_cents;
      if (newSum >= minCents && newSum <= maxCents) {
        selected.push({
          couponId: c.id,
          couponName: c.name,
          merchantName: c.merchant_name,
          denominationCents: c.denomination_cents,
          couponType: c.coupon_type,
        });
        currentSum = newSum;
        break;
      }
    }
  }

  if (selected.length === 0) {
    return { matched: [], totalValue: 0, message: '无法匹配到符合区间礼券，请调整区间或补充券' };
  }

  const msg = currentSum >= minCents && currentSum <= maxCents
    ? '匹配成功'
    : `当前组合总价值 ¥${(currentSum / 100).toFixed(2)}未达到区间上限，建议调整区间或补充券`;

  return { matched: selected, totalValue: currentSum, message: msg };
}

/**
 * 清除旧匹配 + 重新匹配并保存
 */
async function clearAndRematchCoupons(packageId: string, minCents: number, maxCents: number) {
  // 删除旧的匹配
  await execute(`DELETE FROM race_package_coupons WHERE package_id = $1`, [packageId]);
  // 重新匹配
  await autoMatchCoupons(packageId, minCents, maxCents);
}

/**
 * 匹配并保存到 race_package_coupons
 */
async function autoMatchCoupons(packageId: string, minCents: number, maxCents: number) {
  const result = await doMatch(minCents, maxCents);
  if (result.matched.length === 0) return;

  for (const m of result.matched) {
    const id = uuidv4();
    await execute(
      `INSERT INTO race_package_coupons (id, package_id, coupon_id, denomination_cents, coupon_type, merchant_name, coupon_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, packageId, m.couponId, m.denominationCents, m.couponType, m.merchantName, m.couponName]
    );
  }
}

export default router;
