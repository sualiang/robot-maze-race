# 多租户 SQL 审计报告

> 生成日期：2026-07-06
> 架构：共享数据库 + operator_id 代码层隔离
> 扫描范围：`packages/server/src/` 下 `routes/`, `services/`, `models/`, `db/`, `middleware/` 目录

---

## 核心定义

### 主库表（无需 operator_id，跳过审计）
`operators`, `operator_members`, `admin_users`, `admin_roles`, `settings`, `banks`, `seasons`, `regions`, `payments`, `settlement_records`

### 分库表（必须有 operator_id 过滤）
`venues`, `races`, `race_rooms`, `referees`, `referee_invites`, `users`, `user_profiles`, `merchants`, `race_packages`, `orders`, `points_transactions`, `points_exchange_log`, `user_coupons`, `merchant_coupons`, `expand_coupons`, `help_requests`, `help_helpers`

---

## 汇总

| 指标 | 数量 |
|------|------|
| 已扫描文件数 | 53 |
| 访问分库表的文件数 | 35 |
| 已有 operator_id 过滤（SQL 层 WHERE） | ~38 处 |
| 已有 operator_id 过滤（应用层 JS 校验） | ~8 处 |
| 已有 operator_id 过滤（INSERT 写入） | ~15 处 |
| **缺少 operator_id 过滤** | **见下** |
| ├ 🔴 高危（运营商后台 list 接口缺过滤） | 4 处 |
| ├ 🟡 中危（运营商后台单条 CRUD 缺 ownership 校验） | 6 处 |
| └ 🟢 低风险（玩家端 / 公共接口 / 超管全局视图） | ~165 处 |

> 注：`models/` 目录不存在，`db/` 仅有 DDL 迁移脚本，`middleware/` 无分库表 SQL。分库表 SQL 集中在 `routes/`（41 个文件）和 `services/`（1 个文件：`coupon-service.ts`）。

---

## 🔴 高危发现（运营商后台 list 接口缺少 operator_id 过滤）

### 1. `routes/operator.ts:1193-1208` — 裁判申请列表

| 行号 | 表 | SQL |
|------|-----|-----|
| 1193 | referees | `SELECT COUNT(*) as cnt FROM referees r ${whereClause}` — whereClause 仅含 status 过滤 |
| 1199-1208 | referees + venues | `SELECT ... FROM referees r LEFT JOIN venues v ... ${whereClause}` |

**影响**：`whereClause` 仅过滤 `r.status`，不含 `operator_id`。任何运营商可查看所有运营商的裁判申请列表。

### 2. `routes/operator-merchant.ts:59-70` — 待审核商户列表

| 行号 | 表 | SQL |
|------|-----|-----|
| 59 | merchants | `SELECT COUNT(*) as total FROM merchants m WHERE m.audit_status = 0` |
| 64-70 | merchants + operators | `SELECT m.*, op.name ... FROM merchants m LEFT JOIN operators op ... WHERE m.audit_status = 0` |

**影响**：只在 whereClause 中按 `audit_status` 和可选 `region` 过滤，不含 `operator_id`。运营商可审核不属于自己的商户。

### 3. `routes/operator.ts:1254-1278` — 裁判审核操作

| 行号 | 表 | SQL |
|------|-----|-----|
| 1254 | referees | `SELECT r.id, r.user_id, r.name ... FROM referees r WHERE r.id = $1` |
| 1276 | referees | `UPDATE referees SET status = $1 ... WHERE id = $6` |

**影响**：仅按 `id` 操作，无 operator_id 所有权校验。结合 #1 的列表泄漏，可构造请求审核其他运营商的裁判。

### 4. `routes/race-packages.ts:99-105` — 参赛包列表（公共接口）

| 行号 | 表 | SQL |
|------|-----|-----|
| 99-101 | race_packages | `SELECT COUNT(*) as count FROM race_packages ${whereClause}` — whereClause 仅含 status |
| 104-108 | race_packages | `SELECT * FROM race_packages ${whereClause} ORDER BY ...` |

**影响**：公共接口返回所有运营商的参赛包。如果是运营商后台接口应加 `operator_id`；如果是公共 catalog 则设计如此。

---

