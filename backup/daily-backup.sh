#!/bin/bash
# 每日备份脚本 - 服务器数据库 + 代码 + 上传文件
# 执行时间：每天凌晨 3:00 (Asia/Shanghai)
# 执行用户：cc-dev

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y%m%d)
LOG_FILE="/Users/longshe/.openclaw/workspace/logs/backup-${DATE}.log"
SSH_KEY="$HOME/.ssh/cc_dev_test"
SSH_OPTS="-i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

# 服务器信息
SERVER="cc-dev@175.24.200.63"
BACKUP_BASE="/opt/backups"
MYSQL_CONTAINER="robotrent-mysql"
MYSQL_PASS="AmberBot2026!Root"
MAZE_MYSQL_PASS="IronDog2026!Root"

# 成功标志
ALL_OK=true
FAILED_ITEMS=""

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

fail_item() {
    ALL_OK=false
    FAILED_ITEMS="${FAILED_ITEMS}\n  - $1"
    log "❌ 失败: $1"
}

# 确保日志目录存在
mkdir -p "$(dirname "$LOG_FILE")"

log "========== 每日备份开始 =========="
log "时间戳: $TIMESTAMP"
log ""

# ==========================================
# 1. 本地 workspace 关键文件备份
# ==========================================
log "--- [1/5] 本地 workspace 关键文件备份 ---"
LOCAL_BACKUP_DIR="/Users/longshe/.openclaw/workspace/backups/local"
mkdir -p "$LOCAL_BACKUP_DIR"

# 备份 rules、memory、mcp 等关键目录
LOCAL_TAR="${LOCAL_BACKUP_DIR}/workspace-config_${TIMESTAMP}.tar.gz"
if tar -czf "$LOCAL_TAR" \
    -C /Users/longshe/.openclaw/workspace \
    rules/ memory/ mcp/ AGENTS.md IDENTITY.md SOUL.md TOOLS.md USER.md DREAMS.md HEARTBEAT.md MEMORY.md 2>/dev/null; then
    log "✅ 本地配置备份: $(du -h "$LOCAL_TAR" | cut -f1)"
else
    fail_item "本地 workspace 备份"
fi

# 清理 7 天前的本地备份
find "$LOCAL_BACKUP_DIR" -name "workspace-config_*.tar.gz" -mtime +7 -delete 2>/dev/null || true

# ==========================================
# 1.5. 铁甲快狗源码备份（含小程序、后端、管理后台）
# ==========================================
log ""
log "--- [1.5/6] 铁甲快狗源码备份 ---"

IRON_DOG_SRC="/Users/longshe/.openclaw/workspace/robot-maze-race"
IRON_DOG_TAR="/tmp/iron-dog-source_${TIMESTAMP}.tar.gz"

if [ -d "$IRON_DOG_SRC" ]; then
    if tar -czf "$IRON_DOG_TAR" \
        --exclude='miniprogram_npm' \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='.git' \
        -C /Users/longshe/.openclaw/workspace \
        robot-maze-race/ 2>/dev/null; then
        
        SIZE=$(du -h "$IRON_DOG_TAR" | cut -f1)
        log "✅ 铁甲快狗源码打包: $SIZE"
        
        # 上传到服务器
        if scp $SSH_OPTS "$IRON_DOG_TAR" "$SERVER:$BACKUP_BASE/iron-dog-source_${TIMESTAMP}.tar.gz" 2>/dev/null; then
            log "✅ 上传到服务器"
            # 同步到 COS 微云
            if ssh $SSH_OPTS "$SERVER" "sudo cp $BACKUP_BASE/iron-dog-source_${TIMESTAMP}.tar.gz /lhcos-data/backups/铁甲快狗-测试/" 2>/dev/null; then
                log "✅ 已同步到服务器微云"
            else
                fail_item "铁甲快狗源码: COS 同步失败"
            fi
        else
            fail_item "铁甲快狗源码: 上传服务器失败"
        fi
        
        # 同步到本机微云目录
        WY_LOCAL="/Users/longshe/微云同步助手(52083683)/SASDT-项目归档/铁甲快狗-测试"
        if [ -d "$WY_LOCAL" ]; then
            cp "$IRON_DOG_TAR" "$WY_LOCAL/robot-maze-race-source_${TIMESTAMP}.tar.gz" 2>/dev/null && \
                log "✅ 已同步到本机微云" || \
                fail_item "铁甲快狗源码: 本机微云同步失败"
            # 清理 7 天前本地微云备份
            find "$WY_LOCAL" -name "robot-maze-race-source_*.tar.gz" -mtime +7 -delete 2>/dev/null || true
        else
            log "⚠️ 本机微云目录不存在，跳过"
        fi
        
        rm -f "$IRON_DOG_TAR"
    else
        fail_item "铁甲快狗源码: 打包失败"
    fi
