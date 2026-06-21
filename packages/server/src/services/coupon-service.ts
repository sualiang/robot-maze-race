import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database';

/**
 * 购包算法自动配消费券
 *
 * 用户在支付成功后，调用此函数从券池自动挑选消费券组合并发放到用户账户。
 *
 * 算法逻辑：
 * 1. 读取参赛包配置的 coupon_reward_max_cents 作为目标总面额
 * 2. 从 merchant_coupons 筛选状态为已启用+已审核、remain_count>0 的券
 * 3. 优先挑选不同商家的券（尽量覆盖更多商家）
 * 4. 券的组合总面额尽量接近但不超过目标面额
 * 5. 优先选即将过期的券（快到 valid_end 的）
 *
 * @param userId 用户 ID
 * @param orderId 订单 ID
 * @param packageId 参赛包 ID
 */
export async function autoAssignMerchantCoupons(
  userId: string,
  orderId: string,
  packageId: string
): Promise<{ grantedCount: number; totalCents: number; merchantCount: number }> {
  // 读取参赛包配置的目标总面额
  const pkg = await queryOne<{
    id: string;
    name: string;
    coupon_reward_max_cents: number;
    coupon_reward_min_cents: number;
  }>(
    `SELECT id, name, coupon_reward_min_cents, coupon_reward_max_cents
     FROM race_packages WHERE id = $1`,
    [packageId]
  );

  if (!pkg) {
    console.warn(`[CouponService] 参赛包不存在: ${packageId}`);
    return { grantedCount: 0, totalCents: 0, merchantCount: 0 };
  }

  let targetCents = pkg.coupon_reward_max_cents || 0;
  const minCents = pkg.coupon_reward_min_cents || 0;

  // 降级方案：如果没有配置 reward_max，使用旧方案基于价格的默认值
  if (targetCents <= 0) {
    // 看看能否从标准价推断档位
    const pkgFull = await queryOne<{ price_cents: number; standard_price_cents: number }>(
      `SELECT price_cents, standard_price_cents FROM race_packages WHERE id = $1`,
      [packageId]
    );
    const price = pkgFull?.price_cents || 0;
    if (price >= 19900) {
      targetCents = 40000; // 专业包
    } else if (price >= 9900) {
      targetCents = 18000; // 标准包
    } else if (price > 0) {
      targetCents = 6000;  // 基础包
    }
  }

  if (targetCents <= 0) {
    console.warn(`[CouponService] 参赛包 ${packageId} 未配置券目标面额`);
    return { grantedCount: 0, totalCents: 0, merchantCount: 0 };
  }

  console.log(`[CouponService] 开始自动配券: userId=${userId}, packageId=${packageId}, targetCents=${targetCents}`);

  try {
    // 获取所有已上架、审核通过、有库存的券，附带商家名和过期时间
    const allCoupons = await query<any>(
      `SELECT c.id, c.merchant_id, c.name, c.description, c.denomination_cents,
              c.coupon_type, c.min_consume_cents, c.valid_start, c.valid_end,
              m.merchant_name
       FROM merchant_coupons c
       JOIN merchants m ON c.merchant_id = m.id
       WHERE c.audit_status = 2
         AND c.status = 1
         AND c.remain_count > 0
         AND c.denomination_cents > 0
       ORDER BY c.denomination_cents ASC`,
      []
    );

    if (!allCoupons || allCoupons.length === 0) {
      console.log(`[CouponService] 券池无可用券`);
      return { grantedCount: 0, totalCents: 0, merchantCount: 0 };
    }

    // 选券算法
    const selectedCoupons = await selectCoupons(allCoupons, targetCents, minCents);

    if (selectedCoupons.length === 0) {
      console.log(`[CouponService] 无法匹配到符合目标的券组合`);
      return { grantedCount: 0, totalCents: 0, merchantCount: 0 };
    }

    // 发放券到用户账户
    const validEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    let grantedCount = 0;
    let totalCentsGranted = 0;
    const usedMerchantIds = new Set<string>();

    for (const coupon of selectedCoupons) {
      // 扣减库存（乐观锁）
      const updateResult = await execute(
        `UPDATE merchant_coupons SET remain_count = remain_count - 1, updated_at = datetime('now')
         WHERE id = $1 AND remain_count > 0`,
        [coupon.id]
      );

      if ((updateResult?.changes || 0) === 0) {
        // 库存已被抢走，跳过
        continue;
      }

      // 插入用户券记录
      const userCouponId = uuidv4();
      const extraData = JSON.stringify({
        source: 'purchase_merchant_gift',
        package_id: packageId,
        order_id: orderId,
        original_merchant_coupon_id: coupon.id,
      });

      await execute(
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
                denomination_cents, min_consume_cents, status, valid_start, valid_end,
                coupon_type, extra_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, datetime('now'), datetime('now'))`,
        [
          userCouponId, userId, coupon.id, coupon.merchant_id,
          coupon.name, coupon.description || '',
          coupon.denomination_cents, coupon.min_consume_cents || 0,
          1, new Date().toISOString(), validEnd,
          coupon.coupon_type, extraData,
        ]
      );

      grantedCount++;
      totalCentsGranted += coupon.denomination_cents;
      usedMerchantIds.add(coupon.merchant_id);
    }

    console.log(
      `[CouponService] 配券完成: 共${grantedCount}张，总面额${totalCentsGranted}分（目标${targetCents}分），覆盖${usedMerchantIds.size}家商家`
    );

    return { grantedCount, totalCents: totalCentsGranted, merchantCount: usedMerchantIds.size };
  } catch (e: any) {
    console.error('[CouponService] autoAssignMerchantCoupons error:', e?.message || e);
    return { grantedCount: 0, totalCents: 0, merchantCount: 0 };
  }
}

/**
 * 选券算法核心
 *
 * 策略：
 * 1. 优先挑选不同商家的券（轮询各商家）
 * 2. 券的组合总面额尽量接近但不超过目标面额
 * 3. 优先选即将过期的券
 */
async function selectCoupons(
  pool: any[],
  targetCents: number,
  minCents: number
): Promise<any[]> {
  const selected: any[] = [];
  let remaining = targetCents;
  const usedMerchantIds = new Set<string>();

  // 按商家分组
  const merchantGroups = new Map<string, any[]>();
  for (const c of pool) {
    if (!merchantGroups.has(c.merchant_id)) {
      merchantGroups.set(c.merchant_id, []);
    }
    merchantGroups.get(c.merchant_id)!.push(c);
  }

  // 每家券按过期时间排序（即将过期优先），再按面额升序
  for (const [, coupons] of merchantGroups) {
    coupons.sort((a, b) => {
      // 先按过期时间排序（即将过期的靠前）
      const aEnd = a.valid_end ? new Date(a.valid_end).getTime() : Infinity;
      const bEnd = b.valid_end ? new Date(b.valid_end).getTime() : Infinity;
      if (aEnd !== bEnd) return aEnd - bEnd;
      // 再按面额升序
      return a.denomination_cents - b.denomination_cents;
    });
  }

  // 第一轮：轮询各商家，每家选一张
  let changed = true;
  while (changed) {
    changed = false;
    for (const [merchantId, coupons] of merchantGroups) {
      if (remaining <= 0) break;
      // 找第一张 <= remaining 且未入选的
      const usable = coupons.filter(
        (c: any) => !selected.some((s) => s.id === c.id) && c.denomination_cents <= remaining
      );
      // 在可用券中选择面额最大的（尽量接近目标）
      usable.sort((a, b) => b.denomination_cents - a.denomination_cents);
      if (usable.length > 0) {
        const pick = usable[0];
        selected.push(pick);
        usedMerchantIds.add(merchantId);
        remaining -= pick.denomination_cents;
        changed = true;
      }
    }
  }

  // 第二轮：如果还有剩余，从任何商家选最大的不超限券
  if (remaining > 0) {
    const poolLeft = pool
      .filter((c: any) => !selected.some((s) => s.id === c.id) && c.denomination_cents <= remaining)
      .sort((a, b) => b.denomination_cents - a.denomination_cents); // 降序，尽量接近
    for (const c of poolLeft) {
      if (remaining <= 0) break;
      selected.push(c);
      usedMerchantIds.add(c.merchant_id);
      remaining -= c.denomination_cents;
    }
  }

  // 第三轮：如果剩余 < 500 分，允许超一点（补最小面额券）
  if (remaining > 0 && remaining < 500) {
    const smallest = pool.find(
      (c: any) => !selected.some((s) => s.id === c.id) && c.denomination_cents > 0
    );
    if (smallest) {
      // 检查补上后是否会超出 minCents（如果目标在范围内）
      const newRemaining = remaining - smallest.denomination_cents;
      const totalSelected = targetCents - remaining;
      if (totalSelected > 0 || newRemaining < 0 || minCents <= 0) {
        // 允许超一点
        selected.push(smallest);
        usedMerchantIds.add(smallest.merchant_id);
        remaining -= smallest.denomination_cents;
      }
    }
  }

  return selected;
}

/**
 * 积分商城发放兑换券到用户账户（通用函数）
 *
 * @param userId 用户 ID
 * @param couponType 券类型（20=参赛抵扣卡）
 * @param denominationCents 券面额（分）
 * @param name 券名称
 * @param description 券描述
 * @param validDays 有效天数
 * @returns 创建的 user_coupon ID
 */
export async function grantExchangeCoupon(
  userId: string,
  couponType: number,
  denominationCents: number,
  name: string,
  description: string,
  validDays: number = 180,
  extraData?: Record<string, any>
): Promise<string> {
  const id = uuidv4();
  const extraJson = JSON.stringify(extraData || {});

  await execute(
    `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, name, description,
            denomination_cents, min_consume_cents, status, valid_start, valid_end,
            coupon_type, extra_data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, datetime('now'), datetime('now'))`,
    [
      id, userId, 'point_shop_' + id, 'platform', name, description,
      denominationCents, 0, 1, new Date().toISOString(),
      new Date(Date.now() + validDays * 86400000).toISOString(),
      couponType, extraJson,
    ]
  );

  return id;
}