## 🟡 中危发现（运营商后台单条 CRUD 缺 ownership 校验）

### 5. `routes/operator.ts:697-702` — 场馆详情

```sql
SELECT ... FROM venues WHERE id = $1
```
仅按 id，无 operator_id 校验。

### 6. `routes/operator.ts:737-791` — 场馆编辑/状态变更

```sql
SELECT id FROM venues WHERE id = $1
UPDATE venues SET ... WHERE id = $5
UPDATE venues SET status = $1 WHERE id = $3
```
仅按 id，无 operator_id 校验。INSERT 时有 operator_id 但后续 UPDATE 不校验所有权。

### 7. `routes/race.ts:113-126` — 赛事列表

```sql
SELECT COUNT(*) / SELECT ... FROM races ${whereClause}
```
whereClause 仅按 `venue_id` 过滤。虽然 `venue_id` 在创建赛事时已校验 ownership，但列表接口直接信任传入的 `venue_id` 参数。

### 8. `routes/race.ts:266-299` — 赛事状态变更

```sql
SELECT id, status FROM races WHERE id = $1
UPDATE races SET status = $1 WHERE id = $3
```
仅按 id，无 operator_id 校验。

### 9. `services/coupon-service.ts:72-83` — 自动发券奖池

```sql
SELECT c.id, c.merchant_id, c.name, m.merchant_name
FROM merchant_coupons c
JOIN merchants m ON c.merchant_id = m.id
WHERE c.audit_status = 2 AND c.status = 1
  AND c.remain_count > 0 AND c.denomination_cents > 0
ORDER BY c.denomination_cents ASC
```
全局查询所有商户的可用优惠券，未按 operator_id 过滤。若被运营商 A 的用户触发，可能发运营商 B 的商户优惠券。

### 10. `services/coupon-service.ts:107` — 优惠券扣减

```sql
UPDATE merchant_coupons SET remain_count = remain_count - 1 WHERE id = $1 AND remain_count > 0
```
仅按 id 扣减，无 operator_id 校验。结合 #9，可扣减其他运营商商户的优惠券库存。

---

## ✅ 已有 operator_id 过滤（OK）

### SQL 层 WHERE 过滤

| 文件 | 行号 | 表 | SQL |
|------|------|-----|-----|
| `operator.ts` | 127 | venues | `SELECT id, name FROM venues WHERE operator_id = $1 LIMIT 1` |
| `operator.ts` | 663-665 | venues | `SELECT ... FROM venues WHERE operator_id = $1 ORDER BY ...` |
| `operator.ts` | 819-836 | orders | `... WHERE o.operator_id = $1` |
| `operator.ts` | 982-996 | venues/races/users/orders | `WHERE v.operator_id = $1` |
| `operator-finance.ts` | 43 | venues | `SELECT COUNT(*) FROM venues WHERE operator_id = $1` |
| `operator-players.ts` | 55,73,87,121 | users/venues | `WHERE v.operator_id = $1` |
| `operator-marketing.ts` | 215,247 | race_packages | `SELECT COUNT(*) FROM race_packages WHERE operator_id = $1` |
| `operator-merchant.ts` | 282-297 | merchant_coupons + merchants | `... AND m.operator_id = $2` |
| `operator-merchant.ts` | 434-447 | merchant_coupons + merchants | `... AND m.operator_id = $1` |
| `operator-merchant.ts` | 578-598 | merchant_coupons + merchants | `... AND m.operator_id = $1` |
| `referee-invite.ts` | 51 | referee_invites | INSERT 写入 operator_id |
| `referee-invite.ts` | 263 | referees | INSERT 写入 operator_id（来自 invite.operator_id） |
| `referees.ts` | 87 | referees | INSERT 写入 operator_id |
| `referees.ts` | 180 | venues | `SELECT id FROM venues WHERE operator_id = $1` |
| `referees.ts` | 465 | referees | INSERT 写入 operator_id（来自 body.operator_id） |
| `race.ts` | 40 | venues | `SELECT id, operator_id FROM venues WHERE id = $1` — 应用层校验 |
| `race.ts` | 54 | races | INSERT 写入 operator_id |
| `admin-operators.ts` | 446 | venues | `SELECT id FROM venues WHERE operator_id = $1` |
| `admin-operators.ts` | 454 | venues | `DELETE FROM venues WHERE operator_id = $1` |
| `admin-operators.ts` | 457,459 | referees | `SELECT user_id / DELETE FROM referees WHERE operator_id = $1` |
| `admin-operators.ts` | 465 | race_packages | `DELETE FROM race_packages WHERE operator_id = $1` |
| `admin-marketing.ts` | 109 | venues | `SELECT id FROM venues WHERE operator_id = $1` |
| `admin-dashboard.ts` | 214,230 | venues | `WHERE v.operator_id = $1` |
| `admin-dashboard.ts` | 356-420 | orders | 通过 `JOIN venues vv ON vv.operator_id = o.id` |
| `admin-players.ts` | 59 | venues | `conditions.push('v.operator_id = $N')` (条件性) |
| `admin-attendance.ts` | 61-63 | venues | `v.operator_id = $N` (条件性) |

