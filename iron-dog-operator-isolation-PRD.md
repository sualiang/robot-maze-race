# 铁甲快狗玩家小程序 — 运营商数据隔离 PRD V1.0
**文档编号**：PRD-2026-0714-001
**状态**：已定稿，待开发
**日期**：2026-07-14
**产品负责人**：豆包
**对齐方案**：《铁甲快狗玩家小程序 运营商数据隔离与用户体系 产品优化终稿》（Allen, 2026-07-14）

---

## 一、背景与目标

### 1.1 业务背景
铁甲快狗采用多运营商架构，各运营商独立运营赛场。当前部分业务表已有 `operator_id`，但仍有 12 张业务表缺失该字段，导致数据无法按运营商隔离。同时，`用户`、`积分/等级`、`互助`三类数据需全局共享，跨运营商通用。

### 1.2 目标
1. 12 张表补充 `operator_id` 字段 + 索引，实现运营商数据完全隔离
2. 3 张门票/抽奖废弃表清理
3. 后端业务层所有隔离表查询/写入强制 `WHERE operator_id = ?`
4. 前端小程序端实现「线下带参扫码唯一入口」逻辑

---

## 二、数据库变更（小D 执行）

### 2.1 删除表（3 张，已确认废弃）
| 表名 | 说明 |
|------|------|
| `user_tickets` | 门票（废弃） |
| `lottery_records` | 抽奖记录（废弃） |
| `lottery_prizes` | 抽奖奖品（废弃） |

**执行约束**：先备份表数据为 CSV → DROP TABLE → 验证无代码引用

### 2.2 新增 operator_id 字段（12 张表）

| # | 表名 | 业务含义 | DDL |
|---|------|---------|-----|
| 1 | `user_coupons` | 用户消费券 | `ALTER TABLE user_coupons ADD COLUMN operator_id VARCHAR(36) NOT NULL DEFAULT '' AFTER id;` |
| 2 | `coupon_verify_log` | 消费券核销记录 | 同上 |
| 3 | `entry_deductions` | 参赛抵扣卡核销 | 同上 |
| 4 | `expand_coupons` | 抵扣卡 | 同上 |
| 5 | `point_shop` | 积分商城商品 | 同上 |
| 6 | `points_exchange_log` | 积分兑换记录 | 同上 |
| 7 | `checkins` | 签到记录 | 同上 |
| 8 | `attendance` | 活动参与 | 同上 |
| 9 | `race_results` | 比赛成绩 | 同上 |
| 10 | `payment_transactions` | 支付流水 | 同上 |
| 11 | `payments` | 支付单 | 同上 |
| 12 | `merchant_admin` | 商家管理员 | 同上 |

**索引**：每张表执行 `CREATE INDEX idx_operator_id ON <table>(operator_id);`

**存量数据迁移**：
- 上述 12 张表中，需根据业务关联关系回填 `operator_id`
- `user_coupons` / `coupon_verify_log`：通过 `coupon_id → coupons.operator_id`
- `entry_deductions`：通过 `user_coupon_id → user_coupons.operator_id`
- `point_shop` / `points_exchange_log`：需要确认现有商品归属，默认归属首个运营商
- `payment_transactions` / `payments` / `orders`：已有 `operator_id`，直接继承
- `checkins` / `attendance`：通过关联的 `venue_id → venues.operator_id`
- `race_results`：通过 `race_id → races.operator_id`
- `merchant_admin` / `merchant_coupons`：通过 `merchant_id → merchants.operator_id`

### 2.3 全局共享表（不修改，6 张）
| 表名 | 业务含义 |
|------|---------|
| `users` | 用户身份（openid 唯一） |
| `points_transactions` | 积分流水（全局累计） |
| `combat_power` | 战力（全局成长） |
| `season_user_info` | 赛季用户信息 |
| `helps` | 互助主表（全局，同一好友只能助力一次） |
| `help_helpers` | 互助助力记录（全局） |

### 2.4 已隔离表（无需修改，已有的）
venues, races, race_packages, referees, orders, merchants, merchant_invite_codes, race_attendance, race_records, settlements, ticket_redemptions, referee_invites

---

## 三、后端业务逻辑变更（小C 执行）

### 3.1 运营商上下文机制
- 用户通过带参扫码进入小程序时，后端解析 URL 参数 `operator_id` + `venue_id`
- 后端生成当前会话的运营商上下文（Redis/Session），有效期跟随小程序登录态
- 所有隔离表（2.2 + 2.4 中所有带 `operator_id` 的表）的 CRUD 操作，强制携带 `WHERE operator_id = ?`，`operator_id` 从当前会话上下文读取
- **不允许前端传参指定 operator_id**，防止篡改

### 3.2 受影响的接口（按模块）
#### 消费券模块
- `GET /api/v1/coupons` — 查询加 `WHERE operator_id = ?`
- `POST /api/v1/coupons/use` — 核销加 operator_id 校验
- `GET /api/v1/coupons/verify-log` — 核销记录加 operator_id 过滤

#### 抵扣卡模块
- `GET /api/v1/entry-deductions` — 查询加 operator_id
- `POST /api/v1/entry-deductions` — 新增加 operator_id

#### 积分商城模块
- `GET /api/v1/point-shop` — 商品列表加 `WHERE operator_id = ?`
- `POST /api/v1/point-shop/exchange` — 兑换时校验商品 operator_id 匹配当前上下文
- `GET /api/v1/point-shop/exchange-log` — 兑换记录加 operator_id 过滤

