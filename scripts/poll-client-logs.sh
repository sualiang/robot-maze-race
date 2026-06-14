#!/bin/bash
# 轮询 client_logs 表，新错误自动打印
DB="/Users/longshe/.openclaw/workspace/robot-maze-race/packages/server/data/robot-maze-race.db"
LAST_ID=$(sqlite3 "$DB" "SELECT COALESCE(MAX(id), 0) FROM client_logs;")
echo "[$(date)] 开始轮询 client_logs，当前最新 ID: $LAST_ID"

while true; do
  NEW=$(sqlite3 -separator " | " "$DB" "SELECT id, level, substr(message, 1, 200), url, created_at FROM client_logs WHERE id > $LAST_ID ORDER BY id ASC;")
  if [ -n "$NEW" ]; then
    echo "[$(date)] ⚠️ 前端报错:"
    echo "$NEW" | while IFS= read -r line; do
      echo "  → $line"
    done
    # 更新最新的ID
    LAST_ID=$(sqlite3 "$DB" "SELECT MAX(id) FROM client_logs;")
  fi
  sleep 3
done