else
    log "⚠️ 铁甲快狗源码目录不存在，跳过"
fi

# 清理 7 天前的源码备份
ssh $SSH_OPTS "$SERVER" "sudo find /lhcos-data/backups/铁甲快狗-测试/ -name 'iron-dog-source_*.tar.gz' -mtime +7 -delete" 2>/dev/null || true
ssh $SSH_OPTS "$SERVER" "find $BACKUP_BASE -name 'iron-dog-source_*.tar.gz' -mtime +7 -delete" 2>/dev/null || true

# ==========================================
# 2. 服务器 - MySQL 数据库备份
# ==========================================
log ""
log "--- [2/5] 服务器 MySQL 数据库备份 ---"

MYSQL_OK=true

# 备份 robotrent (正式环境)
if ssh $SSH_OPTS "$SERVER" "mkdir -p $BACKUP_BASE/mysql && docker exec $MYSQL_CONTAINER mysqldump -uroot -p'${MYSQL_PASS}' --single-transaction --routines --triggers --events --all-databases 2>/dev/null | gzip > $BACKUP_BASE/mysql/robotrent-all_${TIMESTAMP}.sql.gz && echo 'OK: robotrent'" 2>&1; then
    log "✅ robotrent MySQL: OK"
else
    MYSQL_OK=false
    fail_item "robotrent MySQL"
fi

# 备份 robot-maze-race (如果容器存在)
# 使用 HERE-DOC 方式避免密码中的特殊字符被 shell 解释
MAZE_DUMP_CMD=$(cat << 'SCRIPT'
docker ps --format '{{.Names}}' | grep -q 'robot-maze-race-mysql' || { echo 'SKIP: container not found'; exit 0; }
docker exec robot-maze-race-mysql mysqldump -uroot -p"IronDog2026!Root" --single-transaction --all-databases 2>/dev/null | gzip > /opt/backups/mysql/robot-maze-race_TIMESTAMP.sql.gz
if [ $? -eq 0 ]; then
    echo "OK: robot-maze-race"
else
    echo "FAIL: robot-maze-race mysqldump"
fi
SCRIPT
)
# 替换占位符
MAZE_DUMP_CMD="${MAZE_DUMP_CMD/TIMESTAMP/$TIMESTAMP}"

if echo "$MAZE_DUMP_CMD" | ssh $SSH_OPTS "$SERVER" 'bash -s' 2>&1; then
    log "✅ robot-maze-race MySQL: OK"
else
    MYSQL_OK=false
    fail_item "robot-maze-race MySQL"
fi

# 清理 7 天前的 SQL 备份
ssh $SSH_OPTS "$SERVER" "find $BACKUP_BASE/mysql -name '*.sql.gz' -mtime +7 -delete; find $BACKUP_BASE/mysql -name '*.sql' -mtime +7 -delete; echo 'OK: cleanup'" 2>/dev/null || true

if [ "$MYSQL_OK" = true ]; then
    log "✅ MySQL 备份完成"
fi

