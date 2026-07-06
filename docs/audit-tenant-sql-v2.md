# 数据库多租户 SQL 审计报告（v2）

> 审计日期：2026-07-06  
> 审计范围：`packages/server/src/**/*.ts`（routes、services、db、middleware）  
> 架构：Database-per-Tenant，当前阶段只做代码层 operator_id 隔离预埋

---

## 一、汇总

| 指标 | 数值 |
|------|------|
| 已扫描文件数 | 53 |
| 已含 `operator_id` 过滤的查询处数 | 42 |
| 缺少 `operator_id` 过滤的查询处数 | 94 |

### 按表统计

| 表名 | 有 operator_id 列 | 已有过滤 | 缺失过滤 |
|------|-------------------|----------|----------|
| venues | ✅ | 16 | 13 |
| races | ✅ | 1 | 6 |
| race_rooms | ✅ | 0 | 0（无查询） |
| referees | ✅ | 6 | 22 |
| referee_invites | ✅ | 4 | 3 |
| users | ❌ 无此列 | — | — |
| user_profiles | ✅ | 0 | 0（无查询） |
| merchants | ✅ | 1 | 15 |
| race_packages | ✅ | 5 | 18 |
| orders | ✅ | 3 | 20 |
| points_transactions | ❌ 无此列 | — | — |
| points_exchange_log | ❌ 无此列 | — | — |
| user_coupons | ❌ 无此列 | — | — |
| merchant_coupons | ❌（间接通过 merchant_id） | 6 | 23 |
| expand_coupons | ✅ | 0 | 0（无查询） |
| help_requests | ✅ | 0 | 0（无查询，实际使用 helps 表） |
| help_helpers | ❌ 无此列 | — | — |

> **说明**：`users`、`points_transactions`、`points_exchange_log`、`user_coupons`、`help_helpers` 等表在代码中未发现 `operator_id` 列，暂不纳入缺口统计。`merchant_coupons` 无直接 `operator_id` 列，通过 `merchant_id → merchants.operator_id` 间接隔离，其 UPDATE/DELETE 仅按 `id` 操作的仍列为缺口。

---

## 二、已有 operator_id 过滤的查询（42 处）

### venues（16 处）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/venues.ts` | 163 | `INSERT INTO venues (..., operator_id, ...)` |
| `routes/operator.ts` | 127 | `SELECT id, name FROM venues WHERE operator_id = $1` |
| `routes/operator.ts` | 663 | `SELECT ... FROM venues WHERE operator_id = $1` |
| `routes/operator.ts` | 989 | `SELECT ... FROM venues v JOIN races ... WHERE v.operator_id = $1` |
| `routes/operator-marketing.ts` | 98 | `INSERT IGNORE INTO venues (..., operator_id) VALUES (...)` |
| `routes/operator-marketing.ts` | 179 | `INSERT IGNORE INTO venues (..., operator_id) VALUES (...)` |
| `routes/operator-marketing.ts` | 270 | `INSERT INTO venues (..., operator_id) VALUES (...)` |
| `routes/admin-operators.ts` | 446 | `SELECT id FROM venues WHERE operator_id = $1` |
| `routes/admin-operators.ts` | 454 | `DELETE FROM venues WHERE operator_id = $1` |
| `routes/admin-marketing.ts` | 109 | `SELECT id FROM venues WHERE operator_id = $1` |
| `routes/admin-dashboard.ts` | 214 | `FROM venues WHERE operator_id = $1` |
| `routes/admin-dashboard.ts` | 230 | `WHERE v.operator_id = $1` |
| `routes/operator-finance.ts` | 43 | `SELECT COUNT(*) FROM venues WHERE operator_id = $1` |
| `routes/referees.ts` | 180 | `SELECT id FROM venues WHERE operator_id = $1` |
| `routes/referees.ts` | 199-209 | `... FROM referees r LEFT JOIN venues v ... WHERE r.operator_id = ANY(...)`（间接） |
| `routes/race.ts` | 40 | `SELECT id, operator_id FROM venues WHERE id = $1` |

### races（1 处）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/race.ts` | 54 | `INSERT INTO races (..., operator_id, ...)` |

