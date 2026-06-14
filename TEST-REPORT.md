# 机器狗迷宫竞速赛事系统 — 全端测试报告

> 测试时间：2026-06-13  
> 测试范围：后端路由 / 前端页面 / 小程序 / 数据库 Schema / 已知问题  
> 测试方式：文件结构验证 + 代码审计 + 数据库直接查询  
> 总体健康度：**C (待修复大量关键问题)**

---

## 1. 后端路由检查

### 1.1 路由文件存在性

| 路由文件 | 是否存在 | 状态 |
|---------|---------|------|
| auth.ts | ✅ | 通过 |
| venues.ts | ✅ | 通过 |
| users.ts | ✅ | 通过 |
| referees.ts | ✅ | 通过 |
| race-packages.ts | ✅ | 通过 |
| player.ts | ✅ | 通过 |
| admin-operators.ts | ✅ | 通过 |
| admin-finance.ts | ✅ | 通过 |
| admin-marketing.ts | ✅ | 通过 |
| admin-settings.ts | ✅ | 通过 |
| admin-attendance.ts | ✅ | 通过 |
| admin-dashboard.ts | ✅ | 通过 |
| admin-rbac.ts | ✅ | 通过 |
| admin-banks.ts | ✅ | 通过 |
| admin-maps.ts | ✅ | 通过 |
| operator.ts | ✅ | 通过 |
| operator-finance.ts | ✅ | 通过 |
| operator-marketing.ts | ✅ | 通过 |
| client-log.ts | ✅ | 通过 |
| attendance.ts | ✅ | 通过 |
| race.ts | ✅ | 通过 |
| screen.ts | ❌ | **文件不存在** |
| operator-attendance.ts | ❌ | **文件不存在** |

⚠️ **指数/说明**  
- Expected 23 个路由文件，实际存在 21 个  
- `screen.ts` 不存在 → 大屏后台没有独立的路由，大屏功能分散在 `referees.ts` 中  
- `operator-attendance.ts` 不存在 → 运营商前台未实现签到功能（功能在 admin-attendance.ts 中）

### 1.2 路由挂载完整性（index.ts）

| 路由挂载 | 路径 | 是否挂载 |
|---------|------|---------|
| auth | `/api/v1/auth` | ✅ |
| users | `/api/v1/users` | ✅ |
| venues | `/api/v1/venues` | ✅ |
| referees | `/api/v1/referees` | ✅ |
| race-packages | `/api/v1/race-packages` | ✅ |
| race-packages (alias) | `/api/v1/packages` | ✅ |
| player | `/api/v1/player` | ✅ |
| admin/operators | `/api/v1/admin/operators` | ✅ |
| admin/finance | `/api/v1/admin/finance` | ✅ |
| admin/marketing | `/api/v1/admin/marketing` | ✅ |
| admin/settings | `/api/v1/admin/settings` | ✅ |
| admin/attendance | `/api/v1/admin/attendance` | ✅ |
| admin/dashboard | `/api/v1/admin/dashboard` | ✅ |
| admin/rbac | `/api/v1/admin/rbac` | ✅ |
| admin/banks | `/api/v1/admin/banks` | ✅ |
| admin/maps | `/api/v1/admin/maps` | ✅ |
| operator | `/api/v1/operator` | ✅ |
| operator/finance | `/api/v1/operator/finance` | ✅ |
| operator/marketing | `/api/v1/operator/marketing` | ✅ |
| attendance | `/api/v1/attendance` | ✅ |
| race (mounted under operator) | `/api/v1/operator` | ✅ |
| client-log | `/api/v1/client-log` | ✅ |
| health | `/api/v1/health` | ✅ |
| notFound | `/api/*` | ✅ |
| errorHandler | global | ✅ |

✅ 所有存在的路由文件均已正确挂载，无遗漏

### 1.3 路由代码质量检查

每个路由文件检查以下维度：

