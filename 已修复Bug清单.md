# 系统已修复 Bug 清单

> ⚠️ **最高优先级规则：** 后续任何 bug 修复、功能优化、代码重构、数据库迁移，必须在修改前对照此清单逐一检查，确认不会破坏已修复功能！
> 
> 违反此规则的后果：Allen 明确批评过"反反复复太多次"。

---

## 🔴 修复记录

### 1. 运营商超管 13944444444 登录 & 权限

**修复日期：** 2026-06-11 ~ 2026-06-13

**问题现象：**
- 登录后菜单显示不全（缺少运营、营销、财务菜单）
- 被创建为角色成员后出现在角色成员管理页面
- 密码被未知后台进程持续覆盖（已反复重置 4 次）

**修复内容：**
| 项目 | 状态 |
|------|------|
| 密码 | `yVYXh1g4G8`，`password_change_required=0` |
| 权限 | 后端 `auth.ts` 硬编码返回 `permissions: ['*']`，**不依赖 `admin_roles` 表** |
| 角色成员管理 | 从 `admin_users` 表中删除其角色成员记录（手机号不显示在列表中） |
| 角色列表 | 运营商后端 2 处 SQL 加了 `AND id != 'op_super_admin'` 过滤 |

**涉及文件：**
- `packages/server/src/routes/auth.ts` — 超管登录返回 `permissions: ['*']`
- `packages/server/src/routes/operator.ts` — 角色列表过滤 `op_super_admin`
- `packages/web/src/pages/operator/rbac/OperatorUserManage.tsx` — `ROLE_OPTIONS` 去掉超管

---

### 2. 总部超管 admin 登录 & 改密

**修复日期：** 2026-06-13

**问题现象：**
- 改密成功后页面未正确跳转
- 首次登录弹窗要求输入"用户名和密码"而非"当前密码+新密码"
- `first_login` 标记未正确清除导致反复弹窗

**修复内容：**
| 项目 | 值 |
|------|-----|
| 初始密码 | `admin8New!`（已改密） |
| 当前状态 | `first_login=0`，不再弹改密窗 |
| 登录方式 | 支持用户名（`admin`） 和手机号登录 |

**涉及文件：**
- `packages/web/src/pages/admin/login/AdminLoginPage.tsx` — 改密弹窗统一风格（3字段 + Modal），输入框改为"手机号/用户名"
- `packages/server/src/routes/auth.ts` — 改密接口正确设置 `first_login=0`

---

### 3. 首次登录改密弹窗统一

**修复日期：** 2026-06-13

**问题现象：**
- 总部后台、运营商后台、裁判端改密弹窗风格不一致
- 裁判端密码规则过弱（min:6），不符合"≥8位+大小写+数字"的要求
- 运营商端用 Drawer 而非 Modal

**修复内容（已全部统一）：**
- **标题：** "首次登录，请修改密码"
- **字段：** 当前密码 + 新密码 + 确认新密码
- **密码规则：** ≥8位，包含大小写英文字母和数字
- **弹窗：** Modal，无法通过点击遮罩层或 X 关闭
- **提示文字一致**
- 后端 `/admin/change-password` 已经用正则校验规则：`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/`

**涉及文件：**
- `packages/web/src/pages/admin/login/AdminLoginPage.tsx`
- `packages/web/src/pages/operator/login/OperatorLoginPage.tsx`（已有正确弹窗）
- `packages/web/src/pages/referee/LoginPage.tsx`
- `packages/server/src/routes/auth.ts`

---

### 4. 角色成员管理 - 隐藏超级管理员

**修复日期：** 2026-06-13

**问题现象：**
- 运营商角色成员管理页面，创建成员时下拉可选手"超级管理员"
- 总部后台角色管理页面，创建用户时可选择"超级管理员"

**修复内容：**
- 运营商前端 `ROLE_OPTIONS` 硬编码去掉 `op_super_admin`
- 运营商后端 `operator.ts` 两个角色查询 SQL 加 `AND id != 'op_super_admin'`
- 总部后端 `admin-rbac.ts` 角色查询 SQL 加 `AND id != 'role-super-admin'`

**涉及文件：**
- `packages/web/src/pages/operator/rbac/OperatorUserManage.tsx`
- `packages/server/src/routes/operator.ts`
- `packages/server/src/routes/admin-rbac.ts`

---

### 5. 总部后台登录 - 手机号支持

**修复日期：** 2026-06-13

**问题现象：**
- 总部后台登录只能输用户名，不能输手机号
- 提示文字用"用户名"不明确

**修复内容：**
- 输入框 placeholder 改为"手机号/用户名"
- 验证消息改为"请输入手机号或用户名"
- 后端 `admin-login` 已支持先查 `username` 再兜底查 `phone`

**涉及文件：**
- `packages/web/src/pages/admin/login/AdminLoginPage.tsx`
- `packages/server/src/routes/auth.ts`（已有 phone 兜底查询）

---

### 6. OpenClaw 模型配置 - 删除 V4 Flash

**修复日期：** 2026-06-13

**问题现象：**
- DeepSeek 账单显示 V4 Flash 持续消耗（6 元多）
- `deepseek-chat-v4` 模型配置未删除，可能被 OpenClaw OOB（Out-Of-Band）调用

**修复内容：**
- 从 `openclaw.json` provider 模型列表中删除 `deepseek-chat-v4`
- 所有 agent 模型已固定为 `deepseek-chat`（V3）

**涉及文件：**
- `/Users/longshe/.openclaw/openclaw.json`

---

### 7. 自动压缩关闭

**修复日期：** 2026-06-14

