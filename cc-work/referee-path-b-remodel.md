# 裁判注册路径B 完整改造

## 背景
裁判注册只有路径B（邀请注册/微信服务号），路径A已删除。
当前项目在 `/Users/longshe/.openclaw/workspace/projects/robot-maze-race`
分支: feature/points-stock
数据库: MySQL (`mysql2/promise`, `$1` 占位符)
后端路由: `packages/server/src/routes/`
前端: `packages/web/src/pages/referee/`

## 1. 裁判端流程（H5）

### 1.1 点击邀请链接 → H5引导页
- 客户端路由: `/referee/invite?token=xxx`
- 页面 `InviteGuidePage.tsx`（新建或改造现有 InviteRegisterPage）
- 页面显示：运营商名称 + 邀请信息

### 1.2 H5自动微信OAuth静默授权(snsapi_base)
- 页面加载时，调用 `GET /api/v1/auth/mp-oauth/authorize?scope=snsapi_base&redirect=/referee/invite?token=xxx`
- 微信回调后带 code → 后端换 openid → 存储到 referee_invites 表（新增 openid 列或关联）
- 后端新增 `POST /api/v1/referee/bind-openid` 接口：token + code → 绑定 openid 到邀请
- 回复带 token 的 H5 页面

### 1.3 引导关注服务号
- 显示：「请关注安博天智服务号完成注册」
- 按钮：「前往关注」→ 跳转微信服务号关注页面
- 不需要扫码，使用微信 JS-SDK 或直接跳转

### 1.4 服务号关注回调
- 新增 `POST /api/v1/wechat/callback` — 服务号消息/事件回调
- 接收微信推送的关注事件（subscribe）
- 匹配 FromUserName (openid) → 找到 referee_invites 记录
- 自动回复图文消息，包含带 token 的邀请链接
- 链接格式：`https://dog.amberrobot.com.cn/referee/register?token=xxx`

### 1.5 裁判从服务号点击链接 → H5注册页
- 路由 `/referee/register?token=xxx`
- 已有 `RegisterFormPage.tsx`，需改造：
  - 点击「微信授权登录」→ `GET /api/v1/auth/mp-oauth/authorize?redirect=/referee/register?token=xxx`
  - scope: snsapi_userinfo（弹窗授权）

### 1.6 微信OAuth弹窗回调
- `GET /api/v1/auth/mp-oauth` 回调处理（已有）
- 返回 JWT token + `is_new_user` 标志
- is_new_user=true → 弹窗填「姓名」+「手机号」（仅个人信息，非登录凭证）
- is_new_user=false → 直接进入裁判首页 `/referee/match`

### 1.7 个人信息填写弹窗
- 调用 `PATCH /api/v1/referees/:id/profile`
- body: `{ name, phone }`
- 更新 referees 表和 users 表

### 1.8 服务号底部菜单「裁判入口」
- 点击 → 微信快捷登录 → 直接进入裁判首页
- 前端路由 `/referee/login` — 已有 LoginPage，需要支持自动微信OAuth

## 2. 后端新增/修改接口

### 2.1 POST /api/v1/referee/bind-openid
- body: `{ invite_token, code }`
- 用 code 换 openid（snsapi_base）
- 更新 referee_invites 表：存储 openid
- 返回: `{ success: true }`

### 2.2 POST /api/v1/wechat/callback
- 微信消息/事件回调入口
- 验证签名（已有 WECHAT_MP_TOKEN）
- 处理 subscribe 事件：
  - 查 referee_invites WHERE openid = FromUserName AND status = 'active'
  - 找到则回复图文消息（含邀请链接）
- 其他事件：回复空字符串或 success

### 2.3 PATCH /api/v1/referees/:id/profile
- body: `{ name, phone }`
- authMiddleware（需要登录）
- 更新 referees.name, referees.phone
- 更新 users.nickname, users.phone

### 2.4 GET /api/v1/referee/invitations
- 运营商查看邀请链接列表
- authMiddleware + operatorOnly
- 查 referee_invites 表，分页返回

### 2.5 修改 POST /api/v1/referee/invite
- 去掉弹窗逻辑（已有，保持不变即可）
- 返回的 invite_url 改为 `https://dog.amberrobot.com.cn/referee/invite?token=xxx`

### 2.6 修改 GET /api/v1/auth/mp-oauth/authorize
- 支持 scope 参数（snsapi_base 或 snsapi_userinfo）

### 2.7 修改 GET /api/v1/auth/mp-oauth 回调
- 返回增加 `is_new_user` 字段
- 判断该 openid 是否已有关联的 referee 记录

### 2.8 referees 表新增字段（如需要 ALTER TABLE）
- ALTER TABLE referee_invites ADD COLUMN openid VARCHAR(128) DEFAULT NULL;

## 3. 前端修改

### 3.1 新建 InviteGuidePage.tsx
- 路由: `/referee/invite?token=xxx`
- 自动触发 snsapi_base 授权
- 显示引导关注服务号 UI

### 3.2 改造 RegisterFormPage.tsx
- 加上「微信授权登录」按钮
- 授权后自动填姓名+手机号弹窗（is_new_user 时）

### 3.3 LoginPage.tsx — 保持微信OAuth
- 去除密码登录相关代码（已去除）
- 添加自动微信OAuth逻辑

### 3.4 运营商后台 RefereeList.tsx
- 点击「邀请裁判」不弹窗，直接调用 POST /api/v1/referee/invite
- 表格增加列：邀请链接（可复制）+ 生成时间
- 去掉「申请审核」tab
- 审核功能移到邀请列表内（已审核的裁判列表）

### 3.5 前端路由注册
- 在 packages/web/src/router/index.tsx 注册新路由

## 4. 重要约束
- 最小改动原则：优先改现有文件，非必要不新建
- MySQL: $1 占位符
- 所有 API 返回格式: `{ code: 0, message: 'ok', data: ... }`
- 微信 AppID: wx22a4891531ce5fe7
- 微信 AppSecret: 4fa90f1888e6798b519a67a9f34936c8
- 回调域名: https://amberrobot.com.cn
- 前端域名: https://dog.amberrobot.com.cn
- 不要修改 referee-invite.ts 中现有的 invite/register 路由逻辑（除非必要）
- 裁判端 CSS 文件: packages/web/src/pages/referee/styles.css
- 先读取现有文件再改，不要盲目覆盖

## 5. 执行步骤
1. 读现有代码熟悉结构
2. 数据库 migration（referee_invites 加 openid 列）
3. 后端：wechat callback 接口
4. 后端：bind-openid 接口
5. 后端：profile 接口
6. 后端：invitations 列表接口
7. 后端：修改 invite 接口
8. 后端：修改 mp-oauth authorize 支持 scope
9. 后端：修改 mp-oauth 回调返回 is_new_user
10. 前端：InviteGuidePage
11. 前端：改造 RegisterFormPage
12. 前端：运营商 RefereeList 改造
13. 前端：路由注册
14. TypeScript 编译验证
15. git add/commit/push
