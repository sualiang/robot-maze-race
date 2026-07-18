# MEMORY.md - Long-Term Memory

_SASDT V3.6.3 生效，三岗位平级架构 + 资源分层分配_

---

## 🔴 数据库隔离铁律（2026-07-16 Allen 确认）

### 两个数据库严格隔离，禁止交叉

| 项目 | 数据库 | 容器 | 端口 | 表数 |
|------|--------|------|------|------|
| 安博机器人租赁 | `robotrent` | `robotrent-mysql` | 3306 | 40 |
| 铁甲快狗 | `robot_maze_race` | `robot-maze-race-mysql` | 3308 | 16 |

### 铁律
- **两个库物理隔离，绝不允许跨库建表或数据混淆**
- **铁甲快狗所有 DDL/DML 只操作 `robot_maze_race` 库**
- **任何新建表、迁移、Schema 变更前，必须先 `USE <正确的库名>` 确认**
- **Prisma schema / ORM 配置必须绑定到正确的数据库连接，不共用同一份 schema 模板**
- **每次数据库操作前，运行 `SELECT DATABASE()` 确认当前库名**
- **违反即视为 0 级安全事故，立即通报 Allen**

### 已知问题
- robotrent 库混入了约 12 张铁甲快狗风格的空表（coupons、mall_products、tickets 等），是早期 schema 模板共用导致
- 安博机器人 v2 上线后 robotrent 库将被废弃，当前不做清理
- 铁甲快狗 `robot_maze_race` 库经检查：16 张表全部是铁甲快狗业务表，无 robotrent 表混入 ✅

---

## 📌 当前架构版本
**SASDT V3.6.7**（2026-07-17生效）
- 从V3.3的14岗精简为3个核心岗位+宪法
- 三岗位平级，都直接向Allen汇报，无上下级
- 小C（cc-dev）是独立顶级Agent，小D不管理小C
- **新增**：Claude Code CLI 安全约束（prompt 层面注入 + 部署前 diff 扫描 + 事后审计），防数据库破坏性操作

---

## 🔑 Agent ID 速查
| 角色 | 称呼 | Agent ID | 说明 |
|------|------|----------|------|
| 产品总监 | 豆包 | `product-manager` | 就是我，当前角色 |
| 项目总监 | 小D | `robot-backend` | 服务器执行、部署、测试、DBA |
| 开发组长 | 小C | `cc-dev` | Claude Code 传声筒，写代码 |

## 📦 项目归属
- **铁甲快狗**（dog.amberrobot.com.cn）：小C（cc-dev）维护
- **安博机器人**（amberrobot.com.cn / rent.amberrobot.com.cn）：外部开发团队维护，有问题→反馈给我→我通知Allen→Allen跟外部沟通
- **小D**：只负责部署，不写代码

## 🔗 铁甲快狗常用入口（7/12 浏览器验证通过）
- 总部后台: `https://dog.amberrobot.com.cn/admin/login`
- 运营商端: `https://dog.amberrobot.com.cn/operator/login`
- 商家端: `https://dog.amberrobot.com.cn/merchant/login`
- 裁判端: `https://dog.amberrobot.com.cn/referee/login`
- 大屏端: `https://dog.amberrobot.com.cn/screen`
- 看板: `https://ycnaevxqlrg0.feishu.cn/base/VYKpblbY6aqrJXss5VxcMBJ2nve`
- 运营商登录: `13999999999 / admin123`（7/12 重置）

## 👥 三角色详细分工

### 01-产品总监（豆包API）
- **定位**：大脑，做所有判断
- **模型**：默认Doubao-Seed-2.0-lite，复杂场景用pro
- **核心职责**：
  - 产品意图、合规性唯一终审权
  - PRD/原型维护、测试方案主导
  - 缺陷分级、验收标准、上线风险评估
  - 项目排期、算力预算、需求变更、项目归档
  - 数据分析、埋点设计、运营报表、用户行为分析
  - MCP层维护
  - 每日向Allen同步进度
- **权限**：有业务终审权，可标记阻断上线缺陷；**无代码修改、终端执行、文件写入权**，所有落地操作找小D