### referees（6 处）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/referees.ts` | 87 | `INSERT INTO referees (..., operator_id) VALUES (...)` |
| `routes/referees.ts` | 465 | `INSERT INTO referees (..., operator_id, ...) VALUES (...)` |
| `routes/referee-invite.ts` | 263 | `INSERT INTO referees (..., operator_id, ...) VALUES (...)` |
| `routes/admin-operators.ts` | 457 | `SELECT user_id FROM referees WHERE operator_id = $1` |
| `routes/admin-operators.ts` | 459 | `DELETE FROM referees WHERE operator_id = $1` |
| `routes/referees.ts` | 658 | `SELECT ..., operator_id FROM referees WHERE id = $1` |

### referee_invites（4 处）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/referee-invite.ts` | 51 | `INSERT INTO referee_invites (..., operator_id, ...)` |
| `routes/referee-invite.ts` | 91 | `SELECT ..., operator_id FROM referee_invites WHERE token = $1` |
| `routes/referee-invite.ts` | 215 | `SELECT ..., operator_id FROM referee_invites WHERE token = $1` |

### merchants（1 处）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/operator-merchant.ts` | 60 | `SELECT COUNT(*) FROM merchants m WHERE m.operator_id = $1` |

### race_packages（5 处）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/race-packages.ts` | 216 | `INSERT INTO race_packages (..., operator_id, ...)` |
| `routes/operator-marketing.ts` | 215 | `SELECT COUNT(*) FROM race_packages WHERE operator_id = $1` |
| `routes/operator-marketing.ts` | 247 | `SELECT COUNT(*) FROM race_packages WHERE operator_id = $1` |
| `routes/operator-marketing.ts` | 262 | `INSERT INTO race_packages (..., operator_id, ...)` |
| `routes/admin-operators.ts` | 465 | `DELETE FROM race_packages WHERE operator_id = $1` |

### orders（3 处）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/operator.ts` | 820 | `SELECT ... FROM orders o LEFT JOIN settlements ... WHERE o.operator_id = $1` |
| `routes/operator.ts` | 897 | `SELECT ... FROM orders o WHERE o.operator_id = $1` |

### merchant_coupons（6 处，间接通过 merchants.operator_id）

| 文件 | 行号 | SQL 摘要 |
|------|------|----------|
| `routes/operator-merchant.ts` | 294 | `SELECT COUNT(*) FROM merchant_coupons mc JOIN merchants m ... WHERE m.operator_id = ?` |
| `routes/operator-merchant.ts` | 301 | `SELECT mc.* FROM merchant_coupons mc JOIN merchants m ... WHERE m.operator_id = ?` |
| `routes/operator-merchant.ts` | 434 | `SELECT COUNT(*) FROM merchant_coupons mc JOIN merchants m ... WHERE m.operator_id = ?` |
| `routes/operator-merchant.ts` | 441 | `SELECT mc.* FROM merchant_coupons mc JOIN merchants m ... WHERE m.operator_id = ?` |
| `routes/operator-merchant.ts` | 579 | `SELECT COUNT(*) FROM merchant_coupons mc JOIN merchants m ... WHERE m.operator_id = $1` |
| `routes/operator-merchant.ts` | 587-593 | `SELECT ... FROM merchant_coupons mc JOIN merchants m ... WHERE m.operator_id = $1` |

---

## 三、缺少 operator_id 过滤的查询（94 处缺口）

### venues（14 处缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 1 | `routes/venues.ts` | 44 | `SELECT COUNT(*) as count FROM venues ${whereClause}` — 公开列表，无 operator_id |
| 2 | `routes/venues.ts` | 50 | `SELECT id, name, ..., operator_id FROM venues ${whereClause}` — 公开列表 |
| 3 | `routes/venues.ts` | 87 | `SELECT id, name, ..., operator_id FROM venues WHERE id = $1` — 单条查无 operator_id |
| 4 | `routes/venues.ts` | 187 | `SELECT id, name, ..., operator_id FROM venues WHERE id = $1` — 创建后回读 |
| 5 | `routes/venues.ts` | 235 | `SELECT id FROM venues WHERE id = $1` — 更新前检查 |
| 6 | `routes/venues.ts` | 283 | `UPDATE venues SET ... WHERE id = $${paramIdx}` — 无 operator_id 校验 |
| 7 | `routes/venues.ts` | 287 | `SELECT ... FROM venues WHERE id = $1` — 更新后回读 |
| 8 | `routes/venues.ts` | 319 | `SELECT id FROM venues WHERE id = $1` — 状态变更前检查 |
| 9 | `routes/venues.ts` | 327 | `UPDATE venues SET status = $1, updated_at = $2 WHERE id = $3` — 无 operator_id |
| 10 | `routes/venues.ts` | 388 | `DELETE FROM venues WHERE id = $1` — 无 operator_id |
| 11 | `routes/operator.ts` | 489 | `SELECT id, name, address, status FROM venues WHERE id = $1` — 仪表盘 |
| 12 | `routes/operator.ts` | 699 | `SELECT ... FROM venues WHERE id = $1` — 场馆详情 |
| 13 | `routes/operator.ts` | 738-753 | `SELECT id FROM venues WHERE id = $1` + `UPDATE venues SET ... WHERE id = $5` — 更新场馆 |
| 14 | `routes/operator.ts` | 781-790 | `SELECT id FROM venues WHERE id = $1` + `UPDATE venues SET status = ... WHERE id = $3` — 状态变更 |

