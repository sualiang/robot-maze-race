-- ============================================
-- 铁甲快狗 (robot-maze-race) - 运营商独立库 Schema
-- 每个运营商独立数据库: robot_maze_race_{db_name}
-- ============================================

-- ==================== 辅助: 安全创建索引 (MySQL 8.0 不支持 CREATE INDEX IF NOT EXISTS) ====================
DROP PROCEDURE IF EXISTS create_index_if_not_exists;
DELIMITER $$
CREATE PROCEDURE create_index_if_not_exists(IN idx_name VARCHAR(128), IN tbl_name VARCHAR(128), IN columns_def TEXT)
BEGIN
  DECLARE idx_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO idx_exists FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl_name AND INDEX_NAME = idx_name;
  IF idx_exists = 0 THEN
    SET @_sql = CONCAT('CREATE INDEX ', idx_name, ' ON ', tbl_name, ' (', columns_def, ')');
    PREPARE stmt FROM @_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ==================== 赛场表 ====================
CREATE TABLE IF NOT EXISTS venues (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  name VARCHAR(128) NOT NULL,
  address VARCHAR(512),
  latitude DOUBLE,
  longitude DOUBLE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  qrcode_url VARCHAR(512),
  checkin_radius_meters INT DEFAULT 100,
  max_queue_size INT DEFAULT 50,
  timeout_seconds INT DEFAULT 300,
  open_time VARCHAR(20) DEFAULT '09:00:00',
  close_time VARCHAR(20) DEFAULT '21:00:00',
  city VARCHAR(64) DEFAULT '',
  district VARCHAR(64) DEFAULT '',
  description TEXT,
  profit_share_rate DOUBLE DEFAULT 0,
  maze_config TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_venues_status', 'venues', 'status');

-- ==================== 裁判表 ====================
CREATE TABLE IF NOT EXISTS referees (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  user_id VARCHAR(36) NOT NULL,
  cert_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  status VARCHAR(16) DEFAULT 'approved' COMMENT 'pending/approved/rejected',
  venue_id VARCHAR(36),
  phone VARCHAR(20),
  id_number VARCHAR(18),
  id_card_front VARCHAR(512),
  id_card_back VARCHAR(512),
  name VARCHAR(100),
  cert_image VARCHAR(512),
  apply_remark VARCHAR(255) DEFAULT '' COMMENT '申请备注',
  review_remark VARCHAR(255) DEFAULT '' COMMENT '审核备注',
  reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间',
  reviewed_by VARCHAR(64) DEFAULT '' COMMENT '审核人',
  gps_lat DOUBLE,
  gps_lng DOUBLE,
  last_checkin_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_referees_user', 'referees', 'user_id');
CALL create_index_if_not_exists('idx_referees_venue', 'referees', 'venue_id');
CALL create_index_if_not_exists('idx_referees_cert', 'referees', 'cert_status');
CALL create_index_if_not_exists('idx_referees_status', 'referees', 'status');

-- ==================== 参赛包表 ====================
CREATE TABLE IF NOT EXISTS race_packages (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  name VARCHAR(128) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  standard_price_cents INT DEFAULT 0,
  discount_price_cents INT DEFAULT 0,
  race_count INT NOT NULL DEFAULT 1,
  valid_days INT DEFAULT 365,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  sort_order INT DEFAULT 0,
  coupon_reward_min_cents INT DEFAULT 0,
  coupon_reward_max_cents INT DEFAULT 0,
  free_deduction_cents INT NOT NULL DEFAULT 0,
  growth_value INT DEFAULT 0,
  point_value INT DEFAULT 0,
  season_id INT,
  tag VARCHAR(64) DEFAULT '',
  special_rights TEXT,
  is_active INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_race_packages_status', 'race_packages', 'status');

-- ==================== 参赛包关联优惠券 ====================
CREATE TABLE IF NOT EXISTS race_package_coupons (
  id VARCHAR(36) PRIMARY KEY,
  package_id VARCHAR(36) NOT NULL,
  coupon_id VARCHAR(36) NOT NULL,
  denomination_cents INT NOT NULL DEFAULT 0,
  coupon_type INT NOT NULL DEFAULT 1,
  merchant_name VARCHAR(128) DEFAULT '',
  coupon_name VARCHAR(128) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_rpc_package_id', 'race_package_coupons', 'package_id');
CALL create_index_if_not_exists('idx_rpc_coupon_id', 'race_package_coupons', 'coupon_id');

-- ==================== 订单表 ====================
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) PRIMARY KEY,
  order_no VARCHAR(64) UNIQUE NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  package_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL,
  discount_cents INT DEFAULT 0,
  coupon_multiplier INT DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(20),
  prepay_id VARCHAR(64),
  transaction_id VARCHAR(64),
  refund_id VARCHAR(64),
  refund_amount INT DEFAULT 0,
  payment_remark VARCHAR(512),
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  remaining_times INT DEFAULT 0,
  remaining_growth INT DEFAULT 0,
  points_deduction_cents INT NOT NULL DEFAULT 0,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_orders_user', 'orders', 'user_id');
CALL create_index_if_not_exists('idx_orders_no', 'orders', 'order_no');
CALL create_index_if_not_exists('idx_orders_status', 'orders', 'status');

-- ==================== 支付流水表 ====================
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  operator_id VARCHAR(36),
  user_id VARCHAR(36),
  transaction_id VARCHAR(128),
  amount_cents INT NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  raw_data TEXT,
  paid_at DATETIME,
  pay_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_payments_order', 'payments', 'order_id');
CALL create_index_if_not_exists('idx_payments_transaction', 'payments', 'transaction_id');

-- ==================== 签到记录表 ====================
CREATE TABLE IF NOT EXISTS checkins (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  venue_id VARCHAR(36) NOT NULL,
  package_id VARCHAR(36),
  queue_number INT,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  called_at DATETIME,
  race_started_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_checkins_user', 'checkins', 'user_id');
CALL create_index_if_not_exists('idx_checkins_venue', 'checkins', 'venue_id');
CALL create_index_if_not_exists('idx_checkins_venue_queue', 'checkins', 'venue_id, queue_number');
CALL create_index_if_not_exists('idx_checkins_status', 'checkins', 'status');

-- ==================== 比赛成绩表 ====================
CREATE TABLE IF NOT EXISTS race_results (
  id VARCHAR(36) PRIMARY KEY,
  checkin_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  venue_id VARCHAR(36) NOT NULL,
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  referee_id VARCHAR(36),
  score_ms INT,
  `rank` INT,
  status VARCHAR(20) NOT NULL DEFAULT 'racing',
  fault_reason TEXT,
  race_type INT NOT NULL DEFAULT 1,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_race_results_user', 'race_results', 'user_id');
CALL create_index_if_not_exists('idx_race_results_venue', 'race_results', 'venue_id');
CALL create_index_if_not_exists('idx_race_results_score', 'race_results', 'score_ms');
CALL create_index_if_not_exists('idx_race_results_created', 'race_results', 'created_at');

-- ==================== 考勤记录表 ====================
CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(36) PRIMARY KEY,
  referee_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  venue_id VARCHAR(36) NOT NULL,
  checkin_at DATETIME NOT NULL,
  checkout_at DATETIME,
  gps_lat DOUBLE,
  gps_lng DOUBLE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_attendance_referee', 'attendance', 'referee_id');
CALL create_index_if_not_exists('idx_attendance_venue', 'attendance', 'venue_id');
CALL create_index_if_not_exists('idx_attendance_date', 'attendance', 'checkin_at');
CALL create_index_if_not_exists('idx_attendance_user', 'attendance', 'user_id');

-- ==================== 结算记录表 ====================
CREATE TABLE IF NOT EXISTS settlements (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL,
  commission_cents INT NOT NULL,
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  points_deduction_cents INT NOT NULL DEFAULT 0,
  settled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_settlements_status', 'settlements', 'status');

-- ==================== 营销配置表 ====================
CREATE TABLE IF NOT EXISTS marketing_config (
  id VARCHAR(36) PRIMARY KEY,
  venue_id VARCHAR(36),
  `key` VARCHAR(64) NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(venue_id, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 运营商会话表 ====================
CREATE TABLE IF NOT EXISTS operator_sessions (
  id VARCHAR(36) PRIMARY KEY,
  member_id VARCHAR(36),
  member_name VARCHAR(64),
  token VARCHAR(512),
  created_at DATETIME,
  expires_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 比赛表 ====================
CREATE TABLE IF NOT EXISTS races (
  id VARCHAR(36) PRIMARY KEY,
  venue_id VARCHAR(36),
  name VARCHAR(256),
  status VARCHAR(20) DEFAULT 'draft',
  max_participants INT,
  entry_fee INT,
  start_time DATETIME,
  end_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 比赛记录表 ====================
CREATE TABLE IF NOT EXISTS race_records (
  id VARCHAR(36) PRIMARY KEY,
  race_id VARCHAR(36),
  player_id VARCHAR(36),
  score DOUBLE,
  duration_seconds INT,
  status VARCHAR(20),
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 比赛签到表 ====================
CREATE TABLE IF NOT EXISTS race_attendance (
  id VARCHAR(36) PRIMARY KEY,
  race_id VARCHAR(36),
  player_id VARCHAR(36),
  check_in_at DATETIME,
  status VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 票券兑换表 ====================
CREATE TABLE IF NOT EXISTS ticket_redemptions (
  id VARCHAR(36) PRIMARY KEY,
  ticket_id VARCHAR(36),
  player_id VARCHAR(36),
  redeemed_at DATETIME,
  reward VARCHAR(256),
  status VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 商家优惠券模板表 ====================
CREATE TABLE IF NOT EXISTS merchant_coupons (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  merchant_id VARCHAR(36) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  denomination_cents INT NOT NULL DEFAULT 0,
  min_consume_cents INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  remain_count INT NOT NULL DEFAULT 0,
  valid_start DATETIME,
  valid_end DATETIME,
  status INT NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  audit_status INT NOT NULL DEFAULT 0,
  audit_remark TEXT,
  audit_time DATETIME,
  auditor_id VARCHAR(36),
  version INT DEFAULT 1,
  put_channels TEXT,
  coupon_type INT NOT NULL DEFAULT 1,
  discount_percent INT DEFAULT 0,
  max_per_user INT NOT NULL DEFAULT 1,
  available_start DATETIME,
  available_end DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_merchant_coupons_merchant', 'merchant_coupons', 'merchant_id');

-- ==================== 用户优惠券表 ====================
CREATE TABLE IF NOT EXISTS user_coupons (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  coupon_id VARCHAR(36) NOT NULL,
  merchant_id VARCHAR(36) NOT NULL,
  name VARCHAR(128) DEFAULT '',
  description TEXT,
  denomination_cents INT NOT NULL DEFAULT 0,
  min_consume_cents INT NOT NULL DEFAULT 0,
  status INT NOT NULL DEFAULT 1,
  used_at DATETIME,
  valid_start DATETIME,
  valid_end DATETIME,
  coupon_type INT DEFAULT 1,
  discount_percent INT DEFAULT 0,
  extra_data TEXT,
  verify_code VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_user_coupons_user', 'user_coupons', 'user_id');
CALL create_index_if_not_exists('idx_user_coupons_status', 'user_coupons', 'status');

-- ==================== 商家表 ====================
CREATE TABLE IF NOT EXISTS merchants (
  id VARCHAR(36) PRIMARY KEY,
  merchant_name VARCHAR(128) NOT NULL,
  merchant_address VARCHAR(512) DEFAULT '',
  longitude DOUBLE DEFAULT 0,
  latitude DOUBLE DEFAULT 0,
  contact_phone VARCHAR(20) DEFAULT '',
  logo_url VARCHAR(512) DEFAULT '',
  status INT NOT NULL DEFAULT 1,
  region VARCHAR(64) DEFAULT '',
  business_hours VARCHAR(128) DEFAULT '',
  description TEXT,
  qrcode_url VARCHAR(512) DEFAULT '',
  audit_status INT NOT NULL DEFAULT 0,
  audit_remark TEXT,
  audit_time DATETIME,
  auditor_id VARCHAR(36),
  contact_name VARCHAR(64) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_merchants_status', 'merchants', 'status');

-- ==================== 商家子账号表 ====================
CREATE TABLE IF NOT EXISTS merchant_admin (
  id VARCHAR(36) PRIMARY KEY,
  merchant_id VARCHAR(36) NOT NULL,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  phone VARCHAR(20) DEFAULT '',
  real_name VARCHAR(64) DEFAULT '',
  status INT NOT NULL DEFAULT 1,
  first_login INT NOT NULL DEFAULT 1,
  last_login_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_merchant_admin_username', 'merchant_admin', 'username');
CALL create_index_if_not_exists('idx_merchant_admin_merchant', 'merchant_admin', 'merchant_id');

-- ==================== 商家邀请码表 ====================
CREATE TABLE IF NOT EXISTS merchant_invite_codes (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  merchant_id VARCHAR(36) NOT NULL,
  used INT NOT NULL DEFAULT 0,
  used_by VARCHAR(36) DEFAULT '',
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_merchant_invite_codes_code', 'merchant_invite_codes', 'code');
CALL create_index_if_not_exists('idx_merchant_invite_codes_merchant', 'merchant_invite_codes', 'merchant_id');

-- ==================== 参赛抵扣金表 ====================
CREATE TABLE IF NOT EXISTS entry_deductions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  source VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  order_id VARCHAR(36),
  race_package_id VARCHAR(36),
  expires_at DATETIME,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CALL create_index_if_not_exists('idx_entry_deductions_user', 'entry_deductions', 'user_id');
CALL create_index_if_not_exists('idx_entry_deductions_status', 'entry_deductions', 'status');

-- ==================== 积分商城表 ====================
CREATE TABLE IF NOT EXISTS point_shop (
  id VARCHAR(36) PRIMARY KEY,
  item_type VARCHAR(32) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  image VARCHAR(512) DEFAULT NULL COMMENT '图片',
  stock INT NOT NULL DEFAULT 0 COMMENT '库存',
  need_points INT NOT NULL DEFAULT 0,
  sort_weight INT DEFAULT 0,
  status INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 积分兑换日志表 ====================
CREATE TABLE IF NOT EXISTS points_exchange_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  item_type VARCHAR(30) NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  spent_points INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_points_exchange_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 积分交易记录表（每运营商独立） ====================
CREATE TABLE IF NOT EXISTS points_transactions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  operator_id VARCHAR(36) NOT NULL DEFAULT '',
  points INT NOT NULL,
  type VARCHAR(32) NOT NULL,
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pt_user (user_id),
  INDEX idx_pt_operator (operator_id),
  INDEX idx_pt_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