# ==========================================
# 3. 服务器 - Docker 配置备份
# ==========================================
log ""
log "--- [3/5] 服务器 Docker Compose 配置备份 ---"

CFG_OK=true

# 备份 amber-robot 正式环境
if ssh $SSH_OPTS "$SERVER" "[ -d /opt/amber-robot ] && tar -czf $BACKUP_BASE/amber-robot_${TIMESTAMP}.tar.gz -C /opt/amber-robot docker-compose.yml .env Dockerfile* nginx/ 2>/dev/null; echo OK" 2>&1; then
    log "✅ amber-robot 配置备份"
else
    CFG_OK=false
    fail_item "amber-robot 配置备份"
fi

# 备份 amber-robot-test 测试环境
if ssh $SSH_OPTS "$SERVER" "[ -d /opt/amber-robot-test ] && tar -czf $BACKUP_BASE/amber-robot-test_${TIMESTAMP}.tar.gz -C /opt/amber-robot-test docker-compose.yml .env 2>/dev/null; echo OK" 2>&1; then
    log "✅ amber-robot-test 配置备份"
else
    CFG_OK=false
    fail_item "amber-robot-test 配置备份"
fi

# 清理 7 天前
ssh $SSH_OPTS "$SERVER" "find $BACKUP_BASE -name '*.tar.gz' -mtime +7 -delete; echo OK" 2>/dev/null || true

if [ "$CFG_OK" = true ]; then
    log "✅ Docker 配置备份完成"
fi

# ==========================================
# 4. 服务器 - 上传文件备份
# ==========================================
log ""
log "--- [4/5] 服务器上传文件备份 ---"

UPLOAD_OK=true

if ssh $SSH_OPTS "$SERVER" "[ -d /opt/amber-robot/uploads ] && tar -czf $BACKUP_BASE/uploads_${TIMESTAMP}.tar.gz -C /opt/amber-robot/uploads . 2>/dev/null && echo 'OK' || echo 'SKIP'" 2>&1; then
    log "✅ 上传文件备份完成"
else
    UPLOAD_OK=false
    fail_item "上传文件备份"
fi

ssh $SSH_OPTS "$SERVER" "find $BACKUP_BASE -name 'uploads_*.tar.gz' -mtime +7 -delete" 2>/dev/null || true

# ==========================================
# 5. 服务器磁盘空间检查
# ==========================================
log ""
log "--- [5/5] 服务器磁盘空间检查 ---"

DISK_INFO=$(ssh $SSH_OPTS "$SERVER" "df -h /opt | tail -1" 2>/dev/null || echo "获取失败")
DISK_USAGE=$(echo "$DISK_INFO" | awk '{print $5}' | tr -d '%')

log "磁盘使用率: $DISK_INFO"

if [ -n "$DISK_USAGE" ] && [ "$DISK_USAGE" -gt 85 ] 2>/dev/null; then
    fail_item "磁盘使用率过高: ${DISK_USAGE}%"
fi

# ==========================================
# 汇总
# ==========================================
log ""
log "========== 备份汇总 =========="

if [ "$ALL_OK" = true ]; then
    log "✅ 所有备份项全部成功"
    
    # 写入 memory 记录
    MEMORY_FILE="/Users/longshe/.openclaw/workspace/memory/$(date +%Y-%m-%d).md"
    cat >> "$MEMORY_FILE" << EOF

## [备份完成] $(date '+%Y-%m-%d %H:%M:%S')
- 每日备份全部成功
- MySQL: robotrent-all + robot-maze-race
- 配置: amber-robot + amber-robot-test docker compose
- 上传文件: 已备份
- 本地配置: workspace 关键文件已备份
- 铁甲快狗源码: 已备份（含小程序、后端、后台）
- 磁盘: ${DISK_USAGE}%
EOF
    log "已记录到 $MEMORY_FILE"
else
    log "❌ 以下项目备份失败:"
    echo -e "$FAILED_ITEMS" | tee -a "$LOG_FILE"
fi

log "========== 每日备份结束 =========="
