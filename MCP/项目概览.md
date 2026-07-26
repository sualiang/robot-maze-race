# 铁甲快狗 — 项目概览

> 自动更新于 OpenClaw 每日 MCP 同步提醒
> 最后更新：2026-07-13T11:31

---

## 一、部署信息

| 项目 | 值 |
|------|----|
| 代码仓库 | GitHub `sualiang/robot-maze-race` |
| 服务器目录 | `/opt/test-zone` |
| 后端进程 | PM2 `robot-maze-race-backend`（端口 3000） |
| 前端目录 | `/opt/test-zone/web-dist/` |
| 数据库容器 | `robot-maze-race-mysql`，127.0.0.1:3308，root `IronDog2026!Root` |
| 数据库 | `robot_maze_race` |
| 最新部署 commit | `4506556`（2026-07-12 17:48） |

### 入口（5/5 验证通过）
- 总部后台：`https://dog.amberrobot.com.cn/admin/login`
- 运营商端：`https://dog.amberrobot.com.cn/operator/login`
- 商家端：`https://dog.amberrobot.com.cn/merchant/login`
- 裁判端：`https://dog.amberrobot.com.cn/referee/login`
- 大屏端：`https://dog.amberrobot.com.cn/screen`

---

## 二、需求与设计

### 2.1 裁判注册全流程（Allen 定稿 V3，2026-07-12）

**核心原则：服务号是裁判唯一入口，H5是落地页，不是入口。**

**V3 最终流程（带参数二维码方案，Allen 2026-07-13 定稿）：**

```
📱 裁判扫码 → 🏠 服务号主页 → ✅ 关注服务号 → 🔗「继续完成注册」链接 → H5 OAuth 登录注册
```

**详细步骤：**

1. 运营商后台"邀请裁判" → 调用 `POST /api/v1/referee/invite` → 后端调微信 `qrcode/create`（`QR_LIMIT_STR_SCENE`），`scene_str=referee_invite_{inviteId}` → 返回 ticket → 前端展示二维码
2. 裁判（未关注）扫二维码 → 微信跳到**服务号主页** → 用户点关注
3. 关注后微信推送 `event=SUBSCRIBE` + `EventKey=qrscene_referee_invite_{inviteId}` → `/api/v1/wechat/event`
4. 后端收事件 → 解析 inviteId → 查 `referee_invites` 表取 operator_id → 自动发客服消息：「欢迎申请铁甲快狗裁判资格，请点击下方链接完成注册」→ `https://dog.amberrobot.com.cn/referee/register?invite_id=xxx&operator_id=xxx`
5. 已关注裁判同理 → `event=SCAN` + `EventKey=referee_invite_{inviteId}` → 同上
6. 裁判点注册链接 → H5 注册页 → 微信 OAuth 授权 → 填写姓名+手机 → 自动绑定邀请关系，邀请状态标记 `used`
7. 后续入口：公众号菜单「裁判入口」→ 一键进裁判 H5 首页

**关键设计：**
- 无需审核：注册即 `status=approved`
- 无密码：微信 OAuth 登录，通过 openid 识别
- 网页端（非小程序）：`dog.amberrobot.com.cn/referee`
- 邀请二维码永久有效（`QR_LIMIT_STR_SCENE`）
- OAuth redirect_uri → 后端 callback（BFF模式），不走前端SPA

### 2.2 微信公众号配置
- 服务号：安博天智
- AppID：`wx22a4891531ce5fe7`
- 网页授权域名：`amberrobot.com.cn`
- 自定义菜单："裁判入口" → `https://dog.amberrobot.com.cn/referee/home`

### 2.3 KANO 需求管理（V1 创建日期：2026-06-26）

| KANO 层级 | 需求 | 复杂度 | 开发阶段 | 备注 |
|-----------|------|--------|---------|------|
| 基本型 ✅ | 总部后台 CURD（运营商/商家/用户/赛场/赛事） | 中 | Phase 1 已完成 | |
| 基本型 ✅ | 运营商端 CURD（赛场/赛事/参赛包/用户/裁判/资金） | 中 | Phase 1 已完成 | |
| 基本型 ✅ | JWT 登录 + SPA 入口 | 中 | Phase 1 已完成 | |
| 基本型 🔄 | 裁判注册全流程（微信OAuth+二维码邀请） | 高 | Phase 2 开发中 | V3 二维码方案 |
| 期望型 ⏳ | 商家端（验券+核销记录） | 低 | Phase 2 | 暂未启动 |
| 期望型 ⏳ | 玩家小程序 | 高 | Phase 3 | 微信审核后 |
| 期望型 ⏳ | 大屏端（实时比赛展示） | 低 | Phase 3 | 暂未启动 |

---

## 三、OAuth 修复历程（六轮）

