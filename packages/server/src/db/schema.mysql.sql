-- ============================================
-- 机器狗迷宫竞速赛事 - 数据库 Schema
-- MySQL 版本（从 SQLite 迁移）
-- ============================================

-- ==================== 用户表 ====================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  openid VARCHAR(128) UNIQUE NOT NULL,
  unionid VARCHAR(128),
  nickname VARCHAR(64),
  avatar_url VARCHAR(512),
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL DEFAULT 'player',
  race_count INT DEFAULT 0,
  total_race_time_ms INT DEFAULT 0,
  best_score_ms INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
-- -- CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
-- -- CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ==================== 赛场表 ====================
CREATE TABLE IF NOT EXISTS venues (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  address VARCHAR(512),
  latitude DOUBLE,
  longitude DOUBLE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  qrcode_url VARCHAR(512),
  checkin_radius_meters INT DEFAULT 100,
  max_queue_size INT DEFAULT 50,
  timeout_seconds INT DEFAULT 300,
  open_time VARCHAR(8) DEFAULT '09:00:00',
  close_time VARCHAR(8) DEFAULT '21:00:00',
  city VARCHAR(128) DEFAULT '',
  district VARCHAR(128) DEFAULT '',
   description TEXT,
  profit_share_rate DOUBLE DEFAULT 0,
  operator_id VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status);
-- -- CREATE INDEX IF NOT EXISTS idx_venues_operator ON venues(operator_id);

