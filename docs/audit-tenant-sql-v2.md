# 数据库多租户 SQL 代码审计报告 v2

> **审计日期**: 2026-07-06  
> **审计范围**: `packages/server/src/` 下所有 `.ts` 文件（routes、services、db、middleware、config）  
> **审计方法**: 扫描所有 SQL 查询语句，对照"跟运营商走"的表清单，检查是否缺少 `operator_id` 过滤  

---

## 一、汇总

| 指标 | 数量 |
|------|------|
| 已扫描 .ts 文件总数 | 57 |
| 访问了租户表（tenant-scoped）的查询总数 | ~180 |
| 已有 `operator_id` 过滤（或等效作用域限制） | ~30 |
| **缺少 `operator_id` 过滤（需修复）** | **38** |

---

## 二、审计范围

### 租户表（跟运营商走，需要 `operator_id` 过滤）

`venues`, `races`, `race_rooms`, `referees`, `referee_invites`, `users`, `user_profiles`, `merchants`, `race_packages`, `orders`, `points_transactions`, `points_exchange_log`, `user_coupons`, `merchant_coupons`, `expand_coupons`, `help_requests`, `help_helpers`

### 主库表（不需要 `operator_id`，已跳过）

`operators`, `operator_members`, `admin_users`, `admin_roles`, `settings`, `banks`, `seasons`, `regions`, `payments`, `settlement_records`

### 安全级别分类

| 级别 | 含义 | 说明 |
|------|------|------|
| 🔴 **HIGH** | operator 接口直接暴露，可跨租户读/写数据 | 同角色不同运营商之间可越权 |
| 🟡 **MEDIUM** | 通过 ID 查询但缺少 owner 校验 | 需知道 ID 才能利用，但 ID 可能可枚举 |
| 🟢 **LOW** | admin/super-admin 接口，有意跨租户 | 设计如此，不需要修复但需记录 |
| ⚪ **N/A** | player/merchant 端或支付回调 | 用户以自己的 ID 操作自己的数据，合理 |

---

## 三、已有 operator_id 过滤的查询（已合规）

这些查询已正确使用 `operator_id` 做过滤，属于合规：

| 文件 | 行号 | 表 | 说明 |
|------|------|-----|------|
| `routes/admin-marketing.ts` | 109 | `venues` | `WHERE operator_id = $1`（admin 遍历各运营商） |
| `routes/admin-operators.ts` | 446 | `venues` | `WHERE operator_id = $1`（删除运营商前查场馆） |
| `routes/admin-operators.ts` | 454 | `venues` | `DELETE FROM venues WHERE operator_id = $1` |
| `routes/admin-operators.ts` | 457 | `referees` | `WHERE operator_id = $1` |
| `routes/admin-operators.ts` | 459 | `referees` | `DELETE FROM referees WHERE operator_id = $1` |
| `routes/admin-operators.ts` | 465 | `race_packages` | `DELETE FROM race_packages WHERE operator_id = $1` |
| `routes/operator-finance.ts` | 43 | `venues` | `WHERE operator_id = $1` |
| `routes/operator-marketing.ts` | 98,179,270 | `venues` | `INSERT INTO venues ... operator_id` |
| `routes/operator-marketing.ts` | 215,247 | `race_packages` | `WHERE operator_id = $1` |
| `routes/operator-marketing.ts` | 262 | `race_packages` | `INSERT ... operator_id` |
| `routes/operator-players.ts` | 68 | `users` | `INNER JOIN venues v ON ... WHERE v.operator_id = $1` |
| `routes/operator.ts` | 127 | `venues` | `WHERE operator_id = $1` |
| `routes/race-packages.ts` | 216 | `race_packages` | `INSERT ... operator_id = $2` |
| `routes/race.ts` | 54 | `races` | `INSERT ... operator_id` |
| `routes/referee-invite.ts` | 51 | `referee_invites` | `INSERT ... operator_id` |
| `routes/referee-invite.ts` | 263 | `referees` | `INSERT ... operator_id` |
| `routes/referees.ts` | 87,465 | `referees` | `INSERT ... operator_id` |
| `routes/referees.ts` | 170-194 | `referees` | 列表查询通过 venue_id IN (...) 间接限定了运营商范围 |
| `routes/venues.ts` | 163 | `venues` | `INSERT ... operator_id` |

