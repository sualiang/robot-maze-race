# 标准故障处理命令集 — Session 锁卡死诊断与恢复
> 责任人: 07-安全合规&DevOps专员
> 标准化时间: 2026-06-27
> 适用范围: OpenClaw Agent session file locked / 进程僵死 / 锁死锁

---

## 一、快速总览

```
故障现象 → 诊断命令 → 恢复命令 → 验证命令
```

使用速查（按严重程度排列）:

| 等级 | 场景 | 快捷命令 |
|------|------|----------|
| 🟢 L1 | 仅怀疑 | `诊断 ①` |
| 🟡 L2 | 锁文件残留 | `恢复 ②` |
| 🔴 L3 | 完全卡死 | `恢复 ④` |

---

## 二、诊断命令

### ① 完整诊断（运行即可）

```bash
# 捕获故障现场，输出到 /tmp/session-lock-diagnosis.md
{
  echo "# Session Lock Diagnosis $(date)"
  echo ""
  echo "## Process"
  pgrep -x openclaw || echo "(no openclaw process)"
  ps aux | grep -E 'openclaw|node.*gateway' | grep -v grep
  echo ""
  echo "## Launchd"
  launchctl list | grep openclaw
  echo ""
  echo "## Lock Files"
  for f in ~/.openclaw/agents/*/sessions/*.jsonl.lock; do
    [ -f "$f" ] || continue
    echo "--- $(basename $f) ---"
    cat "$f"
    PID=$(cat "$f" | python3 -c "import json,sys;print(json.load(sys.stdin)['pid'])" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      echo "   → PID $PID 存活"
    else
      echo "   → ⚠️ PID $PID 已死 / 不存在"
    fi
    echo ""
  done
  echo "## Gateway Log (last 20 lines)"
  tail -20 ~/Library/Logs/openclaw/gateway.log 2>/dev/null || echo "(no log)"
  echo ""
  echo "## Watchdog Log (last 10 lines)"
  tail -10 ~/Library/Logs/openclaw/watchdog.log 2>/dev/null || echo "(no log)"
} > /tmp/session-lock-diagnosis.md

cat /tmp/session-lock-diagnosis.md
```

### ② 快速检查（一行）

```bash
echo "PIDs=$(pgrep -x openclaw | tr '\n' ' ') | $(find ~/.openclaw/agents -name '*.jsonl.lock' | wc -l | tr -d ' ') locks"
```

---

## 三、恢复命令

### ③ 删锁（轻量级，仅清理死锁）

```bash
# 仅清理 PID 已死的锁文件
find ~/.openclaw/agents -name "*.jsonl.lock" -exec sh -c '
  PID=$(cat "$1" | python3 -c "import json,sys;print(json.load(sys.stdin)[\"pid\"])" 2>/dev/null)
  if [ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null; then
    echo "删除死锁: $1 (PID=$PID)"
    rm -f "$1"
  fi
' _ {} \;
echo "Done."
```

### ④ 强制重启（完全恢复，推荐）

```bash
# 完整恢复链路（kill → 删锁 → launchd 启动 → 验证）
KILL_PID=$(pgrep -x openclaw)
if [ -n "$KILL_PID" ]; then
  kill -15 "$KILL_PID" 2>/dev/null
  sleep 2
  kill -9 "$KILL_PID" 2>/dev/null
fi
find ~/.openclaw/agents -name "*.jsonl.lock" -delete
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway
sleep 5
pgrep -x openclaw && echo "✅ 恢复成功" || echo "❌ 失败"
```

### ⑤ 深度重置（清空 tmp 锁 + 看门狗重启）

```bash
# 适合看门狗也异常的场景
launchctl bootout gui/$(id -u)/ai.openclaw.gateway 2>/dev/null
launchctl bootout gui/$(id -u)/ai.openclaw.gateway.watchdog 2>/dev/null
find ~/.openclaw/agents -name "*.jsonl.lock" -delete
find ~/.openclaw/tmp -name "*.lock" -delete 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.watchdog.plist.bak
sleep 3; curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789
```

---

## 四、验证命令

### ⑥ 完整验证

```bash
# 输出一个简洁状态报告
echo "=== 验证报告 $(date) ==="
echo "进程: $(pgrep -x openclaw || echo '❌')"
echo "HTTP: $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:18789 || echo '000')"
echo "死锁: $(find ~/.openclaw/agents -name '*.jsonl.lock' | head -5 | tr '\n' ' ' || echo '无')"
echo "LaunchD: $(launchctl list ai.openclaw.gateway 2>/dev/null | awk 'NR==2{print $1}' | tr -d '\n')"
```

### ⑦ 持续监控（30秒健康检查）

```bash
for i in 1 2 3; do
  sleep 10
  echo "$(date +%H:%M:%S) PID=$(pgrep -x openclaw) HTTP=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18789)"
done
```

---

## 五、历史故障速查（2026-06-27 事件）

| 项目 | 内容 |
|------|------|
| 故障时间 | 2026-06-27 下午 |
| 故障PID | 73800 |
| 报错信息 | `session file locked` |
| 根因 | 进程异常退出后，锁文件残留未清理 |
| CLI 踩坑 | `openclaw agents` vs `openclaw agent` 命令歧义 |
| 修复方式 | 删锁 → launchd kickstart 重启 |
| 永久加固 | ① ops-bot 巡检脚本（section 8）② launchd 重启流程文档化 |

---

## 六、锁文件格式参考

```json
{
  "pid": 87430,
  "createdAt": "2026-06-27T08:01:28.408Z",
  "maxHoldMs": 300000
}
```

| 字段 | 说明 |
|------|------|
| pid | 持有锁的进程 ID |
| createdAt | 锁创建时间 (ISO 8601 UTC) |
| maxHoldMs | 最大持有时间(毫秒)，默认 5min |

**判断死锁标准**: PID 已死 + 年龄 > maxHoldMs/1000 + 5min 缓冲 = 死锁