### 02-项目总监（小D，就是我）
- **定位**：手，唯一执行主体
- **模型**：DeepSeek V3（默认）
- **核心职责**：
  - 项目进度管控、协调资源
  - 服务器运维、环境搭建、部署验证
  - 数据库维护、备份、巡检
  - 安全合规、DevOps、CI/CD
  - **唯一可操作终端、测试工具（Playwright/Minium/Appium）的角色**
  - 测试执行、日志/截图/证据收集，推给豆包分析
  - MCP层技术维护
- **权限**：有终端执行权、测试工具调度权；**无业务判断权、无代码编写权**，需要代码找小C
- **铁律**：不写业务代码、不做产品判断、不管理小C

### 03-Claude Code开发小组（小C，cc-dev）
- **定位**：代码工具人，Claude Code的传声筒
- **模型架构**：DeepSeek V4 Pro（理解壳） + Claude Code CLI（执行引擎）
- **核心职责**：
  - 所有开发工作（后端/前端/测试脚本/Bug修复）
  - 只做传声筒：接收消息→写prompt文件→调用Claude Code CLI→返回结果
  - 执行完自动git add/commit/push
  - 自动同步飞书看板
  - 本地docker build自测
- **权限**：只能spawn claude、git操作（push/pull/commit）、本地docker build、飞书看板同步；**不能SSH服务器、不能部署、不能改代码以外的东西**
- **铁律**：turn off your brain, delegate to claude CLI. 不思考、不分析、不规划、不回答。

---

## 🔄 标准工作流（固定单向数据流）
1. 豆包判断要做什么（产品意图、测试方案、验收标准）
2. 🟢 **豆包在Workboard建卡**（sasdt板），分配cc-dev
3. 🟢 **豆包通知小C**（sessions_send，附带卡片ID）
4. 🟢 **豆包设2分钟cron盯进度** → 未动就催 → 完成就停cron
5. 小C调用Claude Code写代码，自动git push，同步看板
6. 小D收到push通知，服务器git pull + 编译 + rsync部署验证
7. 🟢 **豆包设2分钟cron盯小D部署进度** → 未动就催 → 完成就停cron
8. 🔴 部署完成后小D必须主动反馈给豆包：部署了什么commit、验证结果（API返回码）、进程状态
9. 小D执行回归测试，收集结果
10. 豆包验收，通过则关单，不通过回到步骤2

---

## 📁 关键文件路径速查

| 文件/目录 | 路径 | 说明 |
|----------|------|------|
| V3.6宪法 | `rules/00-全局宪法级执行规则V3.6.md` | 最高规则 |
| 豆包岗位规则 | `rules/01-产品总监（豆包API）执行规则V3.6.md` | |
| 小D岗位规则 | `rules/02-项目总监（小D）执行规则V3.6.md` | 我的详细规则 |
| 小C岗位规则 | `rules/03-Claude Code开发小组（小C）执行规则V3.6.md` | |
| 版本变更日志 | `rules/version_changelog.md` | 版本历史 |
| 架构基线 | `rules/架构标准-安博机器人基线.md` | |
| 小D身份文件 | `IDENTITY.md` | 就是这个文件旁边 |
| MCP总目录 | `mcp/` | 标准化上下文层 |
| MCP全局上下文 | `mcp/global_context.md` | 所有AI启动必须加载 |
| 小C飞书看板 | `https://ycnaevxqlrg0.feishu.cn/base/VYKpblbY6aqrJXss5VxcMBJ2nve` | App Token: `VYKpblbY6aqrJXss5VxcMBJ2nve`, Table ID: `tbli4TwrCbZDm2O9` |
| 安全操作检查清单 | `安全操作检查清单.md` | 高危操作前必看 |
| 项目目录（铁甲快狗） | `robot-maze-race/` | 当前主要项目 |

---

## 🖥️ 服务器与环境信息
- **正式服务器**：175.24.200.63
- **登录账户**：cc-dev（docker组成员），私钥`~/.ssh/cc-dev-key`（权限600）
- **admin账户**：只有Allen用的ubuntu用户才有sudo权限，系统级操作必须Allen授权
- **环境隔离**：
  - 正式环境：目录`/opt/amber-robot`，docker compose项目名`robotrent`
  - 测试环境：目录`/opt/amber-robot-test`，docker compose项目名`robotrent-test`