**问题现象：**
- 对话记录被自动压缩后，AI 无法搜索之前聊过的内容

**已确认规则：**
- `openclaw.json` 中 `agents.defaults.compaction.enabled = false`
- 后续 OpenClaw 升级后必须检查此设置是否回滚为 true，如回滚则立即改回 false

**涉及文件：**
- `/Users/longshe/.openclaw/openclaw.json`

---

### 8. 数据库记录清理

**修复日期：** 2026-06-13

**操作记录：**
- 删除 `admin_users` 表中 `13955555555` 的记录（之前作为总部成员存在，operator_id 为 `admin-id-001`）
- 确认 `admin_users` 表中 `15912341234` 已不存在

**注意：**
- 清理后以上手机号可重新创建为运营商成员

---

## ✅ 当前系统状态

| 入口 | URL | 登录方式 | 密码 | 状态 |
|------|-----|---------|------|------|
| 总部后台 | `/admin/login` | 用户名/手机号 | `admin` 初始密码 `admin8New!`（已改密） | ✅ |
| 运营商后台 | `/operator/login` | 手机号 | `13944444444` → `yVYXh1g4G8` | ✅ |
| 运营商成员 | 同上 | 手机号 | 各自创建时的密码 | ✅ |
| 裁判端 | `/referee/login` | 手机号 | 各自创建时的密码 | ✅ |
| 大屏 | `/screen/login` | 二维码 | 不适用 | ✅ |

## 🔧 服务器信息

| 服务 | 端口 | 状态 |
|------|------|------|
| 后端 | 3000 | ✅ 运行中 |
| 前端 Vite | 5173 | ✅ 运行中 |
| SQLite 数据库 | 文件 | ✅ 正常 |

## ⚡ 测试数据

| 手机号 | 角色 | 所属 | 状态 |
|--------|------|------|------|
| 13944444444 | 运营商超管 | 运营商 | ✅ 可用 |
| 13955555555 | 运营商财务（待创建） | 运营商 | 🔲 待创建 |
| 139666666667 | 运营商总管理员（待创建） | 运营商 | 🔲 待创建 |

### 9. 运营商侧边栏菜单权限过滤

**修复日期：** 2026-06-13

**问题现象：**
- 财务角色（`13955555555`）登录后看到过多菜单（裁判管理、参赛包管理等）
- "裁判管理"和"参赛包管理"菜单项缺少 `perms` 字段，导致对所有用户可见

**修复内容：**
- `OperatorLayout.tsx` 中所有菜单项都配了对应 `perms`：
  - 赛场管理 → `venues:read`
  - 裁判管理 → `referees:read`
  - 参赛包管理 → `packages:read`
  - 营销管理 → `marketing:read`
  - 财务中心 → `finance:read`
  - 角色与成员管理 → `rbac:read`
  - 玩家管理 → `players:read`
  - 个人中心 → 不限制（所有人可见）
- "角色与成员管理"和"玩家管理"只有拥有 `['*']` 权限的超级管理员可见

**涉及文件：**
- `packages/web/src/layouts/OperatorLayout.tsx`

### 10. 总部超管 admin 权限修复

**修复日期：** 2026-06-13

**问题现象：**
- `admin` 用户登录后点击"系统设置"保存报 403 "仅超级管理员可操作"
- 因为 admin 关联的角色 `role-admin` 被改为 `[*]` 但 `superAdminOnly` 中间件检查 `permissions.includes('*')`

**修复内容：**
- `auth.ts` admin-login 逻辑中增加：`if (user.username === 'admin') permissions = ['*']`
- `admin` 用户登录自动获得全部权限，不依赖 `admin_roles` 表

**涉及文件：**
- `packages/server/src/routes/auth.ts`

### 9. 总部总管理员角色权限修复

**修复日期：** 2026-06-13

**问题现象：**
- 总部 `role-admin`（总管理员）权限被设为 `['*']`，导致非超管角色看到所有页面
- `role-admin` 本应只看到部分页面（运营商管理、营销、财务、看板）

**修复内容：**
- `role-admin` 权限改为具体权限：`["operators:list","players:read","marketing:read","finance:read","dashboard:read","dashboard:list"]`
- 系统设置、角色和成员管理仍通过 `SUPER_ADMIN_ONLY_PAGES` 控制，仅超管可见
- 玩家管理页面同样仅超管可见（不在 `PAGE_PERMISSIONS` 中）

**涉及文件：**
- 数据库 `admin_roles` 表（`UPDATE admin_roles SET permissions = ... WHERE id = 'role-admin'`）
- `packages/web/src/layouts/AdminLayout.tsx`（前端权限控制逻辑 `SUPER_ADMIN_ONLY_PAGES`）

### 10. 运营商侧边栏菜单权限过滤

**修复日期：** 2026-06-13

**问题现象：**
- 财务角色（`13955555555`）登录后看到过多菜单（裁判管理、参赛包管理等）
- "裁判管理"和"参赛包管理"菜单项缺少 `perms` 字段，导致对所有用户可见

**修复内容：**
- `OperatorLayout.tsx` 中所有菜单项都配了对应 `perms`：
  - 赛场管理 → `venues:read`
  - 裁判管理 → `referees:read`
  - 参赛包管理 → `packages:read`
  - 营销管理 → `marketing:read`
  - 财务中心 → `finance:read`
  - 角色与成员管理 → `rbac:read`
  - 玩家管理 → `players:read`
  - 个人中心 → 不限制（所有人可见）
- 角色与成员管理、玩家管理仅超管可见

**涉及文件：**
- `packages/web/src/layouts/OperatorLayout.tsx`

### 11. 数据库记录清理