---

## 四、缺少 operator_id 过滤的查询（需修复）

### 🔴 高危（HIGH）：operator 接口直接暴露

#### 4.1 `routes/referees.ts` — 裁判写操作无 operator_id 校验

| 行号 | 操作 | SQL |
|------|------|-----|
| 520 | UPDATE | `UPDATE referees SET venue_id = $1, updated_at = $2 WHERE id = $3` |
| 555 | DELETE | `DELETE FROM referees WHERE id = $1` |
| 593-603 | SELECT/UPDATE | `SELECT id, user_id FROM referees WHERE id = $1` + `UPDATE referees SET status = $1 WHERE id = $2` |
| 658-680 | SELECT/UPDATE | `SELECT ... FROM referees WHERE id = $1` + `UPDATE referees SET status = $1 ... WHERE id = $6` |

> **风险**：Operator A 可通过猜解 ID 绑定/解绑/删除/启禁用 Operator B 的裁判。  
> **修复**：在 WHERE 中加上 `AND operator_id = $currentOperatorId`，或先查出 `operator_id` 做应用层校验。

#### 4.2 `routes/operator.ts` — 裁判申请列表/审核无 operator_id 过滤

| 行号 | 操作 | SQL |
|------|------|-----|
| 1193 | SELECT COUNT | `SELECT COUNT(*) as cnt FROM referees r` — 无 operator_id WHERE |
| 1200-1205 | SELECT 列表 | `SELECT r.id, r.name, ... FROM referees r LEFT JOIN venues v ON r.venue_id = v.id` — 无 operator_id WHERE |
| 1254-1256 | SELECT（审核前查） | `SELECT r.id, r.user_id, ... FROM referees r WHERE r.id = $1` — 无 operator_id |
| 1276 | UPDATE（审核写入） | `UPDATE referees SET status = $1 ... WHERE id = $6` — 无 operator_id |

> **风险**：任意 operator 可查看并审核其他运营商的裁判申请，包括通过/驳回。  
> **修复**：在列表查询中仿照 `referees.ts:170-194` 通过 `venue_id IN (operator_venues)` 限定范围；审核时加 `operator_id` 校验。

#### 4.3 `routes/operator.ts` — 场馆详情/更新/状态操作无 operator_id 校验

| 行号 | 操作 | SQL |
|------|------|-----|
| 489 | SELECT | `SELECT id, name, address, status FROM venues WHERE id = $1` |
| 738 | SELECT | `SELECT id FROM venues WHERE id = $1` |
| 747-752 | UPDATE | `UPDATE venues SET name = ..., address = ..., maze_config = ... WHERE id = $5` |
| 781 | SELECT | `SELECT id FROM venues WHERE id = $1` |
| 790 | UPDATE | `UPDATE venues SET status = $1, updated_at = $2 WHERE id = $3` |

> **风险**：Operator A 可查看/修改/启停 Operator B 的场馆。  
> **修复**：加 `AND operator_id = $currentOperatorId` 到 WHERE。

#### 4.4 `routes/venues.ts` — 场馆写操作无 operator_id 校验

| 行号 | 操作 | SQL |
|------|------|-----|
| 235 | SELECT | `SELECT id FROM venues WHERE id = $1` — 存在性检查无 operator_id |
| 283 | UPDATE | `UPDATE venues SET ... WHERE id = $${paramIdx}` — 无 operator_id |
| 319 | SELECT | `SELECT id FROM venues WHERE id = $1` — 无 operator_id |
| 327 | UPDATE | `UPDATE venues SET status = $1, updated_at = $2 WHERE id = $3` |
| 388 | DELETE | `DELETE FROM venues WHERE id = $1` |
| 436 | SELECT | `SELECT operator_id FROM venues WHERE id = $1` — 查出后用于 referee 解绑，但自己未校验 |

> **注意**：第 436 行查出 `operator_id` 后用于 `referees` 表的跨表操作（440-444 行），逻辑复杂且边界条件多。  
> **风险**：Operator 可修改/删除其他运营商的场馆，连带影响场馆下的裁判和赛事。  
> **修复**：在 venues 写操作中加 `operator_id` 校验。

#### 4.5 `routes/race-packages.ts` — 参赛包写操作无 operator_id 校验

