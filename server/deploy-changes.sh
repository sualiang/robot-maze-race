#!/bin/bash
# Deploy the 5 backend changes to the production server
# Usage: ./deploy-changes.sh [ssh-host]
# Default SSH host: root@172.27.0.13

SSH_HOST="${1:-root@172.27.0.13}"
DIST_DIR="/opt/robot-maze-race-server/dist"
SRC_DIR="/Users/longshe/.openclaw/workspace/robot-maze-race/packages/server/dist"

echo "=== Deploying 铁甲快狗 backend changes ==="

# Files to upload
FILES=(
  "routes/season.js"
  "routes/auth.js" 
  "routes/player.js"
  "routes/points-shop.js"
  "routes/points-shop.js.map"
  "index.js"
  "index.js.map"
  "config/database.js"
  "config/database.js.map"
)

for f in "${FILES[@]}"; do
  echo "Uploading $f..."
  scp "$SRC_DIR/$f" "$SSH_HOST:$DIST_DIR/$f"
  if [ $? -ne 0 ]; then
    echo "FAILED: $f"
    exit 1
  fi
done

# Run database migration (update system_config values)
echo "=== Updating system_config values ==="
ssh "$SSH_HOST" "sqlite3 /opt/robot-maze-race-server/data/robot-maze-race.db \"
  UPDATE system_config SET value = '80' WHERE key = 'season_reward_level_2_points' AND value != '80';
  UPDATE system_config SET value = '150' WHERE key = 'season_reward_level_3_points' AND value != '150';
  UPDATE system_config SET value = '300' WHERE key = 'season_reward_level_4_points' AND value != '300';
  UPDATE system_config SET value = '500' WHERE key = 'season_reward_level_5_points' AND value != '500';
  INSERT OR IGNORE INTO system_config (id, key, value, description)
    VALUES (lower(hex(randomblob(16))), 'register_deduction_cents', '1000', '新用户注册赠送参赛抵扣金金额（分，0=关闭）');
\""

echo "=== Restarting server ==="
ssh "$SSH_HOST" "pm2 restart robot-maze-race-server"

echo "=== Checking logs ==="
sleep 2
ssh "$SSH_HOST" "pm2 logs robot-maze-race-server --lines 5"

echo "=== Done! ==="
