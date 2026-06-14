#!/bin/bash
set -e

# ========================================
# 机器狗迷宫竞速赛事 — 服务器部署脚本
# ⚠️ 部署前请先执行: git push origin main 确保与 GitHub 同步
# ========================================

# ===== 部署前检查清单（每次执行前先停下来想一想）=====
__preflight_check() {
  echo "🛩️ 部署前检查清单:"
  echo "  1. ✅ git push origin main 已经执行了?"
  echo "  2. 📂 tar 打包前缀: 后端 route 文件在 ./routes/ 下, 不是 ./dist/routes/"
  echo "  3. 🗄️ 数据库补丁: 新加列/新表需要 ALTER TABLE 或 schema.sql 同步"
  echo "  4. 📊 数据文件: banks.json / pca-code.json / geojson_data/ 是否遗漏?"
  echo "  5. 🔗 shared 模块: @robot-race/shared 的 dist 是否已更新?"
  echo "  6. 🧹 旧文件清理: 之前部署遗留的 .js.map / dist/ 污染要删掉"
  echo ""
  if [ -z "$SKIP_PREFLIGHT" ]; then
    read -p "按回车继续部署，或 Ctrl+C 取消: " dummy
  fi
}

SERVER="ubuntu@175.24.200.63"
SSH_KEY="~/.ssh/robot_server_925.pem"
REMOTE_BACKEND="/opt/robot-maze-race-server"
REMOTE_FRONTEND="/var/www/robot-maze-race"
DATA_SOURCE="/opt/robot-maze-race"

if [ -z "$1" ]; then
  echo "用法: $0 <backend|frontend|all>"
  exit 1
fi

build_backend() {
  __preflight_check
  echo "🔧 编译后端..."
  cd packages/server
  npm run build 2>&1 | tail -3
  cd ../..

  echo "📦 打包后端..."
  rm -rf /tmp/robot-maze-race-server-deploy
  mkdir -p /tmp/robot-maze-race-server-deploy
  cp -r packages/server/dist/* /tmp/robot-maze-race-server-deploy/
  cp packages/server/package.json /tmp/robot-maze-race-server-deploy/
  cd /tmp/robot-maze-race-server-deploy
  tar -czf /tmp/robot-backend-dist.tar.gz .
  cd -
}

build_frontend() {
  echo "🔧 编译前端..."
  cd packages/web
  rm -rf dist
  npx vite build --mode production 2>&1 | tail -5
  cd ../..

  echo "📦 打包前端..."
  cd packages/web/dist
  tar -czf /tmp/robot-frontend-dist.tar.gz .
  cd -
}

deploy_backend() {
  echo "📤 上传后端..."
  scp -i "$SSH_KEY" /tmp/robot-backend-dist.tar.gz "$SERVER:/tmp/"

  ssh -o ConnectTimeout=10 -i "$SSH_KEY" "$SERVER" "
    set -e
    echo '🛑 停后端...'
    pm2 stop robot-maze-race-server 2>/dev/null || true

    echo '🧹 清理旧代码（保留 data/ robots/.env 文件）...'
    cd $REMOTE_BACKEND
    sudo rm -rf routes config middleware ws index.js server.js package.json *.js.map

    echo '📦 解压新代码...'
    sudo tar -xzf /tmp/robot-backend-dist.tar.gz -C $REMOTE_BACKEND/
    # 防止 tar 解压时文件权限被改了
    sudo chown -R ubuntu:ubuntu $REMOTE_BACKEND
    sudo chmod 755 $REMOTE_BACKEND/routes/*.js 2>/dev/null || true

    echo '📄 复制数据文件...'
    sudo cp $DATA_SOURCE/packages/server/src/banks.json $REMOTE_BACKEND/ 2>/dev/null
    sudo cp $DATA_SOURCE/packages/shared/src/pca-code.json $REMOTE_BACKEND/ 2>/dev/null
    sudo cp -r $DATA_SOURCE/packages/server/src/geojson_data $REMOTE_BACKEND/ 2>/dev/null
    sudo chown ubuntu:ubuntu $REMOTE_BACKEND/banks.json $REMOTE_BACKEND/pca-code.json 2>/dev/null || true

    echo '📦 安装依赖...'
    cd $REMOTE_BACKEND
    # shared 模块先准备好
    rm -rf $REMOTE_BACKEND/node_modules/@robot-race/shared
    mkdir -p $REMOTE_BACKEND/node_modules/@robot-race
    cp -r $DATA_SOURCE/packages/shared/dist $REMOTE_BACKEND/node_modules/@robot-race/shared/
    # npm install 补全依赖
    npm install --omit=dev 2>&1 | tail -3

    echo '🚀 启动后端...'
    pm2 start $REMOTE_BACKEND/server.js --name robot-maze-race-server --update-env
    sleep 4

    echo '✅ 健康检查...'
    curl -s http://localhost:3000/api/v1/health
  "
}

deploy_frontend() {
  echo "📤 上传前端..."
  scp -i "$SSH_KEY" /tmp/robot-frontend-dist.tar.gz "$SERVER:/tmp/"

  ssh -o ConnectTimeout=10 -i "$SSH_KEY" "$SERVER" "
    set -e
    echo '🧹 清理旧前端...'
    sudo rm -rf $REMOTE_FRONTEND/assets $REMOTE_FRONTEND/index.html

    echo '📦 解压新前端...'
    sudo tar -xzf /tmp/robot-frontend-dist.tar.gz -C $REMOTE_FRONTEND/
    sudo chown -R www-data:www-data $REMOTE_FRONTEND

    echo '✅ 前端部署完成'
  "
}

# === 主流程 ===

case "$1" in
  backend)
    build_backend
    deploy_backend
    ;;
  frontend)
    build_frontend
    deploy_frontend
    ;;
  all)
    build_backend
    build_frontend
    deploy_backend
    deploy_frontend
    ;;
  *)
    echo "未知参数: $1 (使用 backend|frontend|all)"
    exit 1
    ;;
esac

echo ""
echo "🎉 部署完成！"
