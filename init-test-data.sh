#!/bin/bash
# ============================================
# 测试数据初始化脚本
# 使用 curl 操作 API 插入测试数据
# ============================================

BASE_URL="http://localhost:3000"
NOPROXY="--noproxy localhost"

echo "============================================"
echo "1. 清空旧数据（但不毁表）"
echo "============================================"

# 使用 sqlite3 清空数据
DB_FILE="packages/server/data/robot-maze-race.db"

sqlite3 "$DB_FILE" << 'SQL'
DELETE FROM attendance;
DELETE FROM settlements;
DELETE FROM expand_coupons;
DELETE FROM helps;
DELETE FROM race_results;
DELETE FROM checkins;
DELETE FROM payments;
DELETE FROM orders;
DELETE FROM marketing_config;
DELETE FROM system_config;
DELETE FROM race_packages;
DELETE FROM referees;
DELETE FROM venues;
DELETE FROM operators;
DELETE FROM users;
VACUUM;
SQL

echo "旧数据已清空"

echo ""
echo "============================================"
echo "2. 插入系统配置（system_config）"
echo "============================================"

sqlite3 "$DB_FILE" << 'SQL'
INSERT INTO system_config (id, key, value, description) VALUES
  ('sys_001', 'mkt_share_title', '我和机器狗有个约会', '分享标题'),
  ('sys_002', 'mkt_share_desc', '快来机器狗迷宫竞速赛挑战一下吧！', '分享描述'),
  ('sys_003', 'mkt_invite_bonus_cents', '200', '邀请助力奖励积分(分)'),
  ('sys_004', 'mkt_welcome_bonus_cents', '500', '新用户欢迎积分(分)'),
  ('sys_005', 'mkt_expand_amount_cents', '1000', '膨胀券金额(分)'),
  ('sys_006', 'app_name', '机器狗迷宫竞速', '应用名称'),
  ('sys_007', 'app_version', '1.0.0', '应用版本'),
  ('sys_008', 'service_phone', '400-888-6666', '客服电话'),
  ('sys_009', 'commission_rate', '20', '平台抽成比例(%)');
SQL
echo "系统配置已插入"

echo ""
echo "============================================"
echo "3. 创建 Admin 用户"
echo "============================================"

# 先创建一个 admin 用户
sqlite3 "$DB_FILE" << 'SQL'
INSERT INTO users (id, openid, nickname, phone, role, created_at, updated_at)
VALUES ('admin_001', 'admin_openid', '系统管理员', '13800000001', 'admin', datetime('now'), datetime('now'));
SQL

echo "Admin 用户已创建 (id: admin_001)"

echo ""
echo "============================================"
echo "4. 创建运营商用户和运营商记录"
echo "============================================"

# 运营商的 users 记录
sqlite3 "$DB_FILE" << 'SQL'
INSERT INTO users (id, openid, nickname, phone, role, created_at, updated_at) VALUES
  ('op_001', 'op_openid_001', '极速科技运营', '13800000011', 'operator', datetime('now'), datetime('now')),
  ('op_002', 'op_openid_002', '未来智能运营', '13800000022', 'operator', datetime('now'), datetime('now')),
  ('op_003', 'op_openid_003', '灵动机械运营', '13800000033', 'operator', datetime('now'), datetime('now'));

-- 运营商记录
INSERT INTO operators (id, name, phone, email, company_name, status, venue_count, total_revenue, profit_share_rate, bank_account, bank_name, contact_person, created_at, updated_at) VALUES
  ('op_001', '极速科技有限公司', '13800000011', 'info@jisu.com', '极速科技有限公司', 'active', 2, 1500000, 80, '6222021234567890', '中国工商银行', '张三', datetime('now'), datetime('now')),
  ('op_002', '未来智能科技', '13800000022', 'info@weilai.com', '未来智能科技有限公司', 'active', 1, 980000, 75, '6222031234567890', '中国建设银行', '李四', datetime('now'), datetime('now')),
  ('op_003', '灵动机械有限公司', '13800000033', 'info@lingdong.com', '灵动机械有限公司', 'disabled', 0, 0, 85, '6222041234567890', '招商银行', '王五', datetime('now'), datetime('now'));
SQL
echo "运营商用户和记录已创建 (3个)"

echo ""
echo "============================================"
echo "5. 创建赛场"
echo "============================================"

sqlite3 "$DB_FILE" << 'SQL'
INSERT INTO venues (id, name, address, latitude, longitude, status, checkin_radius_meters, max_queue_size, timeout_seconds, open_time, close_time, description, operator_id, created_at, updated_at) VALUES
  ('ven_001', '极速科技·朝阳旗舰店', '北京市朝阳区建国路88号', 39.9087, 116.4597, 'open', 100, 50, 300, '09:00', '21:00', '位于北京CBD核心区域，场地面积500平米，设有专业迷宫赛道', 'op_001', datetime('now'), datetime('now')),
  ('ven_002', '极速科技·海淀店', '北京市海淀区中关村大街1号', 39.9852, 116.3059, 'open', 80, 30, 300, '10:00', '22:00', '高校聚集区，适合学生体验', 'op_001', datetime('now'), datetime('now')),
  ('ven_003', '未来智能·上海体验馆', '上海市浦东新区张江高科技园区', 31.2154, 121.5802, 'maintenance', 100, 40, 240, '09:00', '20:00', '位于张江核心区，交通便利', 'op_002', datetime('now'), datetime('now'));