### 应用层 JS 校验（次优，建议改为 SQL 层过滤）

| 文件 | 行号 | 表 | 方式 |
|------|------|-----|------|
| `race.ts` | 39-47 | venues | 先查出再比对 `venue.operator_id !== req.user?.operatorId` |
| `operator-merchant.ts` | 370-379 | merchant_coupons | `coupon.operator_id !== operatorId` |
| `operator-merchant.ts` | 499-511 | merchant_coupons | 同上 |
| `operator.ts` | 335-339 | operator_members | `existing.operator_id !== operatorId` |
| `operator.ts` | 405-409 | operator_members | 同上 |
| `operator.ts` | 442-446 | operator_members | 同上 |

### 间接多租户隔离（通过父实体拦截，设计正确）

这些模式通过父实体的 operator_id 校验实现隔离，SQL 本身不需要额外的 operator_id 过滤：

| 文件 | 隔离链 | 说明 |
|------|--------|------|
| `race.ts` | `venue_id` → `venues.operator_id` | 创建赛事时已校验 `venue.operator_id` |
| `referees.ts` | `venue_id IN (...)` | 裁判列表通过运营商 venues 集合过滤 |
| `merchant-coupon.ts` | `merchant_id` → `merchants.operator_id` | 优惠券通过商户间接隔离 |
| `merchant-verify.ts` | `merchant_id` (JWT auth) | 核销端通过商户认证隔离 |

---

## 🟢 低风险（玩家端 / 公共接口 / 超管全局视图）

以下查询按设计不需要 operator_id 过滤：

### 玩家自服务（全部按 `user_id` / `id` 隔离）

- `routes/auth.ts` — 登录/注册/密码重置，按 PK/phone/openid
- `routes/player.ts` — 个人中心/下单/帮助，全部 `WHERE user_id = $N`
- `routes/wx-mp-login.ts` — 微信登录，按 openid/userId
- `routes/wx-pay.ts` — 支付回调，按 order_no/id
- `routes/season.ts` — 赛季等级/奖励，按 user_id
- `routes/rank.ts` — 排行榜，全局聚合（设计如此）
- `routes/task.ts` — 任务系统，按 user_id
- `routes/points.ts` — 积分抽奖/兑换，按 user_id
- `routes/points-shop.ts` — 积分商城，按 user_id
- `routes/entry-deductions.ts` — 入场抵扣，按 user_id

### 公共接口

- `routes/venues.ts:44,50-57` — 场馆公开列表
- `routes/venues.ts:87-92` — 单个场馆公开详情
- `routes/merchant.ts:137` — 商户公开列表
- `routes/referee-invite.ts:91-93` — 邀请链接按 token 公开查询

### 裁判端（按 referee user_id 自服务）

- `routes/referees.ts` — 裁判个人信息/打卡/签到，按 user_id 或 referee id
- `routes/attendance.ts` — 考勤记录，按 referee_id

### 超管后台（全局视图，设计如此）

- `routes/admin-dashboard.ts:26` — `SELECT COUNT(*) FROM orders` 全局统计
- `routes/admin-merchant.ts` — 超管商户/优惠券管理
- `routes/admin-finance.ts` — 超管财务结算
- `routes/users.ts` — 超管用户管理
- `routes/prize.ts` — 抽奖奖品全局配置