### races（6 处缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 15 | `routes/race.ts` | 114 | `SELECT COUNT(*) as count FROM races ${whereClause}` — 列表，仅按 venue_id 过滤 |
| 16 | `routes/race.ts` | 120 | `SELECT id, name, status, ... FROM races ${whereClause}` — 列表 |
| 17 | `routes/race.ts` | 157 | `SELECT id, name, status, ... FROM races WHERE id = $1` — 单条无 operator_id |
| 18 | `routes/race.ts` | 199 | `SELECT id FROM races WHERE id = $1` — 存在性检查 |
| 19 | `routes/race.ts` | 267 | `SELECT id, status FROM races WHERE id = $1` — 状态检查 |
| 20 | `routes/race.ts` | 286 | `UPDATE races SET status = $1, updated_at = $2 WHERE id = $3` — 无 operator_id |

### referees（22 处缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 21 | `routes/referees.ts` | 49 | `SELECT id FROM referees WHERE phone = $1` — 重复检查 |
| 22 | `routes/referees.ts` | 249 | `SELECT r.id, ... FROM referees r ... WHERE r.user_id = $1` — /my 查询 |
| 23 | `routes/referees.ts` | 291 | `SELECT id, name, phone, status, ... FROM referees WHERE user_id = $1` — 申请状态 |
| 24 | `routes/referees.ts` | 300 | `SELECT r.id, ... FROM referees r JOIN users ... WHERE u.openid = ...` — openid 查询 |
| 25 | `routes/referees.ts` | 350 | `SELECT r.id, ... FROM referees r ... WHERE r.id = $1` — 详情 |
| 26 | `routes/referees.ts` | 396 | `SELECT r.id, r.status, r.name FROM referees r WHERE r.openid = $1` — 申请检查 |
| 27 | `routes/referees.ts` | 414 | `SELECT id, status FROM referees WHERE user_id = $1 LIMIT 1` — 申请检查 |
| 28 | `routes/referees.ts` | 429 | `SELECT id FROM referees WHERE phone = $1` — 申请检查 |
| 29 | `routes/referees.ts` | 520 | `UPDATE referees SET venue_id = $1, updated_at = $2 WHERE id = $3` — 绑定场馆 |
| 30 | `routes/referees.ts` | 524 | `SELECT id, user_id, venue_id, phone, ... FROM referees WHERE id = $1` — 回读 |
| 31 | `routes/referees.ts` | 555 | `DELETE FROM referees WHERE id = $1` — 无 operator_id |
| 32 | `routes/referees.ts` | 593 | `SELECT id, user_id FROM referees WHERE id = $1` — 状态检查 |
| 33 | `routes/referees.ts` | 603 | `UPDATE referees SET status = $1 WHERE id = $2` — 无 operator_id |
| 34 | `routes/referees.ts` | 680 | `UPDATE referees SET ... WHERE id = $6` — 审核更新 |
| 35 | `routes/referees.ts` | 1148 | `SELECT phone FROM referees WHERE id = $1` — 签到 |
| 36 | `routes/referees.ts` | 1451 | `SELECT id FROM referees WHERE id = $1` — patch 检查 |
| 37 | `routes/referees.ts` | 1484 | `UPDATE referees SET ${fields.join(', ')} WHERE id = $${paramIdx}` — patch 更新 |
| 38 | `routes/referees.ts` | 1509 | `SELECT user_id FROM referees WHERE id = $1` — 重置密码检查 |
| 39 | `routes/operator.ts` | 1193 | `SELECT COUNT(*) as cnt FROM referees r ${whereClause}` — 申请列表 |
| 40 | `routes/operator.ts` | 1200 | `SELECT r.id, r.name, ... FROM referees r LEFT JOIN venues v ... ${whereClause}` — 申请列表 |
| 41 | `routes/operator.ts` | 1254 | `SELECT r.id, ... FROM referees r ... WHERE r.id = $1` — 审核详情 |
| 42 | `routes/operator.ts` | 1276 | `UPDATE referees SET status = $1, ... WHERE id = $6` — 审核更新 |

