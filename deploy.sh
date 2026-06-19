#!/usr/bin/env bash
set -euo pipefail

# ======================================================
# 铁甲快狗 一键部署脚本
# 用法: bash deploy.sh [server_ip]
# 默认部署到 175.24.200.63
# ======================================================

HOST="${1:-175.24.200.63}"
KEY="$HOME/.ssh/robot_server_925.pem"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE_DIR="/opt/robot-maze-race-server"
WEB_DIR="/var/www/robot-maze-race"
PM2_APP="robot-maze-race-server"

echo "🔨 编译后端..."
cd "$PROJECT_DIR/packages/server"
npx tsc

echo "🔨 编译前端..."
cd "$PROJECT_DIR/packages/web"
npx vite build

echo "📦 打包上传..."
cd "$PROJECT_DIR/packages/server"
tar czf /tmp/deploy-server.tar.gz dist/
cd "$PROJECT_DIR/packages/web"
tar czf /tmp/deploy-web.tar.gz dist/

scp -i "$KEY" /tmp/deploy-server.tar.gz ubuntu@"$HOST":/tmp/
scp -i "$KEY" /tmp/deploy-web.tar.gz   ubuntu@"$HOST":/tmp/
rm -f /tmp/deploy-server.tar.gz /tmp/deploy-web.tar.gz

echo "🚀 远程部署..."
ssh -i "$KEY" ubuntu@"$HOST" << 'CMDS'
  set -e

  # 后端：全量替换 dist 目录
  sudo rm -rf /opt/robot-maze-race-server/dist
  sudo tar xzf /tmp/deploy-server.tar.gz -C /opt/robot-maze-race-server/
  # banks.json 还在父目录，复制到 dist 下
  sudo cp /opt/robot-maze-race-server/banks.json /opt/robot-maze-race-server/dist/banks.json 2>/dev/null || true
  sudo rm -f /tmp/deploy-server.tar.gz
  # 修复 tar 解压导致的权限问题（owner 会保留本机 uid:staff）
  sudo chown -R ubuntu:ubuntu /opt/robot-maze-race-server/dist
  sudo chmod -R 755 /opt/robot-maze-race-server/dist

  # 前端：全量替换
  sudo rm -rf /var/www/robot-maze-race/*
  sudo bash -c 'cd /tmp && tar xzf deploy-web.tar.gz && cp -r dist/* /var/www/robot-maze-race/ && rm -rf dist deploy-web.tar.gz'
  sudo chown -R www-data:www-data /var/www/robot-maze-race

  # 重启后端
  pm2 restart robot-maze-race-server
  echo "✅ 部署完成"
CMDS