### 商户端（按 merchant_id JWT 认证隔离）

- `routes/merchant-auth.ts` — 商户登录，按 merchant_id
- `routes/merchant-coupon.ts` — 商户优惠券 CRUD，按 merchant_id
- `routes/merchant-verify.ts` — 核销验证，按 verify_code/merchant_id
- `routes/upload.ts` — Logo 上传，按 merchant id

> ⚠️ 注意：如果未来迁移到真正的 Database-per-Tenant 架构（每个租户独立数据库），这些玩家端按 user_id 的查询天然安全。但如果保持共享数据库方案，则所有查询都需要 operator_id 过滤。

---

## 不含分库表访问的文件

以下文件仅访问主库表或无 SQL 语句：

### routes/ (无分库表 SQL)
- `admin-banks.ts` — 读取 JSON 文件
- `admin-finance.ts` — 仅 `settlements` 主库表
- `admin-maps.ts` — 读取 GeoJSON 文件
- `admin-prize.ts` — 仅 `lottery_prizes`（非分库表）
- `admin-rbac.ts` — 仅 `admin_roles`, `admin_users`
- `admin-season.ts` — 仅 `seasons` 主库表
- `admin-settings.ts` — 仅 `system_config`, `settings`
- `admin-task.ts` — 仅 `tasks`（非分库表）
- `announcement.ts` — 仅 `system_config`
- `client-log.ts` — 仅 `client_logs`（非分库表）

### services/
- `wechat-token.ts` — 微信 API token 缓存，无 SQL

### models/
- **目录不存在**

### db/
- `migrations/run-migrations.ts` — DDL 迁移，非业务查询

### middleware/
- `auth.ts`, `errorHandler.ts`, `logger.ts`, `rateLimiter.ts`, `rbac.ts` — 均无 SQL

---

## 🔧 修复建议

### 优先级 P0 — 立即修复

| 文件 | 行号 | 修复方式 |
|------|------|----------|
| `operator.ts` | 1193-1208 | 裁判列表 whereClause 加 `r.operator_id = $N` |
| `operator.ts` | 1254-1278 | 裁判审核 SELECT/UPDATE 加 `AND operator_id = $N` |
| `operator-merchant.ts` | 59-70 | 待审商户列表加 `m.operator_id = $N` 或确认 region 匹配等价于 operator 隔离 |
| `services/coupon-service.ts` | 72-83 | 自动发券查询加 `WHERE m.operator_id = $N` |
| `services/coupon-service.ts` | 107 | 优惠券扣减前校验商户归属 |

### 优先级 P1 — 尽快修复

| 文件 | 修复方式 |
|------|----------|
| `operator.ts:697-702` | 场馆详情加 `AND operator_id = $2` |
| `operator.ts:737-791` | 场馆编辑/状态变更加 ownership 校验 |
| `race.ts:113-126` | 赛事列表确认 venue_id 已校验或直接加 operator_id |
| `race.ts:266-299` | 赛事状态变更加 ownership 校验 |
| `race-packages.ts:99-105` | 如果是运营商后台接口则加 `operator_id`；如果是公共 catalog 则保持现状 |

### 修复模式

**修复前**：
```sql
SELECT * FROM venues WHERE id = $1
UPDATE referees SET status = $1 WHERE id = $2
```

**修复后**：
```sql
SELECT * FROM venues WHERE id = $1 AND operator_id = $2
UPDATE referees SET status = $1 WHERE id = $2 AND operator_id = $3
```

### 架构建议

1. **统一获取 operatorId**：认证中间件将 `operatorId` 注入 `req` 对象
2. **SQL 层过滤优于应用层校验**：`if (record.operator_id !== req.user.operatorId)` 是次优方案——数据已被查出，应改为 SQL WHERE 条件
3. **避免 TOCTOU**：SELECT → 应用层校验 → UPDATE 模式存在竞态条件，改为单条 SQL 带 `operator_id` 条件
4. **考虑 ORM/Query Builder 拦截**：创建 `queryWithTenant()` 辅助函数自动添加 `AND operator_id = ?`

---

*审计完成。报告生成于 2026-07-06。*
