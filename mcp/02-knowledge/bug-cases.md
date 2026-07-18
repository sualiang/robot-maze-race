# Bug 案例库

> **踩过的坑，不要再踩第二次**
>
> 记录所有项目遇到的典型 Bug 和解决方案

---

## 📋 案例列表

### 1. sesssions_send 被拦截 — 目标 Agent 无活跃 session
- **现象：** 调用 sessions_send 发送消息给 product-manager 时，状态返回 pending 接收不到
- **触发条件：** 目标 Agent 在 WebChat/其他渠道没有进行过对话，无活跃 session
- **根本原因：** sessions_send 需要目标 Agent 有至少一个活跃 session 才能投递
- **解决方案：** 让目标 Agent 先创建一个 session（通过 WebChat 发送一条消息），然后再 sessions_send
- **预防措施：** 配置新 Agent 时为其创建默认 main session
- **相关项目：** SASDT V3.5 体系建设
- **发现时间：** 2026-06-26
- **解决人：** 技术开发总监（小D）

### 2. WebChat 双 Agent 切换后身份标签不刷新
- **现象：** 通过 /dm 切换到另一 Agent 频道后，UI 输入框和气泡仍显示原 Agent 名称
- **触发条件：** 任何通过 /dm 切换 Agent 频道的操作
- **根本原因：** WebChat UI 缓存的 Agent 身份信息未被清除
- **解决方案：** 清除浏览器 Cookie 后重新登录；或直接从新 Agent URL 入口打开
- **预防措施：** 已知不可配置的行为，无需额外修复
- **相关项目：** OpenClaw WebChat
- **发现时间：** 2026-06-26
- **解决人：** 技术开发总监（小D）

### 3. file_system MCP 无法写入 agent 配置目录
- **现象：** 通过 file_system MCP 服务器写入 product-manager 的 .mcp.json 时报错
- **触发条件：** 尝试用 file_system 向 ~/.openclaw/agents/product-manager/ 目录下写文件
- **根本原因：** file_system allowedDirectories 配置不包含 ~/.openclaw/ 路径；OpenClaw 安全策略不允许通过 file_system 写入 user-level 配置文件
- **解决方案：** 改用 sessions_send 消息机制向豆包传递信息
- **预防措施：** 涉及 Agent 配置文件的操作，一律走会话消息而非直接文件写入
- **相关项目：** SASDT V3.5 体系同步
- **发现时间：** 2026-06-26
- **解决人：** 技术开发总监（小D）

---

## 📝 案例格式

每个 Bug 案例必须包含：

1. **Bug 标题** — 一句话描述问题
2. **现象描述** — Bug 表现是什么，报错信息是什么
3. **触发条件** — 在什么情况下会出现这个 Bug
4. **根本原因** — 为什么会出现这个问题（根因分析）
5. **解决方案** — 怎么解决的，具体步骤
6. **预防措施** — 以后怎么避免再出现
7. **相关项目** — 哪个项目遇到的
8. **发现时间** — YYYY-MM-DD
9. **解决人** — 谁解决的

---

## 🔍 如何使用

1. 遇到 Bug 先到这里搜搜，看看有没有现成的解决方案
2. 解决了新 Bug 之后，记得沉淀到这里
3. 定期回顾，看看哪些 Bug 反复出现，从根源上解决

---

**最后更新：** 2026-06-26
**维护人：** 技术开发总监（小D）