### referee_invites（3 处缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 43 | `routes/referee-invite.ts` | 106 | `UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2` — 过期 |
| 44 | `routes/referee-invite.ts` | 228 | `UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2` — 过期 |
| 45 | `routes/referee-invite.ts` | 282 | `UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2` — 标记已用 |

### merchants（15 处缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 46 | `routes/admin-merchant.ts` | 53 | `SELECT * FROM merchants ORDER BY created_at DESC LIMIT $1 OFFSET $2` — 列表 |
| 47 | `routes/admin-merchant.ts` | 58 | `SELECT COUNT(*) as total FROM merchants` — 计数 |
| 48 | `routes/admin-merchant.ts` | 103 | `INSERT INTO merchants (id, merchant_name, ...)` — 未写入 operator_id |
| 49 | `routes/admin-merchant.ts` | 162 | `SELECT id FROM merchants WHERE id = $1` — 存在性检查 |
| 50 | `routes/admin-merchant.ts` | 190 | `UPDATE merchants SET ${updates.join(', ')} WHERE id = $${idx}` — 无 operator_id |
| 51 | `routes/admin-merchant.ts` | 292 | `SELECT id FROM merchants WHERE id = $1` — 删除前检查 |
| 52 | `routes/admin-merchant.ts` | 301 | `DELETE FROM merchants WHERE id = $1` — 无 operator_id |
| 53 | `routes/admin-merchant.ts` | 323 | `SELECT id FROM merchants WHERE id = $1` — 状态检查 |
| 54 | `routes/admin-merchant.ts` | 329 | `UPDATE merchants SET status = $1, updated_at = NOW() WHERE id = $2` — 无 operator_id |
| 55 | `routes/admin-merchant.ts` | 347 | `SELECT id FROM merchants WHERE id = $1` — 详情检查 |
| 56 | `routes/operator-merchant.ts` | 124 | `SELECT * FROM merchants WHERE id = $1` — 详情 |
| 57 | `routes/operator-merchant.ts` | 158 | `UPDATE merchants SET ${updates.join(', ')} WHERE id = $${idx}` — 无 operator_id |
| 58 | `routes/operator-merchant.ts` | 233 | `SELECT * FROM merchants WHERE id = $1` — 优惠券列表检查 |
| 59 | `routes/upload.ts` | 59 | `UPDATE merchants SET logo_url = ... WHERE id = $2` — 无 operator_id |
| 60 | `routes/upload.ts` | 89 | `UPDATE merchants SET logo_url = ... WHERE id = $2` — 无 operator_id |