| 轮次 | commit | 日期 | 问题 | 状态 |
|------|--------|------|------|------|
| 1 | `9f9de7a` | 7/12 | OAuth 路由路径不匹配（前端 `/mp-oauth/authorize` vs 后端 `/referee/invite/:token/oauth`） | ✅ 已部署 |
| 2 | `a0887a3` | 7/12 | InviteGuidePage 微信内死循环（hasToken但hasCode=false） | ✅ 已部署 |
| 3 | `32bd412` | 7/12 | redirect_uri 域名不匹配（`dog.amberrobot.com.cn` vs 授权域名 `amberrobot.com.cn`） | ✅ 已部署 |
| 4 | `e3687d5` | 7/12 | token 被微信 OAuth 回调 code 覆盖，从 state 取值 | ✅ 已部署 |
| 5 | `5787d3c` | 7/12 | OAuth 架构重构 BFF 模式（redirect_uri → 后端 callback） + nginx 精准路由 | ✅ 已部署 |
| 6 | `4506556` | 7/12 | 推翻重做：服务号导向注册流程，表单砍到只保留姓名+手机（-893行冗余代码） | ✅ 已部署 |

### V3 二维码方案 — 代码状态（2026-07-13 更新）

**结论：代码层已 100% 完成，卡在服务号微信认证这道门。**

| 模块 | 文件 | 状态 | 功能 |
|------|------|------|------|
| Token管理 | `wechat-token.ts` | ✅ 已实现 | access_token 获取+缓存 |
| 二维码生成 | `wechat-qrcode.ts` | ✅ 已实现 | `QR_LIMIT_STR_SCENE` 带参永久二维码，scene_str=operator_id+invite_id |
| 事件回调 | `wechat-event.ts` | ✅ 已实现 | SUBSCRIBE/SCAN 事件解析 scene_str → 下发注册链接 |
| 客服消息 | `wechat-message.ts` | ✅ 已实现 | 关注后自动推送「继续完成注册」图文消息 |
| 回调路由 | `server` | ✅ 已注册 | `GET/POST /api/v1/wechat/event`（验证+接收） |
| 降级逻辑 | `referee-invite.ts` | ✅ 已生效 | qrcode/create 失败 → qrcode_url=空 → 前端显示链接模式 |

**唯一阻塞项：服务号 `wx22a4891531ce5fe7` 是否已完成微信认证？**
- **✅ 已确认完成**（Allen 2026-07-13 11:32），认证通过
- ~~未认证 → `qrcode/create` API 被微信拒绝，降级为当前链接模式~~

**另一个待确认项：** 微信公众平台「服务器配置」URL 是否已指向 `https://dog.amberrobot.com.cn/api/v1/wechat/event`？
- **✅ 已确认指向正确**（Allen 2026-07-13 11:32）

**当前问题：** 前置条件全满足，但线上仍为降级模式。
- **🔴 已定位根因**：`wechat-qrcode.ts` 中 scene_str 拼接了两个 UUID v4（`referee_invite_{36char}_{36char}` ≈ 89字符），超出微信 `QR_LIMIT_STR_SCENE` 的 64 字符限制 → API 拒绝 → 触发降级
- **修复方案**：scene_str 改为 `referee_invite_{inviteId}`（仅一个 UUID，≈51字符），wechat-event.ts 回调时查表拿 operator_id
- **代码审查 5/5 通过**：客服消息、消息内容、链接目标、防重复注册 均正确实现
- **待小C改 2 个文件**（wechat-qrcode.ts + wechat-event.ts）→ 小D部署验证

---

## 四、看板状态

🟢 **全部清零**（2026-07-12 14:30）

- 所有 P0/P1 已修复并回归通过
- 飞书看板：https://ycnaevxqlrg0.feishu.cn/base/VYKpblbY6aqrJXss5VxcMBJ2nve

---

## 五、资源锁定规则（2026-07-12 Allen授权）

- 代码目录：`/opt/test-zone/`（唯一）
- PM2进程：`robot-maze-race-backend`（唯一）
- 端口：3000（唯一）
- 数据库容器：`robot-maze-race-mysql`（唯一，端口3308）
- 数据库名：`robot_maze_race`（唯一）
- **未经 Allen 授权，禁止新增任何资源**

---

## 六、关键凭据速查

| 凭据 | 值 | 存放 |
|------|----|------|
| 运营商测试账号 | `13999999999 / admin123` | MEMORY.md |
| 微信 AppID | `wx22a4891531ce5fe7` | 服务器 `.env` |
| 微信 AppSecret | `4fa90f1888e6798b519a67a9f34936c8` | 服务器 `.env` |
| 后端 ENV路径 | `/opt/test-zone/packages/server/.env` | 服务器 |
| DB root密码 | `IronDog2026!Root` | TOOLS.md |
| GitHub Token | `已撤销` | TOOLS.md |

---

## 七、已知风险

| 风险 | 级别 | 说明 |
|------|------|------|
| OAuth 需微信实测 | 🟡 | 六轮修复全在服务器端验证，需 Allen 微信真机测扫码+OAuth+注册 |
| 服务号微信认证未确认 | 🟡 | 二维码四个模块代码已完成，卡在服务号是否已微信认证（需 Allen 确认） |
| 二维码降级模式 | 🔴 根因已定位 | scene_str 超64字符限制 → qrcode/create被拒。待小C改 2 文件 → 小D部署 |
| .env 含明文密钥 | 🔴 | AppSecret 直接写 .env，建议迁移到密钥网关 |