| 路由 | REST 方法完整 | 参数校验 | try-catch | 状态码覆盖 |
|------|--------------|---------|-----------|-----------|
| auth.ts | ✅ (POST/GET) | ✅ (code/jwt 校验) | ✅ | ✅ |
| venues.ts | ✅ (CRUD) | ✅ | ✅ | ✅ |
| users.ts | ⚠️ (不完整) | ✅ | ✅ | ✅ |
| referees.ts | ✅ (CRUD+WS) | ✅ | ✅ | ✅ |
| race-packages.ts | ✅ (CRUD) | ✅ | ✅ | ✅ |
| player.ts | ⚠️ (GET only) | ✅ | ✅ | ✅ |
| admin-operators.ts | ✅ (完整 CRUD) | ✅ (手机/邮箱正则) | ✅ | ✅ |
| admin-finance.ts | ⚠️ | ✅ | ✅ | ⚠️ |
| admin-marketing.ts | ⚠️ | ✅ | ✅ | ✅ |
| admin-settings.ts | ⚠️ | ✅ | ✅ | ✅ |
| admin-attendance.ts | ⚠️ | ✅ | ✅ | ✅ |
| admin-dashboard.ts | ✅ | ✅ | ✅ | ✅ |
| admin-rbac.ts | ✅ | ✅ | ✅ | ✅ |
| admin-banks.ts | ⚠️ | ✅ | ✅ | ✅ |
| admin-maps.ts | ⚠️ | ✅ | ✅ | ✅ |
| operator.ts | ✅ | ✅ | ✅ | ✅ |
| operator-finance.ts | ⚠️ | ✅ | ✅ | ✅ |
| operator-marketing.ts | ✅ upsert/batch | ✅ | ✅ | ✅ |
| client-log.ts | ✅ POST/GET | ✅ | ✅ | ⚠️ |
| attendance.ts | ✅ | ✅ | ✅ | ✅ |
| race.ts | ⚠️ (GET/PUT only) | ✅ | ✅ | ✅ |

#### 1.4 ❌ 重大问题：race.ts 引用了不存在的表 `races` 和 `race_records`

`packages/server/src/routes/race.ts` 代码中使用了以下表：
- `races` — ❌ **数据库中没有这个表**
- `race_records` — ❌ **数据库中没有这个表**

数据库 schema (`schema.sql`) 中没有定义 `races` 表。目前数据库中有 `race_results` 和 `checkins`，它们包含了比赛相关数据，但数据结构不同。

**影响**：所有 `/api/v1/operator/races` 路径的请求均会因 "no such table" 报错。

### 1.5 client_logs 表不存在于 schema.sql

| 项目 | 状态 |
|------|------|
| schema.sql 定义了 client_logs | ❌ **未定义** |
| 数据库中实际存在 client_logs | ✅ (已自动创建，通过运行时迁移) |
| 自动创建机制 | ⚠️ 依赖程序启动时的 INSERT 语句隐式创建 |

⚠️ `client_logs` 表没有在 schema.sql 中定义，但现有的数据库文件已包含此表。可能来自之前的版本或通过自动迁移创建。

---

## 2. 前端页面检查

### 2.1 运营商前台 (web → pages/operator/)

| 页面 | 文件存在 | 路由注册 |
|------|---------|---------|
| login → OperatorLoginPage.tsx | ✅ | ✅ |
| venues → VenueList.tsx / VenueEdit.tsx | ✅ | ✅ |
| referees → RefereeList.tsx | ✅ | ✅ |
| packages → PackageList.tsx | ✅ | ✅ |
| marketing → MarketingConfig.tsx | ✅ | ✅ |
| finance → FinanceCenter.tsx | ✅ | ✅ |
| profile → OperatorProfile.tsx | ✅ | ✅ |
| rbac → OperatorRbac.tsx, RoleManage, UserManage | ✅ | ✅ |
| races → OperatorRaces.tsx | ✅ | ✅ |
| race-detail → OperatorRaceDetail.tsx | ✅ | ✅ |

✅ 运营商前台 13 个页面文件全部存在且路由已注册

### 2.2 总部后台 (web → pages/admin/)