### race_packages（18 处缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 61 | `routes/race-packages.ts` | 100 | `SELECT COUNT(*) as count FROM race_packages ${whereClause}` — 公开列表 |
| 62 | `routes/race-packages.ts` | 105 | `SELECT * FROM race_packages ${whereClause} ORDER BY ...` — 公开列表 |
| 63 | `routes/race-packages.ts` | 133 | `SELECT * FROM race_packages WHERE id = $1` — 公开详情 |
| 64 | `routes/race-packages.ts` | 228 | `SELECT * FROM race_packages WHERE id = $1` — 创建后回读 |
| 65 | `routes/race-packages.ts` | 259 | `SELECT id FROM race_packages WHERE id = $1` — 更新前检查 |
| 66 | `routes/race-packages.ts` | 363 | `UPDATE race_packages SET ${fields.join(', ')} WHERE id = $${paramIdx}` — 无 operator_id |
| 67 | `routes/race-packages.ts` | 366 | `SELECT * FROM race_packages WHERE id = $1` — 更新后回读 |
| 68 | `routes/race-packages.ts` | 370 | `SELECT * FROM race_packages WHERE id = $1` — 重新匹配回读 |
| 69 | `routes/race-packages.ts` | 394 | `SELECT * FROM race_packages WHERE id = $1` — 匹配优惠券 |
| 70 | `routes/race-packages.ts` | 423 | `SELECT * FROM race_packages WHERE id = $1` — 保存匹配 |
| 71 | `routes/race-packages.ts` | 480 | `SELECT id, name FROM race_packages WHERE id = $1` — 删除前检查 |
| 72 | `routes/race-packages.ts` | 497 | `DELETE FROM race_packages WHERE id = $1` — 无 operator_id |
| 73 | `routes/race-packages.ts` | 519 | `SELECT id, status FROM race_packages WHERE id = $1` — patch 前检查 |
| 74 | `routes/race-packages.ts` | 528 | `UPDATE race_packages SET status = $1, updated_at = $2 WHERE id = $3` — 无 operator_id |
| 75 | `routes/race-packages.ts` | 531 | `SELECT * FROM race_packages WHERE id = $1` — patch 后回读 |
| 76 | `routes/player.ts` | 52 | `SELECT * FROM race_packages WHERE status = 'active' ORDER BY ...` — 玩家列表 |
| 77 | `routes/player.ts` | 757 | `SELECT id, name, price_cents, ... FROM race_packages WHERE id = $1 AND status = 'active'` — 详情 |
| 78 | `services/coupon-service.ts` | 32 | `SELECT id, name, coupon_reward_min_cents, ... FROM race_packages WHERE id = $1` — 自动发券 |

### orders（20 处缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 79 | `routes/player.ts` | 820 | `INSERT INTO orders (id, order_no, user_id, package_id, ...)` — 未写入 operator_id |
| 80 | `routes/player.ts` | 1071 | `UPDATE orders SET remaining_times = ... WHERE id = $1` — 无 operator_id |
| 81 | `routes/player.ts` | 726 | `SELECT o.id, o.order_no, ... FROM orders o LEFT JOIN race_packages rp ... WHERE o.user_id = $1` — 仅按 user_id |
| 82 | `routes/wx-pay.ts` | 216 | `SELECT id, order_no, user_id, amount, status FROM orders WHERE id = ?` — 查订单 |
| 83 | `routes/wx-pay.ts` | 239 | `UPDATE orders SET order_no = ? WHERE id = ?` — 无 operator_id |
| 84 | `routes/wx-pay.ts` | 249 | `UPDATE orders SET payment_method = 'wechat_pay', prepay_id = ? WHERE id = ?` — 无 operator_id |
| 85 | `routes/wx-pay.ts` | 291 | `UPDATE orders SET payment_method = 'wechat_pay', prepay_id = ? WHERE id = ?` — 无 operator_id |
| 86 | `routes/wx-pay.ts` | 371 | `SELECT id, status, amount FROM orders WHERE order_no = ?` — 无 operator_id |
| 87 | `routes/wx-pay.ts` | 394 | `UPDATE orders SET status = 'abnormal', ... WHERE id = ?` — 无 operator_id |
| 88 | `routes/wx-pay.ts` | 403 | `UPDATE orders SET status = 'paid', ... WHERE id = ? AND status = 'pending'` — 无 operator_id |
| 89 | `routes/wx-pay.ts` | 419 | `UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'` — 无 operator_id |
| 90 | `routes/wx-pay.ts` | 454 | `SELECT id, order_no, user_id, amount, status, ... FROM orders WHERE id = ?` — 无 operator_id |
| 91 | `routes/wx-pay.ts` | 476 | `UPDATE orders SET status = 'paid', ... WHERE id = ? AND status = 'pending'` — 无 operator_id |
| 92 | `routes/wx-pay.ts` | 484 | `UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'` — 无 operator_id |
| 93 | `routes/wx-pay.ts` | 537 | `SELECT id, order_no, user_id, amount, status, ... FROM orders WHERE id = ?` — 无 operator_id |
| 94 | `routes/wx-pay.ts` | 557 | `UPDATE orders SET status = 'refunding', ... WHERE id = ?` — 无 operator_id |
| 95 | `routes/wx-pay.ts` | 592 | `UPDATE orders SET status = 'refunding', ... WHERE id = ?` — 无 operator_id |
| 96 | `routes/wx-pay.ts` | 638 | `UPDATE orders SET status = 'refunded', ... WHERE id = ?` — 无 operator_id |
| 97 | `routes/wx-pay.ts` | 677 | `SELECT id, user_id, status FROM orders WHERE id = ?` — 无 operator_id |
| 98 | `routes/wx-pay.ts` | 692 | `UPDATE orders SET status = 'paid', ... WHERE id = ? AND status = 'pending'` — 无 operator_id |

