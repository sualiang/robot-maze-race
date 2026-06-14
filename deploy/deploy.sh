#!/bin/bash
set -e

# ========================================
# 机器狗迷宫竞速赛事 — 服务器部署脚本
# 流程: 本地修改 .ts → npx tsc → git push origin main
#       → 本脚本在服务器 git pull + 编译 + 重启
# 确保 本地 == GitHub == 服务器 三方代码完全一致
# ========================================

# ===== 部署前检查清单 =====
__preflight_check() {
  echo "🛩️ 部署前检查清单:"
  echo ""
  echo "  [本地] 步骤 (你来做):"
  echo "    1. git add -A && git commit -m '...'"
  echo "    2. git push origin main"
  echo ""
  echo "  [服务器] 步骤 (脚本自动):"
  echo "    3. git pull（从 GitHub 拉取最新源码）"
  echo "    4. 编译后端（npx tsc）"
  echo "    5. 拷贝 schema.sql 到 dist"
  echo "    6. 拷贝 shared dist（@robot-race/shared）"
  echo "    7. 安装依赖"
  echo "    8. 部署后端 dist 到 /opt/robot-maze-race-server/"
  echo "    9. 编译前端（npx vite build）"
  echo "   10. 部署前端 dist 到 /var/www/robot-maze-race/"
  echo "   11. 健康检查"
  echo ""
  echo "  📦 数据文件检查（banks.json / pca-code.json / geojson_data/）:"
  echo "    - 如果 data 文件有变更，需手动确认"
  echo ""
  if [ -z "$SKIP_PREFLIGHT" ]; then
    read -p "👉 确认本地已 git push? 按回车继续，或 Ctrl+C 取消: " dummy
  fi
}

SERVER="ubuntu@175.24.200.63"
SSH_KEY="~/.ssh/robot_server_925.pem"
REMOTE_REPO="/opt/robot-maze-race"
REMOTE_SERVER_DIR="/opt/robot-maze-race/packages/server"
REMOTE_FRONTEND="/var/www/robot-maze-race"

if [ -z "$1" ]; then
  echo "用法: $0 <backend|frontend|all>"
  echo ""
  echo "  backend  仅部署后端"
  echo "  frontend 仅部署前端"
  echo "  all      部署后端+前端"
  exit 1
fi