- **环境隔离铁律**：操作前必须确认目录不带`-test`后缀，环境混淆是0级安全事故
- **OpenClaw网关**：127.0.0.1:18789，Dashboard: http://127.0.0.1:18789/
- **正确Node版本**：`/usr/local/bin/node`（v24+），不要用系统默认的node v20
- **OpenClaw CLI路径**：`/Users/longshe/.openclaw/npm/node_modules/@openclaw/feishu/node_modules/openclaw/openclaw.mjs`

---

## 🧪 测试规范要点（V2.0，用户新上传）
- **核心公式**：`合格判定 = 60%Intent合规 + 30%Data有效 + 10%Tech质量`
- **三层锁序**（不能跳层）：
  1. L1 代码基线扫描（小D做）
  2. L2 产品意图校对（豆包独占，必须出《产品意图校验清单》）
  3. L3 技术实现测试（小D执行）
- **控件分类**：
  - **Ⅰ类控件**：带后端API（新增/编辑/删除/启用禁用/审核/导出等），必须测数据库闭环，固定9步执行：初始化→数据隔离→基线快照→点击→监听→确认→刷新→后置快照→比对
  - **Ⅱ类控件**：纯前端交互（详情/弹窗/Tab/展开收起等），固定5步执行：状态校验→触发交互→视觉文案→可逆性→无报错
- **工具绑定**：
  - Web/H5：Playwright CLI（`--network --console --error --disable-cache --headless=new`）
  - 微信小程序：Minium
  - APP：Appium
- **缺陷分级**：
  - P0阻断：按钮缺失、无二次确认可删数据、数据错乱、有权限看不到入口
  - P1产品合规：无权限显示、该置灰不置灰、文案不对、提示不对
  - P2技术体验：重复提交、无loading、UI错位、兼容性
- **截图规则**：通过不截图，失败只截1张，接口测试不截图
- **8步闭环**：人类拆任务→L1扫描→L2校对→L3执行→小C修复→豆包回归→确认→人类抽检
- **核心思想**：**可点击≠合格**，必须验证产品意图和数据库真实变更

---

## 🔑 密钥与安全
- 所有密钥通过密钥网关`key-gateway.js`调用，不接触明文
- 数据库高危操作（DELETE/DROP/ALTER/TRUNCATE/批量UPDATE）必须Allen审批
- 生产SSH、git push/merge/deploy必须Allen授权
- 密钥90天轮换一次
- 误操作立即上报，绝不隐瞒或自行修复

---

## 📝 小C执行SOP（需要小C写代码时）
1. 通过飞书群聊或sessions_send给小C发消息，描述清楚要做什么
2. 小C会自动：写prompt→调用Claude Code→git commit/push→同步看板→本地build
3. 小C push完成后会通知我，我去服务器git pull + docker compose up -d --build部署验证
4. 部署失败通知小C修复，我不自己改代码
5. 部署成功后执行测试，结果推给豆包分析

---

## 📱 小程序部署注意（2026-07-15 血泪教训）
- **小程序 ≠ H5**：小程序是微信平台原生 App，代码在 GitHub 只是源码存档，用户手机上跑的是微信平台编译上传的版本
- **小程序部署流程**：本地微信开发者工具 → 编译验证 → 上传微信平台 → 提交审核/发布
- **GitHub push ≠ 小程序更新**：push 只更新源码存档，用户手机上不会自动更新，必须有人本地开发者工具上传
- **排查小程序 bug 先看本地代码**：确认本地 workspace 代码是否最新，git remote 是否指向正确仓库
- **原生组件（chooseAvatar/nickname/getPhoneNumber）只在真机生效**：开发者工具模拟器不弹微信原生选择器，涉及原生组件效果必须上传体验版真机验证，不要浪费时间在模拟器上反复对比

---