| 页面 | 文件存在 | 路由注册 |
|------|---------|---------|
| login → AdminLoginPage.tsx | ✅ | ✅ |
| setup → AdminFirstSetupPage.tsx | ✅ | ✅ |
| operators → OperatorManage.tsx | ✅ | ✅ |
| dashboard → OperatorDashboard.tsx | ✅ | ✅ |
| marketing → MarketingGlobal.tsx | ✅ | ✅ |
| finance → FinanceGlobal.tsx | ✅ | ✅ |
| rbac → index.tsx + AdminRoleManage + AdminUserManage | ✅ | ✅ |
| settings → SystemSettings.tsx + ProfitConfig.tsx | ✅ | ⚠️ |
| profile → AdminProfile.tsx | ✅ | ✅ |

⚠️ `ProfitConfig.tsx` 文件存在但未在 router 中注册（被 `SystemSettings.tsx` 包含）

### 2.3 大屏端 (web → pages/screen/)

| 页面 | 文件存在 | 路由注册 |
|------|---------|---------|
| login → ScreenLogin.tsx | ✅ | ✅ |
| display → ScreenDisplay.tsx | ✅ | ✅ |

✅ 大屏端页面完整

### 2.4 裁判端 (web → pages/referee/)

| 页面 | 文件存在 | 路由注册 |
|------|---------|---------|
| login → LoginPage.tsx | ✅ | ✅ |
| match → MatchPage.tsx | ✅ | ✅ |
| attendance → AttendancePage.tsx | ✅ | ✅ |
| history → HistoryPage.tsx | ✅ | ✅ |
| profile → ProfilePage.tsx | ✅ | ✅ |
| styles.css | ✅ | N/A |

✅ 裁判端页面完整

### 2.5 玩家端 (web → pages/player/)

| 页面 | 文件存在 |
|------|---------|
| player 页面目录 | ❌ **不存在** |

⚠️ 玩家端没有独立的 web 页面（在 Vite web 项目中）。玩家的用户操作通过 **微信小程序** (`packages/mini-program-player`) 实现。

### 2.6 ⚠️ 前端代码问题

**ScreenDisplay.tsx — 图标引入重复**

```typescript
// Line 3
import { ... , WifiOutlined, WifiOutlined as WifiOfflined } from '@ant-design/icons';
```

`WifiOutlined` 被引入两次，别名 `WifiOfflined` 与原始图标完全相同。断线状态将与在线状态显示相同的图标（WiFi满格），视觉上无法区分在线/离线。

**影响**：用户体验问题 — 网络断开时大屏不会显示断线提示图标。

---

## 3. 小程序代码检查

### 3.1 玩家小程序 (packages/mini-program-player/)

**app.json 页面注册：**
```
pages/index/index    → ✅ pages/index/index.js + wxml + wxss + json 全部存在
pages/packages/packages → ✅ 文件完整
pages/checkin/checkin   → ✅ 文件完整
pages/leaderboard/leaderboard → ✅ 文件完整
pages/profile/profile   → ✅ 文件完整
pages/help/help         → ✅ 文件完整
```

**TabBar 配置：**
| 标签 | 路径 | 图标 | 选中图标 |
|------|------|------|---------|
| 首页 | pages/index/index | ✅ | ✅ |
| 参赛包 | pages/packages/packages | ✅ | ✅ |
| 榜单 | pages/leaderboard/leaderboard | ✅ | ✅ |
| 我的 | pages/profile/profile | ✅ | ✅ |

**依赖/链接：**
- utils/request.js — ✅ 存在
- utils/auth.js — ✅ 存在
- utils/storage.js — ✅ 存在
- 所有 tabbar 图标文件 — ✅ 全部存在
- assets/images/banner.png — ✅ 存在

**TS 备份兼容：** `_ts_backup/` 目录保存了 TypeScript 源码版本，但运行时使用 JS 版本。

✅ **玩家小程序完整通过**

### 3.2 裁判小程序 (packages/mini-program-referee/)

