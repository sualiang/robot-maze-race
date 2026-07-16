-- ============================================
-- 铁甲快狗 (robot-maze-race) - 运营商独立库 Schema
-- 每个运营商独立数据库: robot_maze_race_{db_name}
-- ============================================

-- ==================== 赛场表 ====================
CREATE TABLE IF NOT EXISTS venues (
  id VARCHAR(36) PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status);

-- ==================== 裁判表 ====================
CREATE TABLE IF NOT EXISTS referees (
  id VARCHAR(36) PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_referees_user ON referees(user_id);
CREATE INDEX IF NOT EXISTS idx_referees_venue ON referees(venue_id);
CREATE INDEX IF NOT EXISTS idx_referees_cert ON referees(cert_status);
CREATE INDEX IF NOT EXISTS idx_referees_status ON referees(status);

-- ==================== 参赛包表 ====================
CREATE TABLE IF NOT EXISTS race_packages (
  id VARCHAR(36) PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_race_packages_status ON race_packages(status);

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
CREATE INDEX IF NOT EXISTS idx_rpc_package_id ON race_package_coupons(package_id);
CREATE INDEX IF NOT EXISTS idx_rpc_coupon_id ON race_package_coupons(coupon_id);

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
  remaining_times INT DEFAULT 0,
  remaining_growth INT DEFAULT 0,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ==================== 支付流水表 ====================
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  transaction_id VARCHAR(128),
  amount_cents INT NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  raw_data TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);

-- ==================== 支付事务表 ====================
CREATE TABLE IF NOT EXISTS payment_transactions (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  amount INT NOT NULL,
  transaction_id VARCHAR(64),
  payment_method VARCHAR(32) DEFAULT 'wechat_pay',
  status VARCHAR(16) DEFAULT 'pending',
  refund_id VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_venue ON checkins(venue_id);
CREATE INDEX IF NOT EXISTS idx_checkins_venue_queue ON checkins(venue_id, queue_number);
CREATE INDEX IF NOT EXISTS idx_checkins_status ON checkins(status);

-- ==================== 比赛成绩表 ====================
CREATE TABLE IF NOT EXISTS race_results (
  id VARCHAR(36) PRIMARY KEY,
  checkin_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  venue_id VARCHAR(36) NOT NULL,
  referee_id VARCHAR(36),
  score_ms INT,
  rank INT,
  status VARCHAR(20) NOT NULL DEFAULT 'racing',
  fault_reason TEXT,
  race_type INT NOT NULL DEFAULT 1,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_race_results_user ON race_results(user_id);
CREATE INDEX IF NOT EXISTS idx_race_results_venue ON race_results(venue_id);
CREATE INDEX IF NOT EXISTS idx_race_results_score ON race_results(score_ms);
CREATE INDEX IF NOT EXISTS idx_race_results_created ON race_results(created_at);

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
CREATE INDEX IF NOT EXISTS idx_attendance_referee ON attendance(referee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_venue ON attendance(venue_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(checkin_at);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);

-- ==================== 结算记录表 ====================
CREATE TABLE IF NOT EXISTS settlements (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL,
  commission_cents INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

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
CREATE INDEX IF NOT EXISTS idx_merchant_coupons_merchant ON merchant_coupons(merchant_id);

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
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_status ON user_coupons(status);

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
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);

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
CREATE INDEX IF NOT EXISTS idx_entry_deductions_user ON entry_deductions(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_deductions_status ON entry_deductions(status);

-- ==================== 积分商城表 ====================
CREATE TABLE IF NOT EXISTS point_shop (
  id VARCHAR(36) PRIMARY KEY,
  item_type VARCHAR(32) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
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
