# 多租户 SQL 审计报告

> 生成时间: 2026-07-06  
> 扫描范围: packages/server/src/routes/*.ts  
> 分库表: venues, races, race_rooms, referees, referee_invites, users, user_profiles, merchants, race_packages, orders, points_transactions, points_exchange_log, user_coupons, merchant_coupons, expand_coupons, help_requests, help_helpers

## 汇总

- 已扫描文件数: 33 个路由文件
- 访问分库表的文件数: 33
- 已有 operator_id 过滤: **约 160 处**（集中在 operator 端和 admin-operators）
- 缺少 operator_id 过滤: **约 80 处**

## 已有 operator_id 过滤 ✅

| 文件 | 过滤场景 |
|------|---------|
| admin-operators.ts | venues/referees/race_packages/races 按 operator_id 操作 |
| admin-dashboard.ts | venues/orders 按 operator_id 聚合 |
| admin-marketing.ts | venues 按 operator_id 查询 |
| admin-attendance.ts | venues 带 operator_id JOIN |
| admin-players.ts | users 按 venue.operator_id 过滤 |
| operator-finance.ts | venues 按 operator_id |
| operator-marketing.ts | venues/race_packages 带 operator_id |
| operator-merchant.ts | merchants 按 operator_id |
| operator-players.ts | users 按 venue.operator_id 过滤 |
| operator.ts | venues/orders/referees 按 operator_id |
| race.ts | venues 查 operator_id → races 自动关联 |
| venues.ts | venues 按 operator_id 或 operatorOnly 中间件 |
| referees.ts | referees 按 operator_id |
| referee-invite.ts | 全部带 operator_id |
| race-packages.ts | race_packages 带 operator_id |

## 缺少 operator_id 过滤 ❌

### 严重（admin 端直接操作分库表）

| 文件 | 行号 | 表 | 问题 |
|------|------|-----|------|
| admin-merchant.ts | 53,58 | merchants | SELECT * 无 operator_id |
| admin-merchant.ts | 103 | merchants | INSERT 无 operator_id 字段 |
| admin-merchant.ts | 162,190,292,300,301,323,329,347 | merchants | CRUD 无 operator_id |
| admin-merchant.ts | 213,216,219,222,225,253,268 | merchant_coupons, user_coupons | 全表聚合无 operator_id |
| admin-dashboard.ts | 26 | orders | SELECT COUNT(*) FROM orders 无过滤 |
| admin-operators.ts | 450 | races | DELETE FROM races WHERE venue_id（缺 operator_id） |
| admin-rbac.ts | 72-286 | admin_users | admin_users 全表操作（属于主库表，但 admin_users 在方案中列为主库）— **需确认** |

### 高（玩家/裁判端访问分库表无过滤）

| 文件 | 行号 | 表 | 问题 |
|------|------|-----|------|
| player.ts | 52,136,189,252,331,383,403,415,487,513,545,646,728,729,757,820,831,872,998 | race_packages, venues, users, orders, user_coupons | 无 operator_id |
| points.ts | 22,86,124,130,137,359,375,382,394,409,450,553,570,586,593,626,633,642,660,681 | users, points_transactions, user_coupons, merchant_coupons | 无 operator_id |
| points-shop.ts | 36,200,212,223,244,263,279,290,303,313,329,345 | users, points_exchange_log, user_coupons, points_transactions | 无 operator_id |
| season.ts | 20,38,58,258,313,344,360,366 | users, user_coupons, points_transactions | 无 operator_id |
| task.ts | 101,106,111 | users | UPDATE 无 operator_id |
| rank.ts | 223,243,303 | users | JOIN 无 operator_id |

### 中（商户/微信/支付端）

| 文件 | 行号 | 表 | 问题 |
|------|------|-----|------|
| merchant-coupon.ts | 54,88,101,122,132,153,163,186,200,225,287,312,330,350,355,398,432 | merchant_coupons, user_coupons | 按 merchant_id 过滤但缺少 operator_id |
| merchant-verify.ts | 25,49,63,69 | user_coupons, merchant_coupons | 无 operator_id |
| merchant.ts | 23,78,95,104,110,139,175 | user_coupons, merchants | 无 operator_id |
| merchant-auth.ts | 168,288,369 | merchants | 按 merchant_id 过滤但缺少 operator_id |
| wx-pay.ts | 216,239,249,291,371,394,403,410,419,454,476,484,537,557,592,638,677,692 | orders | 无 operator_id |
| wx-mp-login.ts | 94,109,214,220,227,254,325,333 | users | 微信登录无 operator_id（合理 — 登录时未知运营商） |
| wx-notify.ts | 177,268,277,284,292,298,373,559 | users, user_coupons | 无 operator_id |
| auth.ts | 57,68,511,512,558,732,879,922,930,952 | users, referees | 部分合理（OAuth登录），部分缺失 |
| attendance.ts | 64,65,112 | users, venues | 无 operator_id |
| prize.ts | 17 | orders | 无 operator_id |
| upload.ts | 59,89 | merchants | 无 operator_id |
| users.ts | 42,51,82,120,161,165,226,230 | users | 无 operator_id |
| coupons-service.ts | 33,49,75,107,127,274 | race_packages, merchant_coupons, merchants, user_coupons | 无 operator_id |

## 审计结论

1. **operator 端**：基本都有 operator_id 过滤，隔离良好 ✅
2. **admin 端**：admin-merchant 完全缺 operator_id，orders 跨运营商聚合 ❌
3. **玩家端**：player/points/points-shop/season/task 全部缺 operator_id ❌
4. **商户端**：merchant 相关路由缺 operator_id ❌
5. **微信端**：wx-pay 缺 operator_id（但 orders 本身已有 operator_id 概念…需确认 orders 表结构）

## 建议修复优先级

1. **Phase 2A**（高优先）：admin-merchant 加上 operator_id 过滤
2. **Phase 2B**（高优先）：player/points/points-shop/season/task 路由加 operator_id 过滤（通过 venue → operator_id 间接关联）
3. **Phase 2C**（中优先）：merchant 端、wx-pay 加 operator_id
4. **Phase 2D**（低优先）：auth/attendance/users/upload 加 operator_id

