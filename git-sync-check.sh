#!/bin/bash
# 代码同步检查：本地 ↔ GitHub ↔ 服务器

echo "=== 本地 Git 状态 ==="
cd ~/.openclaw/workspace
git status --short 2>/dev/null || echo "非Git仓库或git命令不可用"
echo ""

echo "=== GitHub 一致性 ==="
git fetch origin 2>&1
BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")
AHEAD=$(git rev-list origin/main..HEAD --count 2>/dev/null || echo "0")
echo "落后origin/main: ${BEHIND} commit"
echo "领先origin/main: ${AHEAD} commit"
if [ "$BEHIND" = "0" ] && [ "$AHEAD" = "0" ]; then
  echo "✅ 本地与 GitHub 一致"
else
  echo "⚠️ 本地与 GitHub 有差异"
fi
echo ""

echo "=== 服务器 dist 状态 ==="
ssh -i ~/.ssh/cc_dev_test -o ConnectTimeout=5 -o StrictHostKeyChecking=no cc-dev@175.24.200.63 '
  echo "--- Docker images ---"
  docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" 2>/dev/null | head -10
  echo ""
  echo "--- PM2 list ---"
  pm2 list 2>/dev/null || echo "pm2 not available"
  echo ""
  echo "--- Docker容器最新启动时间 ---"
  docker ps --format "{{.Names}} {{.Status}}" 2>/dev/null
' 2>&1
echo ""
echo "=== 完成 ==="