-- ==================== 裁判表 ====================
-- 修复：去除重复的 operator_id / created_at / updated_at 列
CREATE TABLE IF NOT EXISTS referees (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  cert_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  venue_id VARCHAR(36),
  phone VARCHAR(20),
  id_number VARCHAR(18),
  id_card_front VARCHAR(512),
  id_card_back VARCHAR(512),
  name VARCHAR(100),
  cert_image VARCHAR(512),
  gps_lat DOUBLE,
  gps_lng DOUBLE,
  last_checkin_at DATETIME,
  operator_id VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (venue_id) REFERENCES venues(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_referees_user ON referees(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_referees_venue ON referees(venue_id);
-- -- CREATE INDEX IF NOT EXISTS idx_referees_cert ON referees(cert_status);

-- ==================== 参赛包表 ====================
CREATE TABLE IF NOT EXISTS race_packages (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  operator_id VARCHAR(36),
  name VARCHAR(128) NOT NULL,
   description TEXT,
  price_cents INT NOT NULL,
  race_count INT NOT NULL DEFAULT 1,
  valid_days INT DEFAULT 365,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  sort_order INT DEFAULT 0,
  coupon_reward_min_cents INT DEFAULT 0,
  coupon_reward_max_cents INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_race_packages_status ON race_packages(status);

-- ==================== 订单表 ====================
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  order_no VARCHAR(64) UNIQUE NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  package_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL,
  discount_cents INT DEFAULT 0,
  coupon_multiplier INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(20),
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  operator_id VARCHAR(36),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (package_id) REFERENCES race_packages(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no);
-- -- CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ==================== 支付流水表 ====================
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  transaction_id VARCHAR(128),
  amount_cents INT NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  raw_data TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
-- -- CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);

-- ==================== 签到记录表 ====================
CREATE TABLE IF NOT EXISTS checkins (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  venue_id VARCHAR(36) NOT NULL,
  package_id VARCHAR(36),
  queue_number INT,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  called_at DATETIME,
  race_started_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (venue_id) REFERENCES venues(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_checkins_venue ON checkins(venue_id);
-- -- CREATE INDEX IF NOT EXISTS idx_checkins_venue_queue ON checkins(venue_id, queue_number);
-- -- CREATE INDEX IF NOT EXISTS idx_checkins_status ON checkins(status);

-- ==================== 比赛成绩表 ====================
CREATE TABLE IF NOT EXISTS race_results (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  checkin_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  venue_id VARCHAR(36) NOT NULL,
  referee_id VARCHAR(36),
  score_ms INT,
  `rank` INT,
  status VARCHAR(20) NOT NULL DEFAULT 'racing',
  fault_reason TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (checkin_id) REFERENCES checkins(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (venue_id) REFERENCES venues(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_race_results_user ON race_results(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_race_results_venue ON race_results(venue_id);
-- -- CREATE INDEX IF NOT EXISTS idx_race_results_score ON race_results(score_ms);
-- -- CREATE INDEX IF NOT EXISTS idx_race_results_created ON race_results(created_at);

-- ==================== 助力记录表 ====================
CREATE TABLE IF NOT EXISTS helps (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  initiator_id VARCHAR(36) NOT NULL,
  helper_id VARCHAR(36),
  status VARCHAR(20) NOT NULL DEFAULT 'initiated',
  target_package_id VARCHAR(36),
  required_help_count INT NOT NULL DEFAULT 5,
  current_help_count INT NOT NULL DEFAULT 0,
  helper_device_id VARCHAR(128),
  coupon_amount_cents INT DEFAULT 0,
  initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  helped_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (initiator_id) REFERENCES users(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_helps_initiator ON helps(initiator_id);
-- -- CREATE INDEX IF NOT EXISTS idx_helps_helper ON helps(helper_id);
-- -- CREATE INDEX IF NOT EXISTS idx_helps_status ON helps(status);

-- ==================== 考勤记录表 ====================
CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  referee_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  venue_id VARCHAR(36) NOT NULL,
  checkin_at DATETIME NOT NULL,
  checkout_at DATETIME,
  gps_lat DOUBLE,
  gps_lng DOUBLE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referee_id) REFERENCES referees(id),
  FOREIGN KEY (venue_id) REFERENCES venues(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_attendance_referee ON attendance(referee_id);
-- -- CREATE INDEX IF NOT EXISTS idx_attendance_venue ON attendance(venue_id);
-- -- CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(checkin_at);
-- -- CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);

-- ==================== 结算记录表 ====================
CREATE TABLE IF NOT EXISTS settlements (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  operator_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL,
  commission_cents INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_settlements_operator ON settlements(operator_id);
-- -- CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

-- ==================== 营销配置表 ====================
CREATE TABLE IF NOT EXISTS marketing_config (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  venue_id VARCHAR(36),
  `key` VARCHAR(64) NOT NULL,
  value TEXT NOT NULL,
   description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_venue_key (venue_id, `key`)
);

-- ==================== 系统配置表 ====================
CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  `key` VARCHAR(64) UNIQUE NOT NULL,
  value TEXT NOT NULL,
   description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 幂等键表 ====================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  `key` VARCHAR(128) UNIQUE NOT NULL,
  response TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(`key`);

-- ==================== 运营商表 ====================
CREATE TABLE IF NOT EXISTS operators (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(128),
  company_name VARCHAR(256),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  venue_count INT DEFAULT 0,
  total_revenue INT DEFAULT 0,
  profit_share_rate INT NOT NULL DEFAULT 80,
  bank_account VARCHAR(64),
  bank_name VARCHAR(128),
  contact_person VARCHAR(64),
  province VARCHAR(128) DEFAULT '',
  city VARCHAR(128) DEFAULT '',
  district VARCHAR(128) DEFAULT '',
 company_address TEXT,
  operator_username VARCHAR(256) DEFAULT '',
  operator_password_hash VARCHAR(256) DEFAULT '',
  contact_phone VARCHAR(20),
  scope VARCHAR(64),
  role VARCHAR(32) DEFAULT 'admin',
  password_change_required INT DEFAULT 1,
  first_login INT DEFAULT 1,
  created_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 系统设置表 ====================
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 默认分润比例
INSERT IGNORE INTO settings (`key`, value) VALUES ('default_profit_share_rate', '80');

-- ==================== 后台管理员角色表 ====================
CREATE TABLE IF NOT EXISTS admin_roles (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  label VARCHAR(128) NOT NULL,
 permissions TEXT NOT NULL,
  scope VARCHAR(32) NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 后台管理员账号表 ====================
CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  username VARCHAR(128) NOT NULL UNIQUE,
  password TEXT NOT NULL,
  nickname VARCHAR(64),
  email VARCHAR(128) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  role_id VARCHAR(36) NOT NULL,
  operator_id VARCHAR(36),
  first_login INT DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES admin_roles(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
-- -- CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role_id);
-- -- CREATE INDEX IF NOT EXISTS idx_admin_users_operator ON admin_users(operator_id);

-- ==================== 客户端日志表 ====================
CREATE TABLE IF NOT EXISTS client_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  level VARCHAR(16),
  message TEXT,
  source VARCHAR(128),
  detail TEXT,
  url VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 运营商成员表 ====================
CREATE TABLE IF NOT EXISTS operator_members (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  operator_id VARCHAR(36),
  name VARCHAR(128),
  phone VARCHAR(20),
  password_hash VARCHAR(256),
  role VARCHAR(32) DEFAULT 'member',
  status VARCHAR(20) DEFAULT 'active',
  first_login INT DEFAULT 1,
  created_at DATETIME,
  updated_at DATETIME
);

-- ==================== 运营商会话表 ====================
CREATE TABLE IF NOT EXISTS operator_sessions (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  operator_id VARCHAR(36),
  member_id VARCHAR(36),
  member_name VARCHAR(128),
  token VARCHAR(256),
  created_at DATETIME,
  expires_at DATETIME
);

-- ==================== 比赛表 ====================
-- 修复：去除重复的 operator_id / created_at / updated_at 列
CREATE TABLE IF NOT EXISTS races (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  venue_id VARCHAR(36),
  name VARCHAR(128),
  status VARCHAR(20) DEFAULT 'draft',
  max_participants INT,
  entry_fee INT,
  start_time DATETIME,
  end_time DATETIME,
  operator_id VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

-- ==================== 比赛记录表 ====================
-- 修复：去除重复的 operator_id / created_at / updated_at 列
CREATE TABLE IF NOT EXISTS race_records (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  race_id VARCHAR(36),
  player_id VARCHAR(36),
  score DOUBLE,
  duration_seconds INT,
  status VARCHAR(20),
  started_at DATETIME,
  finished_at DATETIME,
  operator_id VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 比赛签到表 ====================
-- 修复：去除重复的 operator_id / created_at / updated_at 列
CREATE TABLE IF NOT EXISTS race_attendance (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  race_id VARCHAR(36),
  player_id VARCHAR(36),
  check_in_time DATETIME,
  status VARCHAR(20),
  operator_id VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 用户票券表 ====================
-- 修复：去除重复的 operator_id / created_at / updated_at 列
CREATE TABLE IF NOT EXISTS user_tickets (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  player_id VARCHAR(36),
  ticket_type VARCHAR(32),
  status VARCHAR(20) DEFAULT 'unused',
  operator_id VARCHAR(36),
  created_at DATETIME,
  used_at DATETIME,
  expires_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 票券兑换表 ====================
CREATE TABLE IF NOT EXISTS ticket_redemptions (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  ticket_id VARCHAR(36),
  player_id VARCHAR(36),
  redeemed_at DATETIME,
  reward TEXT,
  status VARCHAR(20),
  operator_id VARCHAR(36)
);

-- ==================== 后台种子数据 ====================
-- 运营商角色（scope='operator'）
INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES
  ('op_super_admin', 'op_super_admin', '运营商超管', '["*"]', 'operator'),
  ('op_admin', 'op_admin', '运营', '["venues:read","venues:create","venues:edit","referees:read","referees:create","referees:edit","packages:read","packages:create","packages:edit","marketing:read","marketing:create","marketing:edit","players:read","dashboard:read"]', 'operator'),
  ('op_finance', 'op_finance', '财务', '["finance:read","finance:withdraw","finance:history","dashboard:read"]', 'operator');

-- 总部角色（scope='admin'）
INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES
  ('role-super-admin', 'super_admin', '超级管理员', '["*"]', 'admin'),
  ('role-admin', 'admin', '总管理员', '["operators:read","operators:list","dashboard:read","dashboard:list","marketing:read","finance:read","finance:withdraw","finance:history"]', 'admin'),
  ('role-ops-admin', 'ops_admin', '运营管理员', '["operators:read","operators:create","operators:edit","dashboard:read","dashboard:list"]', 'admin'),
  ('role-finance-admin', 'finance_admin', '财务管理员', '["finance:read","finance:withdraw","finance:history"]', 'admin');

-- admin 用户（first_login = 0，不需要首次改密码）
INSERT IGNORE INTO admin_users (id, username, password, nickname, role_id, first_login) VALUES
  ('admin-default', 'admin', '$2b$10$wK8TStP.p630Kkp3nZjHDemm2pf9FkBiJ/uIdHN3TMs/xDRIyGFLC', '超级管理员', 'role-super-admin', 0);


-- ============================================
-- 铁甲快狗 V2.0 — 新增表结构（已合并到此文件）
-- ============================================

-- ==================== 赛季表 ====================
CREATE TABLE IF NOT EXISTS seasons (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  start_time DATETIME,
  end_time DATETIME,
  status INT NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 赛季用户信息表 ====================
CREATE TABLE IF NOT EXISTS season_user_info (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  season_id VARCHAR(36) NOT NULL,
  level INT NOT NULL DEFAULT 1,
  exp INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_season (user_id, season_id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_season_user_info_user ON season_user_info(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_season_user_info_season ON season_user_info(season_id);

-- ==================== 战斗力表 ====================
CREATE TABLE IF NOT EXISTS combat_power (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  total_power INT NOT NULL DEFAULT 0,
  dimension_1_name VARCHAR(64) DEFAULT '',
  dimension_1_score INT DEFAULT 0,
  dimension_2_name VARCHAR(64) DEFAULT '',
  dimension_2_score INT DEFAULT 0,
  dimension_3_name VARCHAR(64) DEFAULT '',
  dimension_3_score INT DEFAULT 0,
  dimension_4_name VARCHAR(64) DEFAULT '',
  dimension_4_score INT DEFAULT 0,
  dimension_5_name VARCHAR(64) DEFAULT '',
  dimension_5_score INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_combat_power_user (user_id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_combat_power_user ON combat_power(user_id);

-- ==================== 积分交易记录表 ====================
CREATE TABLE IF NOT EXISTS points_transactions (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  points INT NOT NULL,
  type VARCHAR(32) NOT NULL,
 remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_points_transactions_user ON points_transactions(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_points_transactions_created ON points_transactions(created_at);

-- ==================== 奖品表 ====================
CREATE TABLE IF NOT EXISTS lottery_prizes (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  image_url VARCHAR(512) DEFAULT '',
  prize_type INT NOT NULL DEFAULT 1,
  prize_value VARCHAR(256) DEFAULT '',
  total_count INT NOT NULL DEFAULT 0,
  remain_count INT NOT NULL DEFAULT 0,
  probability DOUBLE NOT NULL DEFAULT 0,
  weight INT NOT NULL DEFAULT 1,
  status INT NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_lottery_prizes_status ON lottery_prizes(status);

-- ==================== 抽奖记录表 ====================
CREATE TABLE IF NOT EXISTS lottery_records (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  prize_id VARCHAR(36),
  prize_name VARCHAR(128) DEFAULT '',
  points_cost INT NOT NULL DEFAULT 0,
  is_win INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_lottery_records_user ON lottery_records(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_lottery_records_created ON lottery_records(created_at);

-- ==================== 商家优惠券模板表 ====================
CREATE TABLE IF NOT EXISTS merchant_coupons (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  merchant_id VARCHAR(36) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  denomination_cents INT NOT NULL DEFAULT 0,
  min_consume_cents INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  remain_count INT NOT NULL DEFAULT 0,
  valid_start VARCHAR(32),
  valid_end VARCHAR(32),
  status INT NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  coupon_type INT NOT NULL DEFAULT 1,
  max_per_user INT NOT NULL DEFAULT 1,
  audit_status INT NOT NULL DEFAULT 0,
  discount_percent INT DEFAULT 0,
  offline_request INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  put_channels TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_merchant_coupons_merchant ON merchant_coupons(merchant_id);

-- 参赛包关联优惠券
CREATE TABLE IF NOT EXISTS race_package_coupons (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  package_id VARCHAR(36) NOT NULL,
  coupon_id VARCHAR(36) NOT NULL,
  denomination_cents INT NOT NULL DEFAULT 0,
  coupon_type INT NOT NULL DEFAULT 1,
  merchant_name VARCHAR(128) DEFAULT '',
  discount_percent INT DEFAULT 0,
  coupon_name VARCHAR(128) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (package_id) REFERENCES race_packages(id),
  FOREIGN KEY (coupon_id) REFERENCES merchant_coupons(id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_rpc_package_id ON race_package_coupons(package_id);
-- -- CREATE INDEX IF NOT EXISTS idx_rpc_coupon_id ON race_package_coupons(coupon_id);

-- ==================== 用户优惠券表 ====================
CREATE TABLE IF NOT EXISTS user_coupons (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  coupon_id VARCHAR(36) NOT NULL,
  merchant_id VARCHAR(36) NOT NULL,
  name VARCHAR(128) DEFAULT '',
  description TEXT,
  denomination_cents INT NOT NULL DEFAULT 0,
  min_consume_cents INT NOT NULL DEFAULT 0,
  status INT NOT NULL DEFAULT 1,
  used_at DATETIME,
  valid_start VARCHAR(32),
  valid_end VARCHAR(32),
  coupon_type INT NOT NULL DEFAULT 1,
  verify_code VARCHAR(64) DEFAULT '',
  used INT NOT NULL DEFAULT 0,
  coupon_name VARCHAR(128) DEFAULT '',
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_user_coupons_status ON user_coupons(status);

-- ==================== 任务模板表 ====================
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  task_type VARCHAR(32) NOT NULL DEFAULT '',
 target_value TEXT,
  reward_type VARCHAR(32) NOT NULL DEFAULT '',
  reward_value INT NOT NULL DEFAULT 0,
  status INT NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ==================== 用户任务进度表 ====================
CREATE TABLE IF NOT EXISTS user_tasks (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
 progress_value TEXT,
  status INT NOT NULL DEFAULT 0,
  rewarded_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_task (user_id, task_id)
);
-- -- CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_user_tasks_status ON user_tasks(status);

-- ==================== 商家表 ====================
CREATE TABLE IF NOT EXISTS merchants (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  merchant_name VARCHAR(128) DEFAULT '',
  merchant_address VARCHAR(512) DEFAULT '',
  longitude DOUBLE DEFAULT 0,
  latitude DOUBLE DEFAULT 0,
  contact_phone VARCHAR(20) DEFAULT '',
  logo_url VARCHAR(512) DEFAULT '',
  status INT NOT NULL DEFAULT 1,
  name VARCHAR(128) DEFAULT '',
  address VARCHAR(512) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  qrcode_url VARCHAR(512) DEFAULT '',
  region VARCHAR(128) DEFAULT '',
  business_hours VARCHAR(256) DEFAULT '',
  audit_status INT DEFAULT 0,
  operator_id VARCHAR(36) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);

-- ==================== 参赛抵扣金表 ====================
CREATE TABLE IF NOT EXISTS entry_deductions (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
 source TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  order_id VARCHAR(36),
  race_package_id VARCHAR(36),
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME
);
-- -- CREATE INDEX IF NOT EXISTS idx_entry_deductions_user ON entry_deductions(user_id);
-- -- CREATE INDEX IF NOT EXISTS idx_entry_deductions_status ON entry_deductions(status);

-- ==================== V2.0 商家端追加表 ====================
CREATE TABLE IF NOT EXISTS merchant_admin (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  merchant_id VARCHAR(36) NOT NULL,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(256) NOT NULL,
  phone VARCHAR(20) DEFAULT '',
  first_login INT NOT NULL DEFAULT 1,
  real_name VARCHAR(64) DEFAULT '',
  status INT NOT NULL DEFAULT 1,
  last_login_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 优惠券核销日志表 ====================
CREATE TABLE IF NOT EXISTS coupon_verify_log (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  user_coupon_id VARCHAR(36) NOT NULL,
  merchant_id VARCHAR(36) NOT NULL,
  verifier_id VARCHAR(36) NOT NULL,
  verifier_name VARCHAR(64) DEFAULT '',
  user_id VARCHAR(36) NOT NULL,
  coupon_name VARCHAR(256) DEFAULT '',
  denomination_cents INT DEFAULT 0,
  verify_type INT NOT NULL DEFAULT 1,
  verify_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_verify_log_merchant ON coupon_verify_log(merchant_id);
-- -- CREATE INDEX IF NOT EXISTS idx_verify_log_user ON coupon_verify_log(user_id);

-- ==================== 邀请码表 ====================
CREATE TABLE IF NOT EXISTS merchant_invite_codes (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  merchant_id VARCHAR(36) NOT NULL,
  used INT NOT NULL DEFAULT 0,
  used_by VARCHAR(36),
  created_by VARCHAR(36) DEFAULT '',
  operator_id VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME
);
-- -- CREATE INDEX IF NOT EXISTS idx_invite_code ON merchant_invite_codes(code);

-- ==================== 积分商城 ====================
CREATE TABLE IF NOT EXISTS point_shop (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id VARCHAR(36),
  name TEXT NOT NULL,
  description TEXT,
  need_points INT NOT NULL,
  exchange_limit INT DEFAULT 0,
  sort_weight INT DEFAULT 0,
  status INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 助力者关系表 ====================
CREATE TABLE IF NOT EXISTS help_helpers (
  id VARCHAR(36) DEFAULT (UUID()) PRIMARY KEY,
  help_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  device_id VARCHAR(128),
  helped_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- -- CREATE INDEX IF NOT EXISTS idx_help_helpers_help ON help_helpers(help_id);
-- -- CREATE INDEX IF NOT EXISTS idx_help_helpers_user ON help_helpers(user_id);
