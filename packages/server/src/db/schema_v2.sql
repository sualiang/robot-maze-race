-- ============================================
-- 铁甲快狗 V2.0 — 新增表结构与字段迁移
-- ============================================

-- ==================== V2 字段迁移 ====================

-- users 表已有 gender/age/subscribe_venue_id/password/first_login 字段
-- 新增 V2 字段（通过 ALTER TABLE TRY/CATCH 模式执行）
-- level, exp, points 将直接写入 schema_v2

-- ==================== 赛季表 ====================
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT DEFAULT '',
  start_time TEXT,
  end_time TEXT,
  status INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==================== 赛季用户信息表 ====================
CREATE TABLE IF NOT EXISTS season_user_info (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  season_id TEXT NOT NULL REFERENCES seasons(id),
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, season_id)
);
CREATE INDEX IF NOT EXISTS idx_season_user_info_user ON season_user_info(user_id);
CREATE INDEX IF NOT EXISTS idx_season_user_info_season ON season_user_info(season_id);

-- ==================== 战斗力表 ====================
CREATE TABLE IF NOT EXISTS combat_power (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  total_power INTEGER NOT NULL DEFAULT 0,
  dimension_1_name VARCHAR(64) DEFAULT '',
  dimension_1_score INTEGER DEFAULT 0,
  dimension_2_name VARCHAR(64) DEFAULT '',
  dimension_2_score INTEGER DEFAULT 0,
  dimension_3_name VARCHAR(64) DEFAULT '',
  dimension_3_score INTEGER DEFAULT 0,
  dimension_4_name VARCHAR(64) DEFAULT '',
  dimension_4_score INTEGER DEFAULT 0,
  dimension_5_name VARCHAR(64) DEFAULT '',
  dimension_5_score INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_combat_power_user ON combat_power(user_id);

-- ==================== 积分交易记录表 ====================
CREATE TABLE IF NOT EXISTS points_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL,
  type VARCHAR(32) NOT NULL,
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_points_transactions_user ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_created ON points_transactions(created_at);

-- ==================== 奖品表 ====================
CREATE TABLE IF NOT EXISTS lottery_prizes (
  id TEXT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  image_url VARCHAR(512) DEFAULT '',
  prize_type INTEGER NOT NULL DEFAULT 1,
  prize_value VARCHAR(256) DEFAULT '',
  total_count INTEGER NOT NULL DEFAULT 0,
  remain_count INTEGER NOT NULL DEFAULT 0,
  probability REAL NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 1,
  status INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lottery_prizes_status ON lottery_prizes(status);

-- ==================== 抽奖记录表 ====================
CREATE TABLE IF NOT EXISTS lottery_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  prize_id TEXT REFERENCES lottery_prizes(id),
  prize_name VARCHAR(128) DEFAULT '',
  points_cost INTEGER NOT NULL DEFAULT 0,
  is_win INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lottery_records_user ON lottery_records(user_id);
CREATE INDEX IF NOT EXISTS idx_lottery_records_created ON lottery_records(created_at);

-- ==================== 商家优惠券模板表 ====================
CREATE TABLE IF NOT EXISTS merchant_coupons (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT DEFAULT '',
  denomination_cents INTEGER NOT NULL DEFAULT 0,
  min_consume_cents INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  remain_count INTEGER NOT NULL DEFAULT 0,
  valid_start TEXT,
  valid_end TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merchant_coupons_merchant ON merchant_coupons(merchant_id);

-- ==================== 用户优惠券表 ====================
CREATE TABLE IF NOT EXISTS user_coupons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  coupon_id TEXT NOT NULL REFERENCES merchant_coupons(id),
  merchant_id TEXT NOT NULL,
  name VARCHAR(128) DEFAULT '',
  description TEXT DEFAULT '',
  denomination_cents INTEGER NOT NULL DEFAULT 0,
  min_consume_cents INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  used_at TEXT,
  valid_start TEXT,
  valid_end TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_status ON user_coupons(status);

-- ==================== 任务模板表 ====================
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT DEFAULT '',
  task_type VARCHAR(32) NOT NULL DEFAULT '',
  target_value TEXT DEFAULT '',
  reward_type VARCHAR(32) NOT NULL DEFAULT '',
  reward_value INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ==================== 用户任务进度表 ====================
CREATE TABLE IF NOT EXISTS user_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  progress_value TEXT DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  rewarded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_status ON user_tasks(status);

-- ==================== 商家表 ====================
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  merchant_name VARCHAR(128) NOT NULL,
  merchant_address VARCHAR(512) DEFAULT '',
  longitude REAL DEFAULT 0,
  latitude REAL DEFAULT 0,
  contact_phone VARCHAR(20) DEFAULT '',
  logo_url VARCHAR(512) DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