| 行号 | 操作 | SQL |
|------|------|-----|
| 228 | SELECT | `SELECT * FROM race_packages WHERE id = $1` — INSERT 后读取，但用的是 INSERT 时写入的 operator_id |
| 259 | SELECT | `SELECT id FROM race_packages WHERE id = $1` |
| 363 | UPDATE | `UPDATE race_packages SET ... WHERE id = $1` |
| 394,423 | SELECT | `SELECT * FROM race_packages WHERE id = $1` |
| 480 | SELECT | `SELECT id, name FROM race_packages WHERE id = $1` |
| 497 | DELETE | `DELETE FROM race_packages WHERE id = $1` |
| 519 | SELECT | `SELECT id, status FROM race_packages WHERE id = $1` |
| 528 | UPDATE | `UPDATE race_packages SET status = $1, updated_at = $2 WHERE id = $3` |
| 531 | SELECT | `SELECT * FROM race_packages WHERE id = $1` |

> **风险**：Operator A 可通过猜解 ID 修改/删除 Operator B 的参赛包。INSERT（216 行）已写入 operator_id 但后续 CRUD 均未使用。  
> **修复**：在 WHERE 中加上 `AND operator_id = $currentOperatorId`。

#### 4.6 `routes/race.ts` — 赛事状态修改无 operator_id 校验

| 行号 | 操作 | SQL |
|------|------|-----|
| 199 | SELECT | `SELECT id FROM races WHERE id = $1` — 存在性检查 |
| 267 | SELECT | `SELECT id, status FROM races WHERE id = $1` |
| 286 | UPDATE | `UPDATE races SET status = $1, updated_at = $2 WHERE id = $3` |

> **注意**：赛事创建（第 38-48 行）已校验 venue.operator_id，但后续的状态修改（暂停/恢复/结束）未校验。  
> **风险**：Operator A 可修改 Operator B 创建的赛事状态。  
> **修复**：先查 `races` 的 `operator_id` 做校验，或通过 `JOIN venues ON races.venue_id = venues.id WHERE venues.operator_id = $1` 来限定。

#### 4.7 `routes/operator-merchant.ts` — 待审核商家列表无 operator_id 过滤

| 行号 | 操作 | SQL |
|------|------|-----|
| 59-61 | SELECT COUNT | `SELECT COUNT(*) as total FROM merchants m WHERE m.audit_status = 0` — 无 operator_id |
| 64-70 | SELECT 列表 | `SELECT m.*, op.name as operator_name FROM merchants m LEFT JOIN operators op ON m.operator_id = op.id WHERE m.audit_status = 0` — 无 operator_id |
| 124 | SELECT | `SELECT * FROM merchants WHERE id = $1` |
| 158 | UPDATE | `UPDATE merchants SET ... WHERE id = $1` |

> **风险**：Operator 查看待审核商家时可以看到所有运营商的待审核商家；审核时（158 行）未校验 operator_id。但审核时（150 行附近）有应用层逻辑设置 `operatorId`，本次仅标记 SQL 层缺口。  
> **修复**：在列表查询加 `AND m.operator_id IN ($currentOperatorId, NULL)`（审核前未绑定的商家可被所有运营商看到，已绑定则隔离）。

---

### 🟡 中危（MEDIUM）：服务层/非直接接口但存在越权隐患

#### 4.8 `services/coupon-service.ts` — 券服务全量查询无 operator_id 过滤

| 行号 | 操作 | 表 | SQL |
|------|------|-----|-----|
| 32-33 | SELECT | `race_packages` | `SELECT ... FROM race_packages WHERE id = $1` |
| 48-49 | SELECT | `race_packages` | `SELECT price_cents, standard_price_cents FROM race_packages WHERE id = $1` |
| 72-81 | SELECT | `merchant_coupons` + `merchants` | `SELECT c.*, m.merchant_name FROM merchant_coupons c JOIN merchants m ON c.merchant_id = m.id WHERE c.audit_status = 2 AND c.status = 1 AND c.remain_count > 0 AND c.denomination_cents > 0` — **全量扫描所有商家的券** |
| 107-108 | UPDATE | `merchant_coupons` | `UPDATE merchant_coupons SET remain_count = remain_count - 1 WHERE id = $1 AND remain_count > 0` |
| 127-130 | INSERT | `user_coupons` | `INSERT INTO user_coupons (...) VALUES ...` |
| 274-277 | INSERT | `user_coupons` | `INSERT INTO user_coupons (...) VALUES ...` |