SQL
echo "赛场已创建 (3个)"

echo ""
echo "============================================"
echo "6. 创建参赛包"
echo "============================================"

sqlite3 "$DB_FILE" << 'SQL'
INSERT INTO race_packages (id, name, description, price_cents, race_count, valid_days, status, sort_order, created_at, updated_at) VALUES
  ('pkg_001', '新手体验包', '含1次参赛机会，适合首次体验', 2900, 1, 30, 'active', 1, datetime('now'), datetime('now')),
  ('pkg_002', '入门畅玩包', '含3次参赛机会，性价比最优', 6900, 3, 90, 'active', 2, datetime('now'), datetime('now')),
  ('pkg_003', '进阶挑战包', '含10次参赛机会，挑战自我突破极限', 19900, 10, 180, 'active', 3, datetime('now'), datetime('now')),
  ('pkg_004', '无限次月卡', '30天内无限次参赛，尽情畅玩', 39900, 9999, 30, 'active', 4, datetime('now'), datetime('now')),
  ('pkg_005', '团队团建包', '含5次参赛机会，适合团队活动', 14900, 5, 60, 'inactive', 5, datetime('now'), datetime('now'));
SQL
echo "参赛包已创建 (5个)"

echo ""
echo "============================================"
echo "7. 创建演示考勤记录（通过 API）"
echo "============================================"

# 需要先创建裁判用户
sqlite3 "$DB_FILE" << 'SQL'
INSERT INTO users (id, openid, nickname, phone, role, created_at, updated_at) VALUES
  ('ref_001', 'ref_openid_001', '裁判甲', '13900000001', 'referee', datetime('now'), datetime('now')),
  ('ref_002', 'ref_openid_002', '裁判乙', '13900000002', 'referee', datetime('now'), datetime('now'));

INSERT INTO referees (id, user_id, cert_status, venue_id, phone, created_at, updated_at) VALUES
  ('ref_rec_001', 'ref_001', 'certified', 'ven_001', '13900000001', datetime('now'), datetime('now')),
  ('ref_rec_002', 'ref_002', 'pending', 'ven_002', '13900000002', datetime('now'), datetime('now'));

-- 考勤记录
INSERT INTO attendance (id, referee_id, user_id, venue_id, checkin_at, checkout_at, gps_lat, gps_lng, created_at) VALUES
  ('att_001', 'ref_rec_001', 'ref_001', 'ven_001', datetime('now', '-1 hour'), datetime('now', '-0.5 hour'), 39.9087, 116.4597, datetime('now')),
  ('att_002', 'ref_rec_002', 'ref_002', 'ven_002', datetime('now', '-2 hours'), NULL, 39.9852, 116.3059, datetime('now'));
SQL
echo "演示考勤记录已创建 (2条)"

# 创建订单和结算记录
sqlite3 "$DB_FILE" << 'SQL'
INSERT INTO orders (id, order_no, user_id, package_id, amount_cents, status, payment_method, paid_at, created_at, updated_at) VALUES
  ('ord_001', 'ORD202606051001', 'op_001', 'pkg_001', 2900, 'paid', 'wechat', datetime('now', '-1 day'), datetime('now', '-1 day'), datetime('now', '-1 day')),
  ('ord_002', 'ORD202606051002', 'op_001', 'pkg_002', 6900, 'paid', 'wechat', datetime('now', '-1 day'), datetime('now', '-1 day'), datetime('now', '-1 day')),
  ('ord_003', 'ORD202606051003', 'op_002', 'pkg_003', 19900, 'paid', 'alipay', datetime('now', '-2 hours'), datetime('now', '-2 hours'), datetime('now', '-2 hours'));

INSERT INTO settlements (id, order_id, operator_id, amount_cents, commission_cents, status, created_at, updated_at) VALUES
  ('set_001', 'ord_001', 'op_001', 2900, 580, 'settled', datetime('now', '-1 day'), datetime('now', '-1 day')),
  ('set_002', 'ord_002', 'op_001', 6900, 1380, 'pending', datetime('now', '-1 day'), datetime('now', '-1 day')),
  ('set_003', 'ord_003', 'op_002', 19900, 3980, 'pending', datetime('now', '-2 hours'), datetime('now', '-2 hours'));
SQL
echo "订单和结算记录已创建"

echo ""
echo "============================================"
echo "✅ 测试数据准备完成！"
echo "============================================"