#### 签到/活动模块
- `POST /api/v1/checkin` — 签到记录加 operator_id
- `GET /api/v1/checkins` — 查询加 operator_id
- `GET/POST /api/v1/attendance` — 活动参与加 operator_id

#### 比赛成绩模块
- `GET /api/v1/race-results` — 按当前上下文 operator_id 过滤
- `POST /api/v1/race-results` — 新增带 operator_id

#### 支付模块
- `POST /api/v1/payment` — 创建支付单带 operator_id
- `GET /api/v1/payment/transactions` — 流水查询加 operator_id

#### 商家模块
- `GET /api/v1/merchant/admin` — 商家管理员加 operator_id
- `GET /api/v1/merchant/coupons` — 商家券加 operator_id

### 3.3 全局数据接口（不修改）
- 用户信息、积分查询、等级/战力查询 → 不加 operator_id 限制
- 互助助力（helps/help_helpers）→ 不加 operator_id，但保持「同好友同活动只能助力一次」的业务限制

### 3.4 代码审查 Checklist
- [ ] 所有 INSERT 语句是否自动填充 `operator_id`
- [ ] 所有 SELECT/UPDATE/DELETE 是否带 `WHERE operator_id = ?`
- [ ] 是否有接口允许前端传入 `operator_id`（禁止）
- [ ] 是否有 JOIN 查询漏了 operator_id 条件导致窜数
- [ ] 全局数据接口是否误加了 operator_id 限制

---

## 四、前端小程序端变更（小C 执行）

### 4.1 入口逻辑
- 小程序首页 `onLaunch` / `onShow` 解析 `scene` 参数
- 若 URL 携带 `operator_id` + `venue_id`：建立运营商会话上下文，开放全部业务入口
- 若 URL 无参数：仅展示品牌静态内容 + 引导线下扫码，隐藏购买/参赛/商城入口

### 4.2 页面状态对照

| 功能 | 带参扫码进入 | 非带参进入 |
|------|-------------|-----------|
| 品牌介绍 | ✅ | ✅ |
| 全局积分/等级 | ✅ | ✅（已登录） |
| 参赛包购买按钮 | ✅ 显示 | ❌ 隐藏 + 引导扫码浮层 |
| 消费券/抵扣卡入口 | ✅ 显示 | ❌ 隐藏 |
| 积分商城入口 | ✅ 显示（当前运营商商品） | ❌ 隐藏 |
| 签到/排队入口 | ✅ 显示 | ❌ 隐藏 |
| 历史成绩 | ✅ 当前运营商 | ❌ 不显示明细 |
| 运营商/赛场选择 | ❌ 无手动入口 | ❌ 无手动入口 |
| 位置权限请求 | ❌ 不调用 | ❌ 不调用 |

### 4.3 UI 变更
- 非带参进入时，首页常驻引导条：「请前往线下赛场扫描官方小程序码，解锁参赛功能」
- 参赛包/商城/签到等入口按钮，在无运营商上下文时替换为置灰状态 + 引导文案

---

## 五、测试用例（豆包制定，小D 执行）

### 5.1 数据隔离测试
| 用例ID | 场景 | 操作 | 预期 |
|--------|------|------|------|
| T-01 | A运营商购买参赛包 | 扫A码 → 购买 | order 记录 operator_id = A |
| T-02 | 跨运营商不可见 | 扫B码 → 查看参赛包 | 不显示A运营商的参赛包 |
| T-03 | 积分全局通用 | A运营商获积分 → 扫B码 | 积分不变，可查看 |
| T-04 | 互助全局唯一 | 好友在A助力 → 同一活动B再助力 | 提示已助力，不可重复 |

### 5.2 入口逻辑测试
| 用例ID | 场景 | 操作 | 预期 |
|--------|------|------|------|
| T-05 | 非带参进入 | 搜索/分享进入小程序 | 不可购买，引导条显示 |
| T-06 | 带参扫码进入 | 线下扫码 | 全部业务入口开放 |
| T-07 | 跨运营商扫码 | 已登录A → 扫B码 | 自动切换B上下文，A数据不可见 |

### 5.3 废弃表清理测试
| 用例ID | 场景 | 操作 | 预期 |
|--------|------|------|------|
| T-08 | 代码无引用 | 搜索全仓库 | user_tickets/lottery 相关代码已删除或注释 |
| T-09 | 删表后服务正常 | DROP TABLE | 小程序+后台所有功能正常 |

---

## 六、验收标准

1. **数据隔离**：A运营商数据在B运营商上下文中完全不可见、不可操作
2. **全局共享**：同一 openid 跨运营商积分/等级不丢失
3. **互助唯一**：好友跨运营商同一活动只能助力一次
4. **入口唯一**：非带参进入无法购买、无法查看运营商权益
5. **废弃表清理**：user_tickets / lottery_records / lottery_prizes 已删除且无代码引用
6. **回归测试**：现有功能（非隔离相关）不受影响

---

## 七、执行分工与排期

| 角色 | 任务 | 预估耗时 | 前置依赖 |
|------|------|---------|---------|
| 小D | DDL（12 表加字段 + 索引 + 存量回填） | 1h | 无 |
| 小D | 废弃表备份 + DROP | 30min | 代码检查通过 |
| 小C | 后端接口补 operator_id 过滤 | 4h | DDL 完成 |
| 小C | 前端入口逻辑 + UI 变更 | 4h | 后端接口就绪 |
| 小D | 测试执行（5.1-5.3） | 2h | 前后端部署完成 |
| 豆包 | 验收 | 1h | 测试报告提交 |

---

_本文档由豆包（product-manager）输出，对齐 Allen 产品优化终稿及小D数据库评估。_