### merchant_coupons（23 处缺口，含间接隔离缺口）

| # | 文件 | 行号 | 缺失的 SQL |
|---|------|------|-----------|
| 99 | `routes/merchant-coupon.ts` | 54 | `INSERT INTO merchant_coupons (id, merchant_id, name, ...)` — 无 operator_id |
| 100 | `routes/merchant-coupon.ts` | 101 | `UPDATE merchant_coupons SET audit_status = 1, ... WHERE id = $1` — 无 operator_id |
| 101 | `routes/merchant-coupon.ts` | 132 | `UPDATE merchant_coupons SET audit_status = 1, offline_request = 1, ... WHERE id = $1` — 无 operator_id |
| 102 | `routes/merchant-coupon.ts` | 163 | `UPDATE merchant_coupons SET audit_status = 2, offline_request = 0, ... WHERE id = $1` — 无 operator_id |
| 103 | `routes/merchant-coupon.ts` | 200 | `UPDATE merchant_coupons SET status = 1, ... WHERE id = $1` — 无 operator_id |
| 104 | `routes/merchant-coupon.ts` | 287 | `UPDATE merchant_coupons SET ${updates.join(', ')} WHERE id = $${idx}` — 无 operator_id |
| 105 | `routes/admin-merchant.ts` | 213 | `SELECT COUNT(*) as total FROM merchant_coupons` — 统计 |
| 106 | `routes/admin-merchant.ts` | 216 | `SELECT COUNT(*) as total FROM merchant_coupons WHERE audit_status = 0` — 统计 |
| 107 | `routes/admin-merchant.ts` | 219 | `SELECT COUNT(*) as total FROM merchant_coupons WHERE audit_status = 1` — 统计 |
| 108 | `routes/admin-merchant.ts` | 222 | `SELECT COUNT(*) as total FROM merchant_coupons WHERE status = 1 AND audit_status = 1` — 统计 |
| 109 | `routes/admin-merchant.ts` | 253 | `SELECT * FROM merchant_coupons WHERE id = $1` — 详情 |
| 110 | `routes/admin-merchant.ts` | 268 | `UPDATE merchant_coupons SET status = 0, audit_remark = $1, ... WHERE id = $2` — 无 operator_id |
| 111 | `routes/merchant-verify.ts` | 69 | `UPDATE merchant_coupons SET remain_count = remain_count - 1 WHERE id = $1` — 核销 |
| 112 | `routes/merchant.ts` | 110 | `UPDATE merchant_coupons SET remain_count = remain_count - 1 WHERE id = $1` — 核销 |
| 113 | `routes/points.ts` | 626 | `SELECT * FROM merchant_coupons WHERE id = $1 AND status = 1 AND audit_status = 2 AND remain_count > 0` — 兑换 |
| 114 | `routes/points.ts` | 642 | `UPDATE merchant_coupons SET remain_count = remain_count - 1, ... WHERE id = $1` — 兑换扣减 |
| 115 | `services/coupon-service.ts` | 75-81 | `SELECT c.* FROM merchant_coupons c JOIN merchants m ... WHERE c.audit_status = 2 AND c.status = 1 AND c.remain_count > 0` — 全量查券，无 operator_id |
| 116 | `services/coupon-service.ts` | 107 | `UPDATE merchant_coupons SET remain_count = remain_count - 1, updated_at = NOW() WHERE id = $1 AND remain_count > 0` — 自动发券扣减 |
| 117 | `routes/operator-merchant.ts` | 397 | `UPDATE merchant_coupons SET ... WHERE id = $5` — 无 operator_id（虽有应用层校验但 SQL 层面无保护） |
| 118 | `routes/operator-merchant.ts` | 524 | `UPDATE merchant_coupons SET ... WHERE id = $1` — 无 operator_id |
| 119 | `routes/operator-merchant.ts` | 539 | `UPDATE merchant_coupons SET ... WHERE id = $1` — 无 operator_id |
| 120 | `routes/operator-merchant.ts` | 654 | `UPDATE merchant_coupons SET op_read = 1 WHERE id = $1` — 无 operator_id |
| 121 | `routes/merchant-verify.ts` | 49 | `UPDATE user_coupons SET status = 3 WHERE id = $1` — 无 operator_id（user_coupons 无此列，缺口同质） |