# ============================================
# 后端编译部署（在服务器上 git pull + 编译）
# ============================================
deploy_backend() {
  __preflight_check

  echo "📡 连接服务器，开始部署..."

  ssh -o ConnectTimeout=10 -i "$SSH_KEY" "$SERVER" "
    set -e

    echo '📥 Step 1: 从 GitHub 拉取最新代码...'
    cd $REMOTE_REPO
    git fetch origin main
    git pull origin main
    echo '  当前 commit: ' \$(git rev-parse --short HEAD)

    echo '🔧 Step 2: 安装依赖 + 编译后端...'
    cd $REMOTE_SERVER_DIR
    # 确保 node_modules 存在
    if [ ! -d node_modules/.bin ]; then
      # 首次需要 pnpm install
      cd $REMOTE_REPO && pnpm install 2>&1 | tail -5
      cd $REMOTE_SERVER_DIR
    else
      echo '  ⚡ node_modules 已存在，跳过 install'
    fi
    # 拷贝 schema.sql 到 dist（tsc 不处理 .sql 文件）
    cp src/db/schema.sql dist/db/schema.sql 2>/dev/null || true
    # 用 pnpm exec tsc（使用工作区的本地 typescript）
    pnpm exec tsc --outDir dist 2>&1 || { echo '❌ 编译失败'; exit 1; }
    echo '  ✅ 编译成功'

    echo '📦 Step 3: 准备 shared 模块...'
    mkdir -p $REMOTE_REPO/packages/shared/dist 2>/dev/null
    mkdir -p $REMOTE_SERVER_DIR/node_modules/@robot-race
    rm -rf $REMOTE_SERVER_DIR/node_modules/@robot-race/shared
    cp -r $REMOTE_REPO/packages/shared/dist $REMOTE_SERVER_DIR/node_modules/@robot-race/shared/

    echo '📦 Step 4: 安装依赖...'
    cd $REMOTE_SERVER_DIR
    npm install --omit=dev 2>&1 | tail -3

    echo '📤 Step 5: 部署后端到生产目录...'
    sudo rm -rf /opt/robot-maze-race-server/routes /opt/robot-maze-race-server/db /opt/robot-maze-race-server/middleware /opt/robot-maze-race-server/config /opt/robot-maze-race-server/ws /opt/robot-maze-race-server/index.js /opt/robot-maze-race-server/server.js /opt/robot-maze-race-server/package.json /opt/robot-maze-race-server/*.js.map

    # dist 中有 schema.sql 但独立目录结构更清晰，直接用 dist 内容
    sudo mkdir -p /opt/robot-maze-race-server
    sudo cp -r dist/* /opt/robot-maze-race-server/
    sudo cp package.json /opt/robot-maze-race-server/

    # 复制数据文件
    echo '📄 Step 6: 复制数据文件...'
    sudo cp $REMOTE_REPO/packages/server/src/banks.json /opt/robot-maze-race-server/ 2>/dev/null || true
    sudo cp $REMOTE_REPO/packages/shared/src/pca-code.json /opt/robot-maze-race-server/ 2>/dev/null || echo '  ⚠️ pca-code.json 未找到，跳过'
    if [ -d $REMOTE_REPO/packages/server/src/geojson_data ]; then
      sudo cp -r $REMOTE_REPO/packages/server/src/geojson_data /opt/robot-maze-race-server/ 2>/dev/null || true
    fi

    sudo chown -R ubuntu:ubuntu /opt/robot-maze-race-server
    sudo chmod -R 755 /opt/robot-maze-race-server

    # 复制 shared 模块到生产目录
    echo '📦 Step 7: 同步 shared 到生产目录...'
    mkdir -p /opt/robot-maze-race-server/node_modules/@robot-race
    rm -rf /opt/robot-maze-race-server/node_modules/@robot-race/shared
    cp -r $REMOTE_SERVER_DIR/node_modules/@robot-race/shared /opt/robot-maze-race-server/node_modules/@robot-race/

    echo '🚀 Step 8: 启动后端...'
    pm2 restart robot-maze-race-server --update-env 2>/dev/null || pm2 start /opt/robot-maze-race-server/server.js --name robot-maze-race-server --update-env
    sleep 4

    echo '✅ Step 9: 健康检查...'
    curl -s http://localhost:3000/api/v1/health

    echo ''
    echo '🎉 后端部署完成！'
  "
}

# ============================================
# 前端编译部署（在服务器上编译）
# ============================================
deploy_frontend() {
  echo "📡 连接服务器，开始前端部署..."

  ssh -o ConnectTimeout=10 -i "$SSH_KEY" "$SERVER" "
    set -e

    echo '📥 Step 1: 拉取最新前端源码...'
    cd $REMOTE_REPO
    git fetch origin main
    git pull origin main
    echo '  当前 commit: ' \$(git rev-parse --short HEAD)

    echo '🔧 Step 2: 编译前端...'
    cd $REMOTE_REPO/packages/web
    rm -rf dist
    npx vite build --mode production 2>&1 | tail -5

    echo '📤 Step 3: 部署前端到 Nginx 目录...'
    sudo rm -rf $REMOTE_FRONTEND/assets $REMOTE_FRONTEND/index.html $REMOTE_FRONTEND/favicon.svg $REMOTE_FRONTEND/icons.svg
    sudo cp -r dist/* $REMOTE_FRONTEND/
    sudo chown -R www-data:www-data $REMOTE_FRONTEND

    echo '✅ 前端部署完成！'
  "
}

# ============================================
# 主流程
# ============================================
case "$1" in
  backend)
    deploy_backend
    ;;
  frontend)
    deploy_frontend
    ;;
  all)
    deploy_backend
    deploy_frontend
    ;;
  *)
    echo "未知参数: \$1 (使用 backend|frontend|all)"
    exit 1
    ;;
esac

echo ""
echo "🎉 所有部署任务完成！"
echo "   最新 commit: \$(ssh -o ConnectTimeout=5 -i $SSH_KEY $SERVER 'cd $REMOTE_REPO && git rev-parse --short HEAD' 2>/dev/null || echo '?)"
echo "   后端健康: \$(curl -s http://175.24.200.63/api/v1/health 2>/dev/null || echo '检查失败')"