**app.json 页面注册：**
```
pages/login/login         → ✅ 文件完整
pages/attendance/attendance → ✅ 文件完整
pages/match/match           → ✅ 文件完整
pages/history/history       → ✅ 文件完整
```

**TabBar 配置：**
| 标签 | 路径 | 图标 | 选中图标 |
|------|------|------|---------|
| 比赛 | pages/match/match | ✅ | ✅ |
| 签到 | pages/attendance/attendance | ✅ | ✅ |
| 记录 | pages/history/history | ✅ | ✅ |

**依赖/链接：**
- utils/request.js — ✅ 存在
- utils/storage.js — ✅ 存在
- utils/location.js — ✅ 存在
- utils/websocket.js — ✅ 存在
- 所有 tabbar 图标 — ✅ 全部存在

✅ **裁判小程序完整通过**

### 3.3 运营商小程序 (packages/mini-program-operator/)

**app.json 页面注册：**
```
pages/dashboard/dashboard         → ✅ 文件完整
pages/races/races                 → ✅ 文件完整
pages/race-detail/race-detail     → ✅ 文件完整
pages/profile/profile             → ✅ 文件完整
```

**TabBar 配置：**
| 标签 | 路径 | 图标 | 选中图标 |
|------|------|------|---------|
| 首页 | pages/dashboard/dashboard | ✅ | ✅ |
| 赛事 | pages/races/races | ✅ | ✅ |
| 我的 | pages/profile/profile | ✅ | ✅ |

**依赖/链接：**
- utils/request.js — ✅ 存在
- utils/storage.js — ✅ 存在
- 所有 tabbar 图标 — ✅ 全部存在

✅ **运营商小程序完整通过**

---

## 4. 数据库 Schema 检查

### 4.1 数据库基本信息

| 项目 | 值 |
|------|----|
| 数据库引擎 | SQLite (better-sqlite3) |
| 文件路径 | `packages/server/data/robot-maze-race.db` |
| foreign_keys 状态 | **OFF** (预期) |
| 表数量 | 20 |
| schema.sql 定义表数 | 19 (缺少 client_logs) |

### 4.2 表结构完整性检查

| 表名 | schema.sql 定义 | DB 中存在 | 字段完整 |
|------|---------------|----------|---------|
| users | ✅ | ✅ | ✅ |
| venues | ✅ | ✅ | ✅ |
| referees | ✅ | ✅ | ✅ |
| race_packages | ✅ | ✅ | ✅ |
| orders | ✅ | ✅ | ✅ |
| payments | ✅ | ✅ | ✅ |
| checkins | ✅ | ✅ | ✅ |
| race_results | ✅ | ✅ | ✅ |
| helps | ✅ | ✅ | ✅ |
| expand_coupons | ✅ | ✅ | ✅ |
| attendance | ✅ | ✅ | ✅ |
| settlements | ✅ | ✅ | ✅ |
| marketing_config | ✅ | ✅ | ✅ |
| system_config | ✅ | ✅ | 46 条配置 |
| idempotency_keys | ✅ | ✅ | ✅ |
| operators | ✅ | ✅ | ✅ (含迁移字段) |
| settings | ✅ | ✅ | ✅ |
| admin_roles | ✅ | ✅ | ✅ |
| admin_users | ✅ | ✅ | ✅ (含迁移字段) |
| client_logs | ❌ **未定义** | ✅ (自动创建) | ✅ |

### 4.3 ❌ 关键问题：race.ts 引用不存在的表

**验证方法**：代码审计 + DB 表列表验证

```typescript
// packages/server/src/routes/race.ts
router.get('/races', ...) // 访问 `races` 表 → ❌ 不存在
router.get('/races/:id/players', ...) // 访问 `race_records` 表 → ❌ 不存在
```

✅ 这些路由在 index.ts 中已挂载 (`/api/v1/operator`)，但运行时对所有请求会返回 500 错误。

### 4.4 系统配置数据

