# 铁甲快狗 (Iron Dog) — 机器狗迷宫竞速赛事

> 多端 SPA 赛事管理平台：总部后台 + 运营商 + 商家 + 裁判 + 大屏 + 玩家小程序
>
> **GitHub**: [sualiang/robot-maze-race](https://github.com/sualiang/robot-maze-race)
> **接手日期**: 2026-07-19，从前团队交接，继续开发

---

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Express 4 + TypeScript (CommonJS), `mysql2`, `bcryptjs`, JWT, WebSocket |
| 前端 Web | React 19 + Vite 8 + TypeScript, Ant Design 6, ECharts 6 |
| 小程序 | 微信原生小程序 (WXML/WXSS/JS)，AppID: `wx619c9f373868ab63` |
| 数据库 | MySQL 8.4，公共库 `robot_maze_race_common` + 每运营商独立库 `op_{operator_id}` |
| 共享 | `shared/` 包 — TypeScript 类型定义，被 server 和 web 引用 |

---

## 目录结构

```
robot-maze-race/
├── server/                  # Express 后端 (端口 3000)
│   ├── src/
│   │   ├── config/          # database.ts, bcrypt.ts, index.ts, redis.ts
│   │   ├── db/              # SQL schema: common.sql, operator.sql
│   │   ├── middleware/       # auth.ts, rbac.ts, errorHandler.ts, logger.ts
│   │   ├── routes/          # 40+ 路由文件（按业务模块）
│   │   ├── services/        # 微信 token/qrcode/message/pay
│   │   └── ws/              # WebSocket handler
│   ├── tests/               # Jest 测试
│   └── .env.example         # 环境变量模板
├── web/                     # React 前端 (Vite, 端口 5173)
│   └── src/
│       ├── pages/           # admin/, operator/, merchant/, referee/, screen/
│       ├── layouts/         # AdminLayout, OperatorLayout, etc.
│       ├── components/
│       ├── hooks/
│       ├── utils/           # api.ts, ws-client.ts
│       └── router/          # React Router 配置
├── mini-program-player/     # 微信小程序（玩家端）
│   ├── pages/               # index, race, leaderboard, profile, login, ...
│   ├── utils/               # auth.js, request.js, storage.js
│   ├── assets/              # 图片、图标
│   └── app.js / app.json
├── shared/                  # 共享 TS 类型（@robot-race/shared）
│   └── src/types/           # user.ts, race.ts, venue.ts, referee.ts, ...
├── 00-constitution/         # SASDT 体系规则文档（AI 角色规范）
├── 01-project/              # 项目业务上下文文档
├── 02-knowledge/            # 最佳实践、Bug 案例
├── 03-shared-memory/        # 共享记忆
└── 99-meta/                 # MCP 元数据
```

---

## 本地开发

### 前置条件
- Node.js >= 18
- MySQL 8.4 运行在 `127.0.0.1:3308`，root 密码 `IronDog2026!Root`

### 启动步骤

```bash
# 1. 启动 MySQL（如未运行）
"/c/Program Files/MySQL/MySQL Server 8.4/bin/mysqld.exe" \
  --defaults-file="C:/Users/suali/robot-maze-race/server/my.cnf" &

# 2. 构建 shared 包
cd shared && npm install && npx tsc

# 3. 构建并启动后端
cd server
npm install
npx tsc
cp src/db/*.sql dist/db/
cp src/banks.json dist/banks.json
cp src/pca-code.json dist/pca-code.json
node dist/server.js

# 4. 启动前端
cd web
npm install
npx vite --host 0.0.0.0 --port 5173
```

### 启动微信开发者工具
```
"C:\Program Files (x86)\Tencent\微信web开发者工具\wechatdevtools.exe"
# 导入项目: C:\Users\suali\robot-maze-race\mini-program-player
```

---

## 入口与账号

| 端 | URL | 账号 | 密码 |
|----|-----|------|------|
| 总部后台 | `http://localhost:5173/admin/login` | `admin` | `Admin@2026` |
| 运营商端 | `http://localhost:5173/operator/login` | `13999999999` | `Operator2026` |
| 商家端 | `http://localhost:5173/merchant/login` | 需运营商创建 | — |
| 裁判端 | `http://localhost:5173/referee/login` | 微信 OAuth | — |
| 大屏端 | `http://localhost:5173/screen` | 激活码(自动刷新) | — |
| 玩家小程序 | 微信开发者工具模拟器 | 微信登录/手机号 | — |

---

## 数据库架构

### 多租户模式
- **公共库** `robot_maze_race_common`: users, operators, admin_users, admin_roles, system_config, seasons, tasks, referee_invites 等全局表
- **运营商库** `op_{operator_id}`: venues, referees, race_packages, orders, payments, checkins, race_results, attendance, merchants, merchant_coupons 等业务表
- 路由通过 `queryOp/executeOp(req, sql, params)` 自动解析 req 中的 operator context 并路由到对应库

### MySQL 8.4 注意事项
- `CREATE INDEX IF NOT EXISTS` 不支持 → 已改为 `CREATE INDEX`
- TEXT/BLOB/JSON 列不能有 `DEFAULT ''` → 已移除
- `schema.mysql.sql` 仅作参考，实际自动建表用 `common.sql` + `operator.sql`

---

## API 约定

- 前缀: `/api/v1/`
- 认证: `Authorization: Bearer <JWT>`
- 响应格式: `{ code: 0, message: "ok", data: {...} }`
- 错误: `{ code: 4xx/5xx, message: "...", data: null }`
- RBAC: `authMiddleware` → `checkPermission('resource:action')`，超管 `*` 通配

### 路由注册模式
```typescript
// 在 src/index.ts 中注册
app.use('/api/v1/admin/operators', adminOperatorRoutes);
```

---

## 最近的重要修复

| 日期 | 修复内容 |
|------|---------|
| 2026-07-19 | bcrypt.ts 移除明文密码日志 + delete require.cache hack |
| 2026-07-19 | admin-finance.ts 修复 SQL 拼接注入 (line 617) |
| 2026-07-19 | config/index.ts JWT_SECRET 生产环境不再有硬编码 fallback |
| 2026-07-19 | 创建 .gitignore + .env.example，防止凭据泄露 |
| 2026-07-19 | SQL schema 兼容 MySQL 8.4 (IF NOT EXISTS / TEXT DEFAULT) |
| 2026-07-19 | server/package.json build script 包含 banks.json |
| 2026-07-19 | shared 包 TypeScript 编译 + server tsc 编译通过 |

---

## 开发约定

1. **所有修改先读文件再编辑** — Edit 工具要求文件已在上下文中
2. **修改后自动构建验证** — `npx tsc` 确认无编译错误
3. **完成后 git add + commit + push** — 遵循 auto-commit 约定
4. **数据库变更** — 新表在 `common.sql` 或 `operator.sql` 中添加 `CREATE TABLE IF NOT EXISTS`
5. **新路由** — 在 `server/src/routes/` 创建文件，在 `server/src/index.ts` 注册
6. **前端新页面** — 在 `web/src/pages/` 创建，在 `web/src/router/index.tsx` 注册
7. **小程序新页面** — 在 `app.json` 的 `pages` 数组中注册
8. **环境变量** — 只加到 `.env.example`，不提交真实 `.env`