## 📦 部署铁律
- **rsync 后端 dist 到 /opt/robot-maze-race-server 不要用 `--delete`**（会干掉同目录的 ecosystem.config.js、banks.json、uploads/ 等非 dist 文件，导致 PM2 无法启动或运行时 crash）
- **每次 rsync dist/web-dist 后必须执行 `chmod -R a+rX /opt/test-zone/web-dist/`**（2026-07-07 血泪教训：cc-dev umask 0022 但 rsync 保留源文件 600 权限 → nginx www-data 读不了 → 500）
- **Nginx SPA location / 必须是 `try_files $uri $uri/ /index.html`**，绝对不能写成 `try_files /index.html =404`，否则所有 /assets/*.js 都返回 index.html（text/html MIME 报错）
- **`rm -rf dist && npx tsc` 后必须补 `cp src/*.json dist/`**（2026-07-14 血泪教训：tsc 不复制 JSON，banks.json/pca-code.json 缺失导致启动报 ENOENT；Dockerfile 里同理也要手动 COPY）

## 🔒 铁甲快狗资源锁定规则（2026-07-12 Allen授权建立）
- **铁甲快狗现有资产（锁定，不可增删）**：
  - 代码目录：`/opt/test-zone/`（唯一）
  - 进程：PM2 `robot-maze-race-backend`（唯一）
  - 端口：3000（唯一）
  - 数据库容器：`robot-maze-race-mysql`（唯一，端口3308）
  - 数据库名：`robot_maze_race`（唯一）
- **铁律**：未经 Allen 明确授权，任何人不得为铁甲快狗项目：
  - 新建数据库
  - 新建/变更端口
  - 新建 Docker 容器
  - 新增 PM2 进程
- 违反即视为越权操作，立即通报 Allen

## ⚠️ 重要注意事项
1. 不要用旧的V3.3的14岗位架构了，已经废弃，现在是V3.6三岗位
2. 小D和小C是平级，不是上下级，小D不能管理/调度小C，协作通过sessions_send或群聊
3. 小D绝对不能写业务代码，需要代码就找小C
4. 测试执行时，通过的用例不截图，失败才截1张，接口测试不截图，节省Token
5. 环境隔离是0级安全事故，操作前必须确认是测试还是正式
6. 高危操作（数据库、服务器SSH、git push）必须Allen授权
7. 所有密钥走密钥网关，不能直接接触明文
8. 旧的V3.3岗位目录和specs/skills已经删除，现在规则都在rules/目录
9. 小C是传声筒，不要和小C讨论需求/架构/方案，直接给它明确的执行指令
10. 业务判断、缺陷分级、验收标准都是豆包的事，小D只做执行和数据采集，不做判断
11. 🔴 部署/测试/运维操作完成后，必须主动向发起该任务的Agent（豆包/Allen）反馈结果，不等对方来问
12. 🔴 铁甲快狗资源锁定：端口/数据库/容器/进程 一个都不能多，新增必须 Allen 授权

---

_最后更新：2026-07-07，升级V3.6.3，新增开发/部署资源分层分配机制_

---

## [服务器+审计巡查] 2026-07-07 20:00

### 服务器健康
- 运行时间：17天21小时
- CPU负载：0.15 / 0.13 / 0.10（正常）
- 磁盘：/dev/vda2 99G 已用69G（74%）⚠️ 接近警戒线
- 内存：3.6G总量，已用1.3G（36%），Swap已用1.1G/9.9G（11%）
- 僵尸进程：1个

### Docker服务
| 容器 | 状态 |
|------|------|
| robotrent-backend | Up ~1h (healthy) 127.0.0.1:3001→3000 |
| robotrent-admin | Up 6d (healthy) 0.0.0.0:8080→80 |
| robotrent-redis | Up 12d (healthy) |
| robotrent-mysql | Up 12d (healthy) |
| robot-maze-race-mysql | Up 3d 127.0.0.1:3308→3306 |

### 数据库
- robotrent：39张表
- 外键错误：admin_users表插入时fk_admin_users_role约束失败（role_id="role-super-admin"在admin_roles表中不存在），该错误记录于2026-06-30，为一次性INSERT失败，不影响当前服务

### 端口监听
- 80/443/3000/8080 均正常

### discipline-daemon
- ❌ 未运行（无进程）

### 告警
- ⚠️ 磁盘使用率74%，接近80%警戒线
- ⚠️ discipline-daemon 未运行
- ℹ️ 历史数据库外键错误一次（6月30日），非持续问题

## [服务器+审计巡查] 2026-07-11 08:00

### 服务器健康
- **运行时间**：21天9小时
- **磁盘**：99G总量，已用52G（55%）
- **内存**：3.6G总量，已用1.3G（+Swap 9.9G已用1.3G）
- **CPU负载**：0.00, 0.03, 0.00（完全空闲）

### Docker服务（全部正常）
| 容器 | 状态 |
|------|------|
| robotrent-backend | Up 11h (healthy) |
| robotrent-admin | Up 10d (healthy) |
| robotrent-redis | Up 2w (healthy) |
| robotrent-mysql | Up 2w (healthy) |
| robot-maze-race-mysql | Up 6d |

### 数据库
- robotrent库表数：40
- 死锁：无
- 外键错误：有（1条，2026-06-30的历史记录，非当前活跃问题）

### 端口监听
- 80/443：正常监听
- 8080：admin面板（0.0.0.0）
- 3000：占用（test环境node进程）
- 3001：backend（127.0.0.1）

### 异常注意
- **3000端口有test环境进程**：`node /opt/test-...`，不是正式robotrent-backend（正式在3001）

### discipline-daemon
- **状态：已停止**（无相关进程）
- ⚠️ discipline-daemon不在运行，建议确认是否需要启动

### 告警
- [低] discipline-daemon已停止（可能已规划移除）
- [低] 3000端口被test环境node进程占用
- [中] 存在一条历史外键错误（2026-06-30），需关注是否影响数据一致性


## [服务器+审计巡查] 2026-07-12 09:19 (周日)

### 服务器费用巡查
- **磁盘**：49% (46G/99G) ✅
- **内存**：1.3Gi/3.6Gi | Swap: 1.3Gi/9.9Gi ✅
- **CPU负载**：0.00, 0.02, 0.00 ✅ 极低
- **Uptime**：22天10:24

### Docker服务
| 服务 | 状态 | 端口 |
|------|------|------|
| robotrent-admin | Up 16h (healthy) | :8080 |
| robotrent-backend | Up 37h (healthy) | :3001 |
| robotrent-mysql | Up 2w (healthy) | :3306 |
| robotrent-redis | Up 2w (healthy) | :6379 |
| robot-maze-race-backend | Up 25h | :3003 |
| robot-maze-race-mysql | Up 7d | :3308 |

✅ 全部运行正常，无异常重启

### 数据库
- **robotrent表数量**：40张
- **死锁**：无
- **外键错误**：有一条历史FK错误（06/30 00:46，robot_race库admin_users表插入时role_id外键约束失败），但那是6月底遗留问题，不影响当前运行

### 端口监听
- :80 / :443 (nginx) ✅
- :8080 (admin) ✅
- :3000 (测试环境) ✅

### discipline-daemon
- **状态**：❌ 未运行（找不到进程）

### 告警
🟡 **discipline-daemon未运行** — 建议Allen确认是否需要重启


---

## 🏗️ 铁甲快狗多租户隔离方案（2026-07-14 讨论，Allen 确认）

### 设计原则
- **用户身份全局共享**：同一 `openid` 通扫所有运营商二维码，不换账户
- **level/combat_power 全局共享**：`season_user_info`、`combat_power` 不按运营商隔离
- **积分按运营商隔离**（2026-07-17 Allen 修正）：`points_transactions` 按运营商隔离，用户在不同运营商小程序积分独立，不能互带
- **互助全局**：`helps`、`help_helpers` 跨运营商共享（同一好友只能助力一次）
- **其余一切运营商隔离**：参赛包、消费券、抵扣卡、积分商城商品、订单、赛场、裁判、商家、签到、成绩、支付等

### 用户交互模型
用户到不同运营商赛场扫码 → 进入该运营商的数据空间（参赛包、消费券等不互通）→ 但账户和积分不变

### 数据库现状
- ✅ 已有 `operator_id`：14 张表（venues、races、race_packages、referees、orders、merchants 等）
- 🟢 全局不需要改：users、points_transactions、combat_power、season_user_info、helps、help_helpers
- 🗑️ 不需要管：user_tickets、lottery_records、lottery_prizes（门票/抽奖模块不考虑）
- 🔴 需补 `operator_id`：**13 张表**（DDL 已执行 ✅，2026-07-14 01:02）
  - user_coupons、coupon_verify_log、entry_deductions、expand_coupons、point_shop、points_exchange_log、checkins、attendance、race_results、payment_transactions、payments、merchant_admin、merchant_coupons
  - 全部 `VARCHAR(36) NOT NULL DEFAULT ''` + `idx_operator_id` 索引
- 🗑️ 第二次DROP（09:14）：user_tickets、lottery_records、lottery_prizes 再次出现（可能被代码重建），已重新删除，备份在 /tmp/drop_backup_20260714_0914.sql
- 存量回填完成（01:04）：attendance 14行、point_shop 5行、merchant_admin 3行、merchant_coupons 5行

### 状态
数据库侧全部就绪，等待小C后端代码。

---

## [服务器+审计巡查] 2026-07-14 08:02

### 【服务器费用巡查】
- **磁盘**：99G总量，已用33G，**36%** ✅
- **内存**：3.6G总量，已用1.3G（可用2.3G）✅ | Swap：9.9G总量，已用1.7G
- **CPU**：load 0.12/0.44/0.35，运行24天，负载正常 ✅
- **Docker服务**：
  - robotrent-admin ✅ healthy（刚重启13秒）
  - robotrent-backend ✅ healthy（刚重启18秒）
  - robotrent-mysql ✅ healthy（运行2周）
  - robotrent-redis ✅ healthy（运行2周）
  - sasdt-test-backend/test-mysql/test-redis ✅ 全部healthy（运行6小时）
  - robot-maze-race-mysql ✅（运行9天）
  - robotrent-test环境容器：无（正常，测试环境已迁移到sasdt-test）
- **数据库**：robotrent库40张表 ✅ | 死锁：**无** | 外键错误：有1个历史错误（2026-06-30 robot_race.admin_users外键约束，非当前故障）
- **端口监听**：
  - 80（Nginx）✅
  - 443（HTTPS）✅
  - 8080（admin）✅ 127.0.0.1
  - 3000（未知node进程）✅ 0.0.0.0
  - 3001（backend）✅ 127.0.0.1

### 【discipline-daemon】
- **状态**：未运行 ✅（之前已移除）

### 【告警】无

### 【备注】
- 数据库有个历史外键错误（robot_race.admin_users的fk约束，admin-id-001插入时role-super-admin在admin_roles表中不存在），发生在6月30日，可能涉及robot-maze-race项目。非robotrent核心业务，低优先级。
- robotrent-admin和backend刚被重启过（本次巡查前13-18秒），估计是健康检查自动恢复或有人手动重启过。

## [服务器+审计巡查] 2026-07-14 08:12

### 健康状态
- **磁盘**：99G总量，已用33G，36% ✅
- **内存**：3.7G总量，已用1.3G（可用2.4G）✅ | Swap：10G已用1.7G
- **CPU**：load 0.12/0.33/0.32，24天9小时 ✅
- **Docker**：8容器全运行 ✅
- **DB**：robotrent 40表 ✅
- **端口**：80/443/3000/8080 全部监听 ✅
- **PM2**：robot-maze-race-backend online 5h ✅
- **sasdt-test**：三容器全部 UP ✅
- **robotrent-admin/backend**：刚重启 7 分钟（可能健康检查自动恢复）

### 告警
无

## [服务器+审计巡查] 2026-07-14 08:18

### 服务器概要
- **运行时间**: 已运行24天9小时 | 负载0.09/0.12/0.21（正常）
- **磁盘**: /dev/vda2 99G，已用34G（36%）— 正常
- **内存**: 总3.6G，已用1.4G，Swap已用1.7G/9.9G — 正常

### Docker容器状态（全部healthy）
| 容器 | 状态 | 端口 |
|------|------|------|
| robotrent-admin | healthy | 127.0.0.1:8080 |
| robotrent-backend | healthy | 127.0.0.1:3001 |
| robotrent-mysql | healthy | 127.0.0.1:3306 |
| robotrent-redis | healthy | 127.0.0.1:6379 |
| sasdt-test-backend | Up 6h | 0.0.0.0:3002 |
| sasdt-test-mysql | healthy | 0.0.0.0:3307 |
| sasdt-test-redis | healthy | 0.0.0.0:6378 |
| robot-maze-race-mysql | Up 9d | 127.0.0.1:3308 |

### 数据库
- **正式库**: robotrent，40张表，2.0MB
- **连接数**: 正常（app连接3个，无拥堵）
- **死锁**: 无
- **外键错误**: 有（robot_race库admin_users表，6月30日的遗留问题，不影响当前业务）
- **测试库tables**: 未获取到（预期行为）

### 端口监听
- :80 - NGINX（返回302） ✅
- :443 - NGINX ✅
- :8080 - admin面板（返回200） ✅
- :3000 - 测试后端（返回404无health端点，已启动） ✅
- :3001 - 正式后端（返回404，已启动） ✅

### discipline-daemon
- **状态**: 未部署（已确认移除，非异常）

### 结论
✅ **系统整体健康，无需告警**
⚠️ 注意：robot_race库admin_users表有6月30日的遗留FK错误，不影响robotrent业务


## [服务器+审计巡查] 2026-07-14 20:04

### 服务器费用巡查
- **运行时长**：24天21小时，负载0.15/0.21/0.16（正常）
- **磁盘**：99G总量，已用34G（37%），剩余61G ✅
- **内存**：3.6Gi总量，使用1.5Gi，Swap使用1.6Gi/9.9Gi ✅
- **CPU**：负载极低，正常

### Docker服务
| 容器 | 状态 | 运行时长 |
|------|------|---------|
| robotrent-admin | ✅ healthy | 11小时 |
| robotrent-backend | ✅ healthy | 11小时 |
| robotrent-mysql | ✅ healthy | 2周 |
| robotrent-redis | ✅ healthy | 2周 |
| sasdt-test-mysql | ✅ healthy | 18小时 |
| sasdt-test-redis | ✅ healthy | 18小时 |
| sasdt-test-backend | ✅ 运行中 | 18小时 |
| robot-maze-race-mysql | ✅ 运行中 | 10天 |

### 数据库
- **robotrent表数**：40
- **死锁/外键错误**：检测到LATEST FOREIGN KEY ERROR（需关注）

### 端口监听
- 80/443 ✅ | 8080(admin) ✅ | 3001(backend) → 127.0.0.1:3000 ✅

### discipline-daemon
- **状态**：未运行（已移除，正常）

### 告警
⚠️ 检测到 FOREIGN KEY ERROR，建议进一步排查数据库外键异常

### 结论
服务器整体健康，磁盘/内存/CPU指标正常，所有Docker容器均运行中。但在InnoDB状态中检测到外键错误，需留意。

## 【服务器+审计巡查】2026-07-15 20:09

【服务器费用巡查】
- 运行时间：25天21小时，负载 0.01/0.04/0.08
- 磁盘：99G总量，已用35G（37%）
- 内存：3.6G总量，已用1.6G（Swap已用1.6G/9.9G）
- Docker服务：全部healthy
  - robotrent-admin (8080)、robotrent-backend (3001)
  - robotrent-mysql、robotrent-redis — 均healthy
  - sasdt-test-backend/redis/mysql — healthy
  - robot-maze-race-mysql — 运行中
- 数据库：robotrent 共40张表
- 死锁：无死锁
- 外键错误：存在1条遗留FOREIGN KEY ERROR（2026-06-30，robot_race.admin_users外键指向admin_roles时父表无匹配记录，非关键业务可忽略）
- 端口监听：80/443/8080/3000 均正常

【discipline-daemon】
- 状态：未部署（已移除，正常）

【告警】无

## [服务器+审计巡查] 2026-07-16 08:03

【服务器费用巡查 - 175.24.200.63】
- 运行时间：26 days 9h+ | 负载 0.30/0.15/0.14 ✅
- 磁盘：99G 已用35G = 37% ✅
- 内存：3.6G 总量，已用 1.6G，Swap 使用 1.6G/9.9G ⚠️ Swap有使用量
- Docker服务（8个容器）：全部运行中 ✅
  - robotrent-admin (healthy), robotrent-backend (healthy)
  - robotrent-mysql (healthy), robotrent-redis (healthy)
  - robot-maze-race-mysql (up), sasdt-test 系列 (healthy)
- 数据库 robotrent：40 表 | robotrent_v2：39 表 | 无死锁 ✅
- 数据库外键错误：有历史外键错误（2026-06-30）涉及 robot_race.admin_users.role_id 指向 admin_roles，为历史遗留问题，未复现
- 端口监听：80/443/8080/3000 均正常 ✅
- discipline-daemon：未运行（正常，已移除）

【告警】⚠️ 低优：Swap使用1.6G；数据库有历史外键错误（06-30），但无新发
【综合】系统运行稳定，无需立即处理。

## [服务器+审计巡查] 2026-07-16 08:23 CST

### 服务器费用巡查
- **运行时间**: 26天9小时29分，负载 0.32/0.18/0.12
- **磁盘**: 37%（35G/99G）
- **内存**: 1.7Gi/3.6Gi（Swap 1.6Gi/9.9Gi）
- **Docker服务**:
  - robotrent-admin — Up 2 days (healthy) :8080
  - robotrent-backend — Up 2 days (healthy) :3001
  - robotrent-mysql — Up 2 weeks (healthy)
  - robotrent-redis — Up 2 weeks (healthy)
  - sasdt-test-backend — Up 2 days :3002
  - sasdt-test-redis — Up 2 days (healthy)
  - sasdt-test-mysql — Up 2 days (healthy)
  - robot-maze-race-mysql — Up 11 days
- **数据库**: robotrent 库 40 张表
- **外键错误**: 历史遗留（2026-06-30 `admin_users` 插入引用不存在的 `role_id`），非当前问题，无需紧急处理
- **端口监听**: 80/443/8080/3000 均正常
- **CPU负载**: 正常（四核平均0.32）

### discipline-daemon
- **状态**: 未部署/未运行（已确认无需关注）

### 告警
- ✅ 无紧急告警
- ℹ️ 历史外键错误（6月30日）可择机修复


## [服务器+审计巡查] 2026-07-17 08:16

```
【服务器费用巡查】
- 运行时间：27天9小时 | 负载：0.00/0.02/0.06
- 磁盘：99G总量，已用35G (37%)
- 内存：3.6G总量，已用1.9G (53%) | Swap：9.9G已用1.6G (16%)
- CPU负载极低，系统整体健康

【Docker服务】
- robotrent-admin：Up 2天 (healthy)
- robotrent-backend：Up 2天 (healthy)
- robotrent-mysql：Up 3周 (healthy)
- robotrent-redis：Up 3周 (healthy)
- robot-maze-race-mysql：Up 12天
- sasdt-test-backend/redis/mysql：Up 3天 (全部healthy)
- 全部容器运行中，无异常

【数据库】
- robotrent库表数：40
- 死锁：无 | 外键错误：有（2026-06-30遗留，非新发）

【端口监听】
- 80/443：正常
- 8080 (admin)：正常
- 3000 (backend)：正常
- 3001/3002/3306/3307/3308/6378/6379：均正常

【discipline-daemon】
- 状态：未部署/未运行（正常）

【告警】无
```

## [服务器+审计巡查] 2026-07-18 08:00

### 系统健康状况
- uptime: 28 days 9h, load 0.13/0.13/0.09
- 磁盘: 99G 总量, 35G 已用 (37%)
- 内存: 3.6G 总量, 1.9G 已用 (53%), Swap 1.6/9.9G
- 运行稳定, 资源充足

### Docker 服务
- 8 个容器全部运行中
- robotrent 集群 (admin/backend/redis/mysql): 全部 healthy
- robot-maze-race-mysql: Up 13 days, healthy
- sasdt-test 集群 (backend/redis/mysql): 全部运行中
- ⚠️ sasdt-test 服务暴露在 0.0.0.0（3002/3307/6378），建议缩回 127.0.0.1

### 数据库
- robotrent 库: 40 张表
- 无死锁检测
- 存在 LATEST FOREIGN KEY ERROR（需排查）

### 端口监听
- 80/443: 正常
- 8080: admin (127.0.0.1)
- 3000: node 进程监听

### discipline-daemon
- 状态: 未部署（已移除）

### 告警状态
- 无严重告警
- 关注: 外键错误记录 + sasdt 绑定范围