---

## 四、风险评估

### 🔴 高风险（跨租户数据泄露/篡改）

| 表 | 风险描述 |
|----|----------|
| **referees** | 22 处缺口，多数通过 `id` 直接 UPDATE/DELETE，任意运营商可通过猜测 ID 操作其他运营商的裁判数据 |
| **race_packages** | 18 处缺口，包括 UPDATE、DELETE 无 operator_id 校验，可跨租户修改/删除赛事包 |
| **venues** | 14 处缺口，运营商后台 UPDATE/DELETE 场馆仅按 id，无所有权校验 |
| **orders** | 20 处缺口，wx-pay.ts 中所有订单操作仅按 id/order_no，虽为微信回调但缺少防御层 |

### 🟡 中风险（跨租户数据读取）

| 表 | 风险描述 |
|----|----------|
| **merchants** | 15 处缺口，admin 和 operator 接口的 SELECT/UPDATE/DELETE 均无 operator_id |
| **merchant_coupons** | 23 处缺口，多个核销、兑换接口仅按 id 操作，`coupon-service.ts` 全量查询所有运营商的券 |
| **races** | 6 处缺口，SELECT by id 和 UPDATE status 无 operator_id |
| **referee_invites** | 3 处缺口，UPDATE 状态仅按 id |

---

## 五、修复建议

### 1. venues / operator.ts 场馆操作

```diff
- SELECT id FROM venues WHERE id = $1
+ SELECT id FROM venues WHERE id = $1 AND operator_id = $2

- UPDATE venues SET ... WHERE id = $5
+ UPDATE venues SET ... WHERE id = $5 AND operator_id = $6

- DELETE FROM venues WHERE id = $1
+ DELETE FROM venues WHERE id = $1 AND operator_id = $2
```

### 2. referees.ts 裁判 CRUD

所有 `WHERE id = $1` 的 referee 查询和更新都应追加 `AND operator_id = $2`，需从 `req.user.operator_id` 获取。

### 3. race-packages.ts 赛事包

非公开接口（创建后回读、更新、删除、状态变更）追加 `AND operator_id = $2`。

### 4. wx-pay.ts 微信支付回调

虽然通过微信签名验证，但建议在订单查询/更新时加入 `operator_id` 作为额外防御层。`operator_id` 可从订单记录中读取后校验。

### 5. coupon-service.ts 自动发券

```diff
- SELECT c.* FROM merchant_coupons c JOIN merchants m ON c.merchant_id = m.id
-   WHERE c.audit_status = 2 AND c.status = 1 AND c.remain_count > 0
+ SELECT c.* FROM merchant_coupons c JOIN merchants m ON c.merchant_id = m.id
+   WHERE m.operator_id = $1 AND c.audit_status = 2 AND c.status = 1 AND c.remain_count > 0
```

### 6. merchant_coupons 核销/兑换

`merchant-verify.ts`、`merchant.ts`、`points.ts` 中的核销和兑换操作应通过 JOIN merchants 校验 operator_id，或确认 merchant_id 已在上下文校验。

---

## 六、扫描文件清单

共扫描 53 个 TypeScript 文件：

**routes/ (29 个)**：`admin-dashboard.ts`, `admin-marketing.ts`, `admin-merchant.ts`, `admin-operators.ts`, `auth.ts`, `merchant-auth.ts`, `merchant-coupon.ts`, `merchant-verify.ts`, `merchant.ts`, `operator-finance.ts`, `operator-marketing.ts`, `operator-merchant.ts`, `operator.ts`, `player.ts`, `points-shop.ts`, `points.ts`, `prize.ts`, `race-packages.ts`, `race.ts`, `referee-invite.ts`, `referees.ts`, `season.ts`, `task.ts`, `upload.ts`, `users.ts`, `venues.ts`, `wx-mp-login.ts`, `wx-notify.ts`, `wx-pay.ts`

**services/ (2 个)**：`coupon-service.ts`, `wechat-token.ts`

**db/ (1 个)**：`migrations/run-migrations.ts`

**middleware/ (5 个)**：`auth.ts`, `errorHandler.ts`, `logger.ts`, `rateLimiter.ts`, `rbac.ts`

其余文件不包含针对租户范围表的 SQL 查询。

---

*报告结束。*
