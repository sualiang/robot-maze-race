-- ============================================
-- 机器狗迷宫竞速赛事 - 数据库 Schema
-- SQLite 版本（从 PostgreSQL 迁移）
-- ============================================

-- SQLite 使用 TEXT 替代 UUID
-- 使用 INTEGER 替代 BIGINT
-- 使用 REAL 替代 DOUBLE PRECISION
-- 去掉了 COMMENT / CREATE EXTENSION / JSONB / TIMESTAMPTZ

-- ==================== 用户表 ====================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  openid VARCHAR(128) UNIQUE NOT NULL,
  unionid VARCHAR(128),
  nickname VARCHAR(64),
  avatar_url VARCHAR(512),
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL DEFAULT 'player',
  race_count INTEGER DEFAULT 0,
  total_race_time_ms INTEGER DEFAULT 0,
  best_score_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ==================== 赛场表 ====================
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  address VARCHAR(512),
  latitude REAL,
  longitude REAL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  qrcode_url VARCHAR(512),
  checkin_radius_meters INTEGER DEFAULT 100,
  max_queue_size INTEGER DEFAULT 50,
  timeout_seconds INTEGER DEFAULT 300,
  open_time TEXT DEFAULT '09:00:00',
  close_time TEXT DEFAULT '21:00:00',
  city TEXT DEFAULT '',
  district TEXT DEFAULT '',
  description TEXT,
  profit_share_rate REAL DEFAULT 0,
  operator_id TEXT REFERENCES operators(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status);
CREATE INDEX IF NOT EXISTS idx_venues_operator ON venues(operator_id);

