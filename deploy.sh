#!/bin/bash
# ============================================================
# 机器狗迷宫竞速赛事 - 生产部署脚本
# 适用：腾讯云服务器（Ubuntu / CentOS）
# 方案：Nginx 反向代理 + PM2 管理后端 + Vite 构建前端
# ============================================================

set -e

# -------- 配置区域（部署前修改） --------
DOMAIN="your-domain.com"                      # 正式域名
PROJECT_DIR="/opt/robot-maze-race"            # 部署目录
NODE_VERSION="20"                             # Node.js 版本
BACKEND_PORT=3000                             # 后端本地端口

# -------- 颜色输出 --------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# -------- Step 1: 环境检查 --------
info "检查系统环境..."

# Node.js
if ! command -v node &>/dev/null; then
  warn "Node.js 未安装，正在安装..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi

# PM2
if ! command -v pm2 &>/dev/null; then
  warn "PM2 未安装，正在安装..."
  npm install -g pm2
fi

# Nginx
if ! command -v nginx &>/dev/null; then
  warn "Nginx 未安装，正在安装..."
  apt-get update && apt-get install -y nginx
fi

# -------- Step 2: 项目构建 --------
info "开始构建项目..."

cd "$PROJECT_DIR"

# 安装依赖
info "安装依赖..."
cd packages/shared && npm install && cd ../..
cd packages/server && npm install && cd ../..
cd packages/web && npm install && cd ../..

# 构建后端
info "编译后端 TypeScript..."
cd packages/server
npm run build
cd ../..

# 构建前端
info "构建前端静态文件..."
cd packages/web
# 替换 .env.production 中的占位域名为实际域名
sed -i "s/your-domain.com/$DOMAIN/g" .env.production
# 使用生产环境变量构建
VITE_API_BASE_URL=/api/v1 \
VITE_WS_URL=wss://$DOMAIN/ws/screen \
VITE_REFEREE_WS_URL=wss://$DOMAIN/ws/referee \
  npx vite build --mode production
cd ../..

# -------- Step 3: 准备生产目录 --------
info "准备生产目录..."

# 后端服务目录
mkdir -p /opt/robot-maze-race-server
cp -r packages/server/dist/* /opt/robot-maze-race-server/
cp packages/server/package.json /opt/robot-maze-race-server/
cp packages/server/.env.production /opt/robot-maze-race-server/.env 2>/dev/null || true
cd /opt/robot-maze-race-server && npm install --production && cd -

# 前端静态文件
mkdir -p /var/www/robot-maze-race
cp -r packages/web/dist/* /var/www/robot-maze-race/

# 创建后端生产配置文件
cat > /opt/robot-maze-race-server/.env <<EOF
PORT=$BACKEND_PORT
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 32)
SQLITE_PATH=./data/robot-maze-race.db
EOF

# -------- Step 4: 配置 Nginx --------
info "配置 Nginx..."

cat > /etc/nginx/sites-available/robot-maze-race <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # 重定向到 HTTPS（如果已有 SSL 证书，建议开启）
    # return 301 https://\$host\$request_uri;

    # 前端静态文件
    root /var/www/robot-maze-race;
    index index.html;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket 代理（大屏 + 裁判端）
    location /ws/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # SPA 路由：所有非静态文件请求返回 index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/robot-maze-race /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
nginx -t

# -------- Step 5: 启动服务 --------
info "启动服务..."

# 启动后端（PM2 守护）
pm2 delete robot-maze-race-server 2>/dev/null || true
pm2 start dist/server.js \
  --name robot-maze-race-server \
  --cwd /opt/robot-maze-race-server \
  --env NODE_ENV=production \
  --max-memory-restart 500M

pm2 save
pm2 startup 2>/dev/null || true

# 启动 Nginx
systemctl enable nginx 2>/dev/null || true
systemctl restart nginx

# -------- Step 6: 验证 --------
info "验证部署..."
sleep 2
if curl -s http://127.0.0.1:$BACKEND_PORT/api/v1/health | grep -q '"code": 0'; then
  info "✅ 后端服务正常运行"
else
  error "❌ 后端服务异常，请检查日志"
fi

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1 | grep -q "200"; then
  info "✅ Nginx 代理正常运行"
else
  warn "⚠️ Nginx 可能未完全启动，请检查"
fi

# -------- Step 7: SSL 证书（可选，推荐 Let's Encrypt） --------
# 如果有域名且需 HTTPS，取消注释以下行：
# info "申请 SSL 证书..."
# apt-get install -y certbot python3-certbot-nginx
# certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN

info "============================================"
info "🎉 部署完成！"
info "   前端: http://$DOMAIN"
info "   API:  http://$DOMAIN/api/v1/health"
info "   WS:   ws://$DOMAIN/ws/screen"
info ""
info "后续操作："
info "  1. 修改 /opt/robot-maze-race-server/.env 中的 JWT_SECRET"
info "  2. 配置 SSL 证书（certbot --nginx -d $DOMAIN）"
info "  3. 如有 HTTPS，更新 .env.production 中的 WSS 地址"
info "============================================"
