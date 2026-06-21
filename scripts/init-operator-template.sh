#!/bin/bash
# ============================================================
# 运营商初始模板配置脚本
# ============================================================
# 用法: bash scripts/init-operator-template.sh
# 在运营商注册或创建时调用，初始化 system_config + race_packages 预制参赛包
#
# 注意：该脚本在应用启动时通过 database.ts 中的 initSchema() 自动执行，
# 也可以在 pm2 重启后手动运行一次以创建或补充缺失的配置。
# ============================================================

DB_PATH="${SQLITE_PATH:-packages/server/data/robot-maze-race.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "❌ 数据库文件不存在: $DB_PATH"
  echo "   请先启动应用（pm2 start）生成数据库文件后再运行此脚本。"
  exit 1
fi

echo "✅ 数据库文件: $DB_PATH"

# ============================================================
# 1. 全局 system_config 配置
# ============================================================
echo ""
echo "===== 1. 写入全局 system_config ====="

function upsert_config() {
  local key="$1"
  local value="$2"
  local desc="$3"
  local existing
  existing=$(sqlite3 "$DB_PATH" "SELECT id FROM system_config WHERE key='$key';")
  if [ -z "$existing" ]; then
    local id
    id=$(python3 -c "import uuid; print(uuid.uuid4())")
    sqlite3 "$DB_PATH" "INSERT INTO system_config (id, key, value, description) VALUES ('$id', '$key', '$value', '$desc');"
    echo "   [新增] $key = $value"
  else
    echo "   [已存在] $key = $(sqlite3 "$DB_PATH" "SELECT value FROM system_config WHERE key='$key';")"
  fi
}

upsert_config "season_default_days" "30" "赛季默认天数"
upsert_config "coupon_base_price_type" "discount_price" "优惠券基价类型(standard_price/discount_price)"
upsert_config "growth_base_rule" "discount_price" "成长值计算基准(standard_price/discount_price)"
upsert_config "point_base_rule" "discount_price" "积分计算基准(standard_price/discount_price)"
upsert_config "point_rate" "2.0" "积分倍率(元:分)"
upsert_config "coupon_overdue_remind" "3" "优惠券过期前提醒天数"
upsert_config "refund_coupon_return" "false" "退款是否回收优惠券（暂不启用）"

# ============================================================
# 2. 段位经验阈值（升段配置）
# ============================================================
echo ""
echo "===== 2. 段位经验阈值 ====="

upsert_config "season_level_exp_1" "0" "青铜选手（Lv1）所需经验"
upsert_config "season_level_exp_2" "100" "白银选手（Lv2）所需经验"
upsert_config "season_level_exp_3" "300" "黄金选手（Lv3）所需经验"
upsert_config "season_level_exp_4" "700" "铂金选手（Lv4）所需经验"
upsert_config "season_level_exp_5" "1500" "钻石选手（Lv5）所需经验"
upsert_config "season_level_exp_6" "3000" "最强王者（Lv6）所需经验"

# ============================================================
# 3. 升段奖励
# ============================================================
echo ""
echo "===== 3. 升段奖励（单位：分，1元=100分）======"

upsert_config "season_reward_level_2_coupon_cents" "800" "升Lv2奖励8元参赛抵价券"
upsert_config "season_reward_level_3_coupon_cents" "1500" "升Lv3奖励15元参赛抵价券"
upsert_config "season_reward_level_4_coupon_cents" "2500" "升Lv4奖励25元参赛抵价券"
upsert_config "season_reward_level_5_coupon_cents" "4000" "升Lv5奖励40元参赛抵价券"
upsert_config "season_reward_level_6_coupon_cents" "6000" "升Lv6奖励60元参赛抵价券"

# ============================================================
# 4. 预制参赛包（默认三档）
# ============================================================
echo ""
echo "===== 4. 预制参赛包 ====="

function upsert_package() {
  local id="$1"
  local name="$2"
  local tag="$3"
  local standard_price="$4"
  local discount_price="$5"
  local game_times="$6"
  local growth_value="$7"
  local point_value="$8"
  local special_rights="$9"
  local desc="${10}"

  local existing
  existing=$(sqlite3 "$DB_PATH" "SELECT id FROM race_packages WHERE id='$id';")
  if [ -z "$existing" ]; then
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    sqlite3 "$DB_PATH" "INSERT INTO race_packages (id, operator_id, name, description, price_cents, standard_price_cents, discount_price_cents, tag, special_rights, growth_value, point_value, race_count, valid_days, status, sort_order, free_deduction_cents, created_at, updated_at) VALUES ('$id', 'system', '$name', '$desc', $discount_price, $standard_price, $discount_price, '$tag', '$special_rights', $growth_value, $point_value, $game_times, 365, 'active', 0, 0, '$now', '$now');"
    echo "   [新增] ${name} (${tag}) — ${discount_price}分 / ${game_times}次"
  else
    echo "   [已存在] ${name} (${tag})"
  fi
}

# basic: 新人尝鲜
upsert_package \
  "basic" \
  "新人尝鲜包" \
  "新人尝鲜" \
  8800 6800 4 68 136 \
  "" \
  "适合初次体验的新手玩家，低门槛参赛"

# standard: 性价比首选
upsert_package \
  "standard" \
  "标准畅玩包" \
  "性价比首选" \
  19800 16800 12 168 336 \
  "" \
  "满足日常畅玩需求，性价比最高的选择"

# pro: 赛季畅玩
upsert_package \
  "pro" \
  "赛季畅玩包" \
  "赛季畅玩" \
  42800 36800 30 368 736 \
  "赛季决赛直通资格 × 1" \
  "全赛季畅玩，附赠决赛直通资格"

# ============================================================
# 5. 积分商城商品
# ============================================================
echo ""
echo "===== 5. 积分商城商品 ====="

function upsert_pointshop() {
  local id="$1"
  local item_type="$2"
  local item_id="$3"
  local name="$4"
  local desc="$5"
  local need_points="$6"

  local existing
  existing=$(sqlite3 "$DB_PATH" "SELECT id FROM point_shop WHERE id='$id';")
  if [ -z "$existing" ]; then
    sqlite3 "$DB_PATH" "INSERT INTO point_shop (id, item_type, item_id, name, description, need_points, sort_weight, status) VALUES ('$id', '$item_type', '$item_id', '$name', '$desc', $need_points, 0, 1);"
    echo "   [新增] ${name} — ${need_points}积分"
  else
    echo "   [已存在] ${name} — ${need_points}积分"
  fi
}

upsert_pointshop "point_5yuan"   "platform_coupon" "5"   "5元参赛抵扣卡"    "兑换后可在购买参赛包时抵扣5元报名费"    100
upsert_pointshop "point_10yuan"  "platform_coupon" "10"  "10元参赛抵扣卡"   "兑换后可在购买参赛包时抵扣10元报名费"   200
upsert_pointshop "point_20yuan"  "platform_coupon" "20"  "20元参赛抵扣卡"   "兑换后可在购买参赛包时抵扣20元报名费"   400
upsert_pointshop "point_50yuan"  "platform_coupon" "50"  "50元参赛抵扣卡"   "兑换后可在购买参赛包时抵扣50元报名费"   1000

echo ""
echo "===== ✅ 初始化完成 ====="
echo "如需重置，请删除数据库后重启应用："
echo "  rm $DB_PATH && pm2 restart all"
echo ""
