#!/bin/bash
# ==========================================
# 机器狗迷宫竞速赛事系统 - 数据文件下载脚本
# ==========================================
# 下载省市区GeoJSON数据 + 银行数据
# 数据来源：GitHub Release 附件
# ==========================================
# 使用方法:
#   bash download-data.sh                    # 下载到 ./data/
#   bash download-data.sh /path/to/target    # 下载到指定目录
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:-$SCRIPT_DIR/packages/server/src}"

DATA_URL="https://github.com/sualiang/robot-maze-race/releases/download/v1.0.0-data/robot-maze-race-data.tar.gz"
CHECKSUM_URL="https://github.com/sualiang/robot-maze-race/releases/download/v1.0.0-data/checksums.sha256"

echo "=== 机器狗迷宫竞速赛事 - 数据文件下载 ==="
echo "目标目录: $TARGET_DIR"

# 创建目标目录
mkdir -p "$TARGET_DIR"

# 下载数据包
echo ""
echo ">>> 下载数据包（~8.7MB）..."
curl -#L -o /tmp/robot-maze-race-data.tar.gz "$DATA_URL"

# 校验（可选）
if curl -sL -o /tmp/checksums.sha256 "$CHECKSUM_URL" 2>/dev/null; then
  echo ">>> 校验文件..."
  (cd /tmp && sha256sum -c checksums.sha256 2>/dev/null || true)
else
  echo "（无校验文件，跳过校验）"
fi

# 解压
echo ""
echo ">>> 解压数据到 $TARGET_DIR ..."
tar -xzf /tmp/robot-maze-race-data.tar.gz -C "$TARGET_DIR"

# 清理
rm -f /tmp/robot-maze-race-data.tar.gz /tmp/checksums.sha256

echo ""
echo "=== 完成！==="
echo "解压文件:"
if [ -d "$TARGET_DIR/geojson_data" ]; then
  echo "  geojson_data/  — 市区GeoJSON数据"
  find "$TARGET_DIR/geojson_data" -type f | wc -l | xargs echo "    文件数:"
fi
if [ -f "$TARGET_DIR/banks.json" ]; then
  echo "  banks.json    — 银行数据"
  ls -lh "$TARGET_DIR/banks.json" | awk '{print "    大小:", $5}'
fi