> **风险**：`autoAssignMerchantCoupons` 从全量券池选券，跨运营商发放。如果不同运营商配置了不同的参赛包/券策略，会出现券跨运营商污染。`grantExchangeCoupon` 是积分商城兑换，player 端调用，不限 operator_id 合理。  
> **修复**：`autoAssignMerchantCoupons` 需传入 `operatorId`，在 SELECT 券池时加 `merchants.operator_id = ?` 过滤。

#### 4.9 `routes/referee-invite.ts` — 邀请状态更新无 operator_id 校验

| 行号 | 操作 | SQL |
|------|------|-----|
| 106 | UPDATE | `UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2` |
| 138 | SELECT | `SELECT name FROM venues WHERE id = $1` |
| 228 | UPDATE | `UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2` |
| 282 | UPDATE | `UPDATE referee_invites SET status = $1, updated_at = NOW() WHERE id = $2` |

> **风险**：邀请的 accept/reject 通过邀请链接（带 token）操作，有一定天然隔离。但直接通过 ID 更新状态时缺少 operator_id 校验。  
> **修复**：UPDATE 时加 `AND operator_id = ?`。

---

### 🟢 低危（LOW）/ ⚪ 无需修复

以下场景按设计无需 `operator_id` 过滤：

#### 5.1 Admin/Super-admin 接口（有意跨租户）

| 文件 | 涉及表 | 说明 |
|------|--------|------|
| `routes/admin-dashboard.ts:26` | `orders` | `SELECT COUNT(*) as total FROM orders` — 全平台订单统计 |
| `routes/admin-dashboard.ts:356-421` | `orders` | 按地区维度聚合收入，通过 JOIN venues 获取 operator 信息 |
| `routes/admin-merchant.ts` | `merchants`, `merchant_coupons`, `user_coupons` | 全平台商家管理 |
| `routes/admin-players.ts` | `users` | 全平台玩家管理 |

#### 5.2 Player 端（user_id 即为隔离维度）

| 文件 | 涉及表 | 说明 |
|------|--------|------|
| `routes/player.ts` | `users`, `orders`, `race_packages`, `help_helpers`, `user_coupons` | 全部以 `user_id` 限定 |
| `routes/points.ts` | `users`, `points_transactions`, `user_coupons` | 全部以 `user_id` 限定 |
| `routes/points-shop.ts` | `users`, `points_exchange_log`, `user_coupons` | 全部以 `user_id` 限定 |
| `routes/season.ts` | `users`, `user_coupons`, `points_transactions` | 全部以 `user_id` 限定 |
| `routes/task.ts` | `users` | 全部以用户自身操作 |
| `routes/auth.ts` | `users`, `referees` | 登录注册，按 phone/id/openid |
| `routes/wx-mp-login.ts` | `users` | 微信登录注册 |
| `routes/wx-notify.ts` | `users` | 微信通知推送 |
| `routes/wx-pay.ts` | `orders` | 支付回调，按 order_no/id |

#### 5.3 Merchant 端（merchant_id 即为隔离维度）

| 文件 | 涉及表 | 说明 |
|------|--------|------|
| `routes/merchant.ts` | `user_coupons`, `merchant_coupons`, `merchants` | 以 `merchant_id` 限定 |
| `routes/merchant-auth.ts` | `merchants` | 商家自身信息修改 |
| `routes/merchant-coupon.ts` | `merchant_coupons`, `user_coupons` | 以 `merchant_id` 限定 |
| `routes/merchant-verify.ts` | `user_coupons`, `merchant_coupons` | 核销码校验 |

#### 5.4 公共接口（无需登录）

| 文件 | 涉及表 | 说明 |
|------|--------|------|
| `routes/venues.ts:44-59` | `venues` | 公开列表，无需 operator_id |
| `routes/race-packages.ts:100-133` | `race_packages` | 公开列表/详情，无需 operator_id |
| `routes/upload.ts` | `merchants` | 商家上传 logo（按 merchant_id） |

---

## 五、修复优先级建议

### 第一阶段（高危，建议立即修复）