-- ==================== 裁判表 ====================
CREATE TABLE IF NOT EXISTS referees (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cert_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  venue_id TEXT REFERENCES venues(id),
  phone VARCHAR(20),
  id_number VARCHAR(18),
  id_card_front VARCHAR(512),
  id_card_back VARCHAR(512),
  name VARCHAR(100),
  cert_image VARCHAR(512),
  gps_lat REAL,
  gps_lng REAL,
  last_checkin_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referees_user ON referees(user_id);
CREATE INDEX IF NOT EXISTS idx_referees_venue ON referees(venue_id);
CREATE INDEX IF NOT EXISTS idx_referees_cert ON referees(cert_status);

-- ==================== 参赛包表 ====================
CREATE TABLE IF NOT EXISTS race_packages (
  id TEXT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  race_count INTEGER NOT NULL DEFAULT 1,
  valid_days INTEGER DEFAULT 365,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_race_packages_status ON race_packages(status);

-- ==================== 订单表 ====================
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no VARCHAR(64) UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  package_id TEXT NOT NULL REFERENCES race_packages(id),
  amount_cents INTEGER NOT NULL,
  discount_cents INTEGER DEFAULT 0,
  coupon_multiplier INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(20),
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ==================== 支付流水表 ====================
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  transaction_id VARCHAR(128),
  amount_cents INTEGER NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  raw_data TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);

-- ==================== 签到记录表 ====================
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  package_id TEXT REFERENCES race_packages(id),
  queue_number INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  checked_in_at TEXT DEFAULT (datetime('now')),
  called_at TEXT,
  race_started_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_venue ON checkins(venue_id);
CREATE INDEX IF NOT EXISTS idx_checkins_venue_queue ON checkins(venue_id, queue_number);
CREATE INDEX IF NOT EXISTS idx_checkins_status ON checkins(status);

-- ==================== 比赛成绩表 ====================
CREATE TABLE IF NOT EXISTS race_results (
  id TEXT PRIMARY KEY,
  checkin_id TEXT NOT NULL REFERENCES checkins(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  referee_id TEXT REFERENCES users(id),
  score_ms INTEGER,
  rank INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'racing',
  fault_reason TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_race_results_user ON race_results(user_id);
CREATE INDEX IF NOT EXISTS idx_race_results_venue ON race_results(venue_id);
CREATE INDEX IF NOT EXISTS idx_race_results_score ON race_results(score_ms);
CREATE INDEX IF NOT EXISTS idx_race_results_created ON race_results(created_at);

-- ==================== 助力记录表 ====================
CREATE TABLE IF NOT EXISTS helps (
  id TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL REFERENCES users(id),
  helper_id TEXT REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'initiated',
  target_package_id TEXT,
  required_help_count INTEGER NOT NULL DEFAULT 5,
  current_help_count INTEGER NOT NULL DEFAULT 0,
  helper_device_id VARCHAR(128),
  coupon_amount_cents INTEGER DEFAULT 0,
  initiated_at TEXT DEFAULT (datetime('now')),
  helped_at TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_helps_initiator ON helps(initiator_id);
CREATE INDEX IF NOT EXISTS idx_helps_helper ON helps(helper_id);
CREATE INDEX IF NOT EXISTS idx_helps_status ON helps(status);

-- ==================== 膨胀券表 ====================
CREATE TABLE IF NOT EXISTS expand_coupons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  help_id TEXT REFERENCES helps(id),
  bonus_count INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  used_order_id TEXT REFERENCES orders(id),
  valid_from TEXT DEFAULT (datetime('now')),
  valid_until TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupons_user ON expand_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON expand_coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_valid ON expand_coupons(valid_until);

-- ==================== 考勤记录表 ====================
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  referee_id TEXT NOT NULL REFERENCES referees(id),
  user_id TEXT REFERENCES users(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  checkin_at TEXT NOT NULL,
  checkout_at TEXT,
  gps_lat REAL,
  gps_lng REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_referee ON attendance(referee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_venue ON attendance(venue_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(checkin_at);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);

-- ==================== 结算记录表 ====================
CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  operator_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_settlements_operator ON settlements(operator_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

-- ==================== 营销配置表 ====================
CREATE TABLE IF NOT EXISTS marketing_config (
  id TEXT PRIMARY KEY,
  venue_id TEXT REFERENCES venues(id),
  key VARCHAR(64) NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(venue_id, key)
);

-- ==================== 系统配置表 ====================
CREATE TABLE IF NOT EXISTS system_config (
  id TEXT PRIMARY KEY,
  key VARCHAR(64) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==================== 幂等键表 ====================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  key VARCHAR(128) UNIQUE NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(key);

-- ==================== 运营商表 ====================
CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(128),
  company_name VARCHAR(256),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  venue_count INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0,
  profit_share_rate INTEGER NOT NULL DEFAULT 80,
  bank_account VARCHAR(64),
  bank_name VARCHAR(128),
  contact_person VARCHAR(64),
  province TEXT DEFAULT '',
  city TEXT DEFAULT '',
  district TEXT DEFAULT '',
  company_address TEXT DEFAULT '',
  operator_username TEXT DEFAULT '',
  operator_password_hash TEXT DEFAULT '',
  contact_phone VARCHAR(20),
  scope VARCHAR(64),
  role VARCHAR(32) DEFAULT 'admin',
  password_change_required INTEGER DEFAULT 1,
  first_login INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==================== 系统设置表 ====================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 默认分润比例
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_profit_share_rate', '80');

-- ==================== 后台管理员角色表 ====================
CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==================== 后台管理员账号表 ====================
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  nickname TEXT,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role_id TEXT NOT NULL REFERENCES admin_roles(id),
  operator_id TEXT REFERENCES operators(id),
  first_login INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_operator ON admin_users(operator_id);

-- ==================== 后台种子数据 ====================
-- ==================== 客户端日志表 ====================
CREATE TABLE IF NOT EXISTS client_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT,
  message TEXT,
  source TEXT,
  detail TEXT,
  url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 运营商成员表 ====================
CREATE TABLE IF NOT EXISTS operator_members (
  id TEXT PRIMARY KEY,
  operator_id TEXT,
  name TEXT,
  phone TEXT,
  password_hash TEXT,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'active',
  first_login INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

-- ==================== 运营商会话表 ====================
CREATE TABLE IF NOT EXISTS operator_sessions (
  id TEXT PRIMARY KEY,
  operator_id TEXT,
  member_id TEXT,
  member_name TEXT,
  token TEXT,
  created_at TEXT,
  expires_at TEXT
);

-- ==================== 比赛表 ====================
CREATE TABLE IF NOT EXISTS races (
  id TEXT PRIMARY KEY,
  venue_id TEXT,
  name TEXT,
  status TEXT DEFAULT 'draft',
  max_participants INTEGER,
  entry_fee INTEGER,
  start_time TEXT,
  end_time TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

-- ==================== 比赛记录表 ====================
CREATE TABLE IF NOT EXISTS race_records (
  id TEXT PRIMARY KEY,
  race_id TEXT,
  player_id TEXT,
  score REAL,
  duration_seconds INTEGER,
  status TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT
);

-- ==================== 比赛签到表 ====================
CREATE TABLE IF NOT EXISTS race_attendance (
  id TEXT PRIMARY KEY,
  race_id TEXT,
  player_id TEXT,
  check_in_time TEXT,
  status TEXT
);

-- ==================== 用户票券表 ====================
CREATE TABLE IF NOT EXISTS user_tickets (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  ticket_type TEXT,
  status TEXT DEFAULT 'unused',
  created_at TEXT,
  used_at TEXT,
  expires_at TEXT
);

-- ==================== 票券兑换表 ====================
CREATE TABLE IF NOT EXISTS ticket_redemptions (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  player_id TEXT,
  redeemed_at TEXT,
  reward TEXT,
  status TEXT
);

-- ==================== 后台种子数据 ====================
INSERT OR IGNORE INTO admin_roles (id, name, label, permissions) VALUES
  ('role-super-admin', 'super_admin', '超级管理员', '["*"]'),
  ('role-admin', 'admin', '总管理员', '["operators:read","operators:list","dashboard:read","dashboard:list","marketing:read","finance:read","finance:withdraw","finance:history"]'),
  ('role-ops-admin', 'ops_admin', '运营管理员', '["operators:read","operators:create","operators:edit","dashboard:read","dashboard:list"]'),
  ('role-finance-admin', 'finance_admin', '财务管理员', '["finance:read","finance:withdraw","finance:history"]');

-- admin 用户（first_login = 0，不需要首次改密码）
INSERT OR IGNORE INTO admin_users (id, username, password, nickname, role_id, first_login) VALUES
  ('admin-default', 'admin', '$2a$10$uPX5Q6yR0q5R5fl6Pp7k8u3F5x1y2z3A4B5C6D7E8F9G0H1I2J3K4L5M', '超级管理员', 'role-super-admin', 0);

