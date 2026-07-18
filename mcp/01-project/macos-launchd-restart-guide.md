# MacOS launchd 强制重启流程 — 运维手册
> 责任人: 07-安全合规&DevOps专员
> 适用场景: OpenClaw Gateway 僵死 / 会话锁卡死 / 进程无响应
> 最后更新: 2026-06-27

---

## 1. 故障诊断

### 1.1 现象确认

| 现象 | 可能原因 | 行动 |
|------|----------|------|
| `session file locked` 报错 | 异常退出后锁文件残留 | 删锁 → 重启 |
| WebSocket 断连 / 无响应 | 网关僵死 / 内存泄漏 | kill → launchctl 重启 |
| `openclaw` 命令超时 | CLI 子进程卡死 | 查 PID → kill |
| agent 消息无法发出 | 会话锁持有但进程已死 | 巡检删锁 |

### 1.2 快速诊断命令

```bash
# 1. 检查网关进程
pgrep -x openclaw        # 返回 PID
ps aux | grep openclaw   # 查看完整进程状态

# 2. 检查当前锁文件（重点是 PID 是否还活着）
find ~/.openclaw/agents -name "*.jsonl.lock" 2>/dev/null
for f in ~/.openclaw/agents/*/sessions/*.lock; do
  [ -f "$f" ] || continue
  PID=$(cat "$f" | python3 -c "import json,sys;print(json.load(sys.stdin)['pid'])" 2>/dev/null)
  if [ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null; then
    echo "🔴 死锁: $(basename $f) (PID=$PID 已死)"
  else
    echo "🟢 有效: $(basename $f) (PID=$PID 存活)"
  fi
done

# 3. 检查 launchd 状态
launchctl list ai.openclaw.gateway

# 4. 检查日志
tail -n 30 ~/Library/Logs/openclaw/gateway.log
tail -n 30 ~/Library/Logs/openclaw/watchdog.log
```

---

## 2. 强制重启流程

### 场景 A: 进程僵死但 launchd KeepAlive 未触发重启

```bash
# Step 1: 终止僵死进程（如果 pgrep 能找到）
PID=$(pgrep -x openclaw)
if [ -n "$PID" ]; then
  kill -15 "$PID"    # 优雅停止
  sleep 3
  kill -9 "$PID"     # 强制终止
fi

# Step 2: 删除所有残留会话锁文件
find ~/.openclaw/agents -name "*.jsonl.lock" -delete
echo "✅ 已清理所有锁文件"

# Step 3: 通过 launchd 重启（保留 KeepAlive）
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway

# Step 4: 验证
sleep 5
pgrep -x openclaw && echo "✅ 进程已启动"
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789

# Step 5: 如果 kickstart 不生效，手动重启 launchd job
launchctl bootout gui/$(id -u)/ai.openclaw.gateway 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

### 场景 B: 进程已完全消失，锁文件残留（session locked）

```bash
# Step 1: 确认进程已死
pgrep -x openclaw || echo "✅ 进程已消失"

# Step 2: 清理所有锁文件（强制）
find ~/.openclaw/agents -name "*.jsonl.lock" -delete

# Step 3: 启动 gateway（用 kickstart 触发 KeepAlive）
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway

# Step 4: 验证
sleep 5
curl -s http://127.0.0.1:18789/health 2>/dev/null || echo "⏳ 等待启动..."
```

### 场景 C: 完全重启（含看门狗）

```bash
# 完整重启链路（保留 launchd plist 不变）
launchctl bootout gui/$(id -u)/ai.openclaw.gateway 2>/dev/null
launchctl bootout gui/$(id -u)/ai.openclaw.gateway.watchdog 2>/dev/null

find ~/.openclaw/agents -name "*.jsonl.lock" -delete
find ~/.openclaw/tmp -name "*.lock" -delete 2>/dev/null

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.watchdog.plist.bak

# 验证
sleep 3
launchctl list | grep openclaw
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789
```

---

## 3. 一键恢复命令（三合一行）

> 适用于 chat 中快速执行，无需多步骤

```bash
# ===== 完整恢复 =====
pgrep -x openclaw && pkill -9 openclaw; sleep 1; \
find ~/.openclaw/agents -name "*.jsonl.lock" -delete; \
find ~/.openclaw/tmp -name "*.lock" -delete 2>/dev/null; \
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway; \
sleep 5; echo "---"; pgrep -x openclaw && echo "✅ OK" || echo "❌ FAIL"
```

---

## 4. 验证服务恢复 Check List

执行完毕后，依次检查：

| # | 检查项 | 命令 | 预期结果 |
|---|--------|------|----------|
| 1 | 进程存在 | `pgrep -x openclaw` | 返回 PID（如 87430） |
| 2 | HTTP 可达 | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789` | 200 |
| 3 | 无死锁残留 | `find ~/.openclaw/agents -name "*.jsonl.lock"` | 空（或只有当前 session 的有效锁） |
| 4 | launchd 注册 | `launchctl list \| grep openclaw` | 显示 PID，status=0 |
| 5 | 看门狗加载 | `launchctl list \| grep watchdog` | 存在且 PID > 0 |
| 6 | WebSocket 通道 | 通过 OpenClaw 发送一条消息 | 消息正常送达 |
| 7 | 日志无 ERROR | `tail -20 ~/Library/Logs/openclaw/gateway.log \| grep -c ERROR` | 0 |
| 8 | 看门狗日志无异常 | `tail -5 ~/Library/Logs/openclaw/watchdog.log` | 最近记录为健康 ✅ |

---

## 5. launchd 相关命令速查

```bash
# 状态
launchctl list                          # 列出所有用户级别任务
launchctl list ai.openclaw.gateway      # 查看单个任务（PID、状态、最后退出码）

# 启动 / 停止
launchctl kickstart gui/$(id -u)/ai.openclaw.gateway        # 强制启动（忽略 KeepAlive 状态）
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway     # 先 kill 再启动（更彻底）
launchctl stop gui/$(id -u)/ai.openclaw.gateway              # 停止（SIGTERM）
launchctl kill SIGTERM gui/$(id -u)/ai.openclaw.gateway     # 发送信号

# 注册 / 卸载（不常用，plist 持久化）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl bootout gui/$(id -u)/ai.openclaw.gateway

# 环境变量检查
launchctl print gui/$(id -u)/ai.openclaw.gateway    # 打印完整配置
```

---

## 6. plist 配置一览

| 项目 | 值 |
|------|------|
| Label | ai.openclaw.gateway |
| 可执行路径 | `/Users/longshe/.npm-global/lib/node_modules/openclaw/dist/index.js` |
| 参数 | `gateway --port 18789` |
| 运行策略 | `KeepAlive = true`（异常退出自动重启） |
| 退出超时 | 20 秒 |
| 标准输出日志 | `~/Library/Logs/openclaw/gateway.log` |
| 工作目录 | `~/.openclaw` |

> ⚠️ **说明**: KeepAlive=true 意味着进程退出后 launchd 会自动重启。
> 但如果 session 锁文件残留，重启后新进程仍会被旧锁阻塞。
> 因此「删锁 → 重启」才是完整恢复流程，缺一不可。