| # | 文件 | 行号 | 问题 |
|---|------|------|------|
| 1 | `routes/referees.ts` | 520,555,593,603,658,680 | 裁判绑定/删除/状态修改无 operator_id |
| 2 | `routes/operator.ts` | 1193,1200,1254,1276 | 裁判申请列表+审核无 operator_id |
| 3 | `routes/operator.ts` | 489,738,747,781,790 | 场馆详情/更新/状态无 operator_id |
| 4 | `routes/venues.ts` | 235,283,319,327,388 | 场馆写操作无 operator_id |
| 5 | `routes/race-packages.ts` | 259,363,480,497,519,528 | 参赛包写操作无 operator_id |
| 6 | `routes/race.ts` | 199,267,286 | 赛事状态修改无 operator_id |
| 7 | `routes/operator-merchant.ts` | 59,64,124,158 | 商家审核列表/操作无 operator_id |

### 第二阶段（中危）

| # | 文件 | 行号 | 问题 |
|---|------|------|------|
| 8 | `services/coupon-service.ts` | 32,48,72,107 | 券服务全量查询无 operator_id |
| 9 | `routes/referee-invite.ts` | 106,138,228,282 | 邀请状态更新无 operator_id |

### 修复模式参考

对于已有 `GET /operator/*` 列表接口正确做 operator 隔离的文件（如 `referees.ts:170-194`），可以复用其模式：

```typescript
// 方案 A：直接加 operator_id（表有该列时）
const existing = await queryOne(
  'SELECT id FROM venues WHERE id = $1 AND operator_id = $2',
  [id, req.user!.operatorId]
);

// 方案 B：通过 venue_id 间接限定（referees 场景）
const operatorVenues = await query('SELECT id FROM venues WHERE operator_id = $1', [opId]);
const venueIds = operatorVenues.map(v => v.id);
// WHERE r.venue_id IN (${venueIds})

// 方案 C：应用层二次校验
const record = await queryOne('SELECT operator_id FROM ref WHERE id = $1', [id]);
if (record?.operator_id !== req.user!.operatorId) return 403;
```

---

## 六、已扫描文件清单（57 个）

### routes/ (46 个)
`admin-attendance.ts`, `admin-banks.ts`, `admin-dashboard.ts`, `admin-finance.ts`, `admin-maps.ts`, `admin-marketing.ts`, `admin-merchant.ts`, `admin-operators.ts`, `admin-players.ts`, `admin-prize.ts`, `admin-rbac.ts`, `admin-season.ts`, `admin-settings.ts`, `admin-task.ts`, `announcement.ts`, `attendance.ts`, `auth.ts`, `client-log.ts`, `entry-deductions.ts`, `merchant-auth.ts`, `merchant-coupon.ts`, `merchant-verify.ts`, `merchant.ts`, `operator-finance.ts`, `operator-marketing.ts`, `operator-merchant.ts`, `operator-players.ts`, `operator.ts`, `player.ts`, `points-shop.ts`, `points.ts`, `prize.ts`, `race-packages.ts`, `race.ts`, `rank.ts`, `referee-invite.ts`, `referees.ts`, `season.ts`, `task.ts`, `upload.ts`, `users.ts`, `venues.ts`, `wx-mp-login.ts`, `wx-notify.ts`, `wx-pay.ts`

### services/ (2 个)
`coupon-service.ts`, `wechat-token.ts`

### db/ (1 个)
`migrations/run-migrations.ts`

### middleware/ (5 个)
`auth.ts`, `errorHandler.ts`, `logger.ts`, `rateLimiter.ts`, `rbac.ts`

### config/ (3 个)
`database.ts`, `index.ts`, `redis.ts`, `utils.ts`

---

## 七、审计方法说明

1. 全文搜索所有 `.ts` 文件中的 `queryOne`、`queryMany`、`query`、`execute`、`pool.query`、`pool.execute` 调用以及模板字符串中的 SQL 关键字
2. 提取每条 SQL 语句的目标表名
3. 交叉比对租户表清单，标记是否包含 `operator_id` 过滤条件
4. 按调用上下文分类：admin/operator/player/merchant/public
5. 排除主库表、player/merchant 端合理隔离、admin 有意跨租户等场景

---

*报告生成时间: 2026-07-06 | 审计工具: Claude Code Agent*