`system_config` 表包含 46 条营销配置记录，涵盖：
- 助力活动参数（最小/最大/默认值）
- 膨胀券参数（有效期、奖励数量）
- 充值券参数（有效期、奖励数量）
- 系统级配置（帮助相关等）

### 4.5 `marketing_config` FK 问题确认

| 检查项 | 结果 |
|--------|------|
| marketing_config.venue_id → venues(id) FK | ✅ **无问题** — FK 指向 venues.id 实际存在 |
| operator_marketing 使用虚拟 venue_id | ⚠️ 使用 `operator_{userId}` 作为 venue_id 插入 |
| FK 冲突 | ✅ 因为 `PRAGMA foreign_keys = OFF`，插入虚拟 venue_id 不会报错 |
| 风险 | ⚠️ 如果未来开启 FK 约束，虚拟 venue_id 会触发约束失败 |

---

## 5. 已知问题确认

### 5.1 前端错误上报

| 检查项 | 状态 |
|--------|------|
| sendBeacon 通道 | ✅ main.tsx 实现完整 |
| XMLHttpRequest 双通道 | ✅ 原生 XHR 实现 |
| fetch 劫持 | ✅ |
| window.onerror | ✅ |
| unhandledrejection | ✅ |
| console.error 劫持 | ✅ |
| console.warn 劫持 | ✅ |
| 循环上报防护 | ✅ (source === 'reportError' 检测) |
| 页面存活检测 | ✅ (3s 后发送 liveness) |
| 服务端 client-log.ts 处理 | ✅ (POST + GET/beacon) |
| 数据库持久化 | ✅ (client_logs 表) |

✅ **前端错误上报功能完整，双通道可靠**

### 5.2 运营商登录流程

| 检查项 | 状态 |
|--------|------|
| auth.ts `/login` 支持 role='operator' | ✅ |
| 使用 operator_username 查询 | ✅ |
| bcrypt 密码验证 | ✅ |
| 状态检查 (active/disabled) | ✅ |
| password_change_required 判断 | ✅ |
| JWT 携带 passwordChangeRequired | ✅ |
| 管理员创建运营商自动生成账号 | ✅ (admin-operators.ts) |
| 重置密码能力 | ✅ (admin-operators.ts /reset-password) |
| 手机号+用户名双模式登录 | ✅ (admin-login 支持) |

✅ **运营商登录流程完整正常**

### 5.3 broadcastToScreen 引用

| 检查项 | 状态 |
|--------|------|
| broadcastToScreen 在 ws/handler.ts 定义 | ✅ 已导出 |
| referees.ts 引用 broadcastToScreen | ✅ |
| screen 路由文件 | ❌ **不存在** (大屏功能通过 WebSocket 实时推送，非 REST API) |
| getCurrentScreenData 循环依赖 | ⚠️ ws/handler.ts 从 ../routes/referees 导入 |

⚠️ `ws/handler.ts` 导入 `getCurrentScreenData` 来自 `referees.ts`，而 `referees.ts` 导入 `broadcastToScreen` 来自 `ws/handler.ts`，形成**循环引用**。Node.js 模块系统（ESM）可能会处理此问题，但有潜在的初始化顺序风险。

### 5.4 前端登录页检查

| 页面 | 是否存在 | 路由注册 |
|------|---------|---------|
| 运营商登录页 (OperatorLoginPage.tsx) | ✅ | ✅ |
| 总部后台登录页 (AdminLoginPage.tsx) | ✅ | ✅ |
| 大屏登录页 (ScreenLogin.tsx) | ✅ | ✅ |
| 裁判登录页 (LoginPage.tsx) | ✅ | ✅ |
| 玩家登录页 | ❌ | 玩家无需 web 登录（使用小程序） |

✅ 所有需要的登录页均已实现

---

## 6. 总体健康度评估

### 6.1 评分

