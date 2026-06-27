FROM node:22-alpine AS builder
WORKDIR /app

# 复制依赖清单
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

# 安装构建依赖（忽略 postinstall 脚本）
RUN corepack enable && corepack prepare pnpm@11.5.3 --activate && pnpm install --frozen-lockfile --ignore-scripts

# 复制源码
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/server/src ./packages/server/src
COPY packages/server/tsconfig.json ./packages/server/

# 构建 shared 和 server
RUN CI=true pnpm install --offline && pnpm --filter @robot-race/shared build && pnpm --filter @robot-race/server build

# ========== 第二阶段：用 pnpm deploy 打包 server 生产依赖 ==========
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.3 --activate

# 复制依赖清单（只需要 install 用到的东西）
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

# 安装完整依赖（需要 shared 的 build artifacts 在 deploy 时被正确解析）
RUN pnpm install --frozen-lockfile --ignore-scripts

# 用 pnpm deploy --prod 提取 server 的独立依赖树到 /tmp/server-prod
RUN pnpm deploy --filter @robot-race/server --prod --legacy /tmp/server-prod

# ========== 第三阶段：运行 ==========
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 复制 pnpm deploy 产出的完整 node_modules（扁平化 + 无 symlink 问题）
COPY --from=deps /tmp/server-prod/node_modules ./node_modules

# 复制编译产物
COPY --from=builder /app/packages/server/dist ./dist
# banks.json 在源码中通过 readFileSync 加载（非 import），tsc 不会自动复制
COPY --from=builder /app/packages/server/src/banks.json ./dist/banks.json
RUN mkdir -p /app/dist/db
COPY --from=builder /app/packages/server/src/db/schema.mysql.sql ./dist/db/
COPY --from=builder /app/packages/shared/dist ./shared

# pnpm deploy 将 @robot-race/shared 作为 file: 依赖打包进了 .pnpm store
# 但它只复制了源码（package.json 中没有 dist/），我们需要把编译好的 dist 放回去
RUN SHARED_PNPM_DIR=$(readlink -f node_modules/@robot-race/shared 2>/dev/null) && \
    if [ -n "$SHARED_PNPM_DIR" ] && [ -d /app/shared ]; then \
      cp -r /app/shared/* "$SHARED_PNPM_DIR/"; \
    fi

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "dist/server.js"]
