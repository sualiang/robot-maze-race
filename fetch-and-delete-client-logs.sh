#!/bin/bash
# 轮询 client_logs 表获取最新错误 + 自动删除
# 注意：后端使用 better-sqlite3 WAL 模式，每次查询前必须 checkpoint
DB="/Users/longshe/.openclaw/workspace/robot-maze-race/packages/server/data/robot-maze-race.db"

# checkpoint WAL 确保读到最新数据
checkpoint() {
  sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null
}

# 确保表存在
checkpoint
sqlite3 "$DB" "CREATE TABLE IF NOT EXISTS client_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  source TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  url TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);" 2>/dev/null

checkpoint
LAST_ID=$(sqlite3 "$DB" "SELECT COALESCE(MAX(id), 0) FROM client_logs;")
echo "📡 前端错误实时轮询 — 最新 ID: $LAST_ID"
echo "────────────────────────────────────────"

while true; do
  checkpoint
  NEW=$(sqlite3 -separator " | " "$DB" "
    SELECT id, level, substr(message, 1, 300), url, created_at
    FROM client_logs WHERE id > $LAST_ID ORDER BY id ASC;
  ")

  if [ -n "$NEW" ]; then
    echo ""
    echo "⚠️  [$(date '+%H:%M:%S')] 前端报错:"
    echo "$NEW" | while IFS= read -r line; do
      echo "  → $line"
    done

    # 更新最新ID并删除已读
    LAST_ID=$(sqlite3 "$DB" "SELECT MAX(id) FROM client_logs;")
    checkpoint
    sqlite3 "$DB" "DELETE FROM client_logs WHERE id <= $LAST_ID;"
  fi

  sleep 2
done