| 模块 | 评分 | 说明 |
|------|------|------|
| 后端路由 | C | race.ts 引用了不存在表，2 个路由文件缺失 |
| 前端页面 | B | 页面文件完整，但有图标导入问题 |
| 小程序 | A | 3 个小程序完整无缺失 |
| 数据库 Schema | C | 缺少 client_logs 表定义，缺少 races/race_records 表 |
| 已知问题 | B | 错误上报 OK，循环引用需注意 |
| **总体** | **C** | **需优先修复 races 表缺失的致命问题** |

### 6.2 必须修复的问题 (P0)

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | `races` 表不存在 | 🔴 致命 | race.ts 路由全部不可用 |
| 2 | `race_records` 表不存在 | 🔴 致命 | race.ts `/races/:id/players` 不可用 |
| 3 | `client_logs` 表未在 schema.sql 定义 | 🟠 高 | 从 schema 初始化的新实例会缺少该表 |

### 6.3 建议修复问题 (P1)

| # | 问题 | 说明 |
|---|------|------|
| 4 | ws/handler.ts 与 referees.ts 循环引用 | 需抽取共享类型到独立模块 |
| 5 | ScreenDisplay.tsx Wifi 图标重复导入 | `WifiOutlined as WifiOfflined` 导致断线无对应图标 |
| 6 | screen.ts 路由文件缺失 | 可考虑作为独立 ws handler 的管理端 |
| 7 | operator-attendance.ts 缺失 | 如需要运营商管理签到，应实现该路由 |
| 8 | foreign_keys = OFF 掩盖虚假 venue_id | 未来开启 FK 约束会触发 marketing_config 错误 |

### 6.4 数据结构补充建议

**races 表建议 schema：**
```sql
CREATE TABLE IF NOT EXISTS races (
  id TEXT PRIMARY KEY,
  venue_id TEXT REFERENCES venues(id),
  name VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  start_time TEXT,
  end_time TEXT,
  description TEXT,
  player_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**race_records 表建议 schema：**
```sql
CREATE TABLE IF NOT EXISTS race_records (
  id TEXT PRIMARY KEY,
  race_id TEXT REFERENCES races(id),
  user_id TEXT REFERENCES users(id),
  score_ms INTEGER,
  rank INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  finished INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 附录

### A. 后端 API 完整映射

| 方法 | 路径 | 路由文件 | 状态 |
|------|------|---------|------|
| POST | /api/v1/auth/wx-login | auth.ts | ✅ |
| POST | /api/v1/auth/admin-login | auth.ts | ✅ |
| POST | /api/v1/auth/login | auth.ts | ✅ |
| GET | /api/v1/auth/me | auth.ts | ✅ |
| POST | /api/v1/auth/refresh | auth.ts | ✅ |
| POST | /api/v1/auth/admin/change-password | auth.ts | ✅ |
| POST | /api/v1/auth/admin/first-login-setup | auth.ts | ✅ |
| GET | /api/v1/health | index.ts | ✅ |
| POST | /api/v1/client-log | client-log.ts | ✅ |
| GET | /api/v1/client-log | client-log.ts | ✅ |
| GET | /api/v1/operator/races | race.ts | ❌ |
| GET | /api/v1/operator/races/:id | race.ts | ❌ |
| GET | /api/v1/operator/races/:id/players | race.ts | ❌ |
| PUT | /api/v1/operator/races/:id/status | race.ts | ❌ |

### B. WebSocket 通道

| 通道 | 路径 | 功能 | 状态 |
|------|------|------|------|
| 大屏 | /ws/screen | 比赛实时数据推送 | ✅ |
| 裁判 | /ws/referee | 场馆状态同步 | ✅ |
| 裁判 (alias) | /api/v1/ws/referee | 兼容路径 | ✅ |

### C. 数据库记录抽样

- **system_config**: 46 条（营销全参数范围）
- **marketing_config**: 10 条（1 个运营商的全部配置）
- **operators**: 1 条（测试运营商）
- **venues/venues**: 空（仅有 schema）
- **admin_users**: 1 条（默认超级管理员 admin/admin123）
- **admin_roles**: 空（仅有 schema）
- **orders/payments/checkins**: 空（测试数据未录入）
