-- ============================================
-- 铁甲快狗 (robot-maze-race) - 公共库 Schema
-- 数据库: robot_maze_race_common
-- ============================================

-- ==================== 用户表 ====================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  openid VARCHAR(128) UNIQUE NOT NULL,
  mp_openid VARCHAR(128) DEFAULT '',
  unionid VARCHAR(128),
  nickname VARCHAR(64),
  avatar_url VARCHAR(512),
  phone VARCHAR(20),
  gender VARCHAR(10) DEFAULT '',
  age INT DEFAULT 0,
  role VARCHAR(20) NOT NULL DEFAULT 'player',
  race_count INT DEFAULT 0,
  total_race_time_ms INT DEFAULT 0,
  best_score_ms INT,
  level INT NOT NULL DEFAULT 1,
  exp INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  password VARCHAR(128) DEFAULT '',
  first_login INT DEFAULT 0,
  subscribe_venue_id VARCHAR(128),
  register_coupon_granted INT NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ==================== 运营商注册表 ====================
CREATE TABLE IF NOT EXISTS operators_registry (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL,
  db_name VARCHAR(128) NOT NULL UNIQUE,
  operator_name VARCHAR(128) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_operators_registry_operator_id ON operators_registry(operator_id);

-- ==================== 运营商表 ====================
CREATE TABLE IF NOT EXISTS operators (
  id VARCHAR(36) PRIMARY KEY,
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
  province VARCHAR(64) DEFAULT '',
  city VARCHAR(64) DEFAULT '',
  district VARCHAR(64) DEFAULT '',
  company_address VARCHAR(512) DEFAULT '',
  operator_username VARCHAR(256) DEFAULT '',
  operator_password_hash VARCHAR(256) DEFAULT '',
  contact_phone VARCHAR(20),
  scope VARCHAR(64),
  role VARCHAR(32) DEFAULT 'admin',
  password_change_required INT DEFAULT 1,
  first_login INT DEFAULT 1,
  created_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 后台管理员角色表 ====================
CREATE TABLE IF NOT EXISTS admin_roles (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(64) NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  scope VARCHAR(32) NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 后台管理员账号表 ====================
CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(256) NOT NULL,
  nickname VARCHAR(64),
  email VARCHAR(128) DEFAULT '',
  phone VARCHAR(20) DEFAULT '',
  role_id VARCHAR(36) NOT NULL,
  operator_id VARCHAR(36),
  first_login INT DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_operator ON admin_users(operator_id);

-- ==================== 系统配置表 ====================
CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR(36) PRIMARY KEY,
  `key` VARCHAR(64) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 系统设置表 ====================
CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(36) PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 幂等键表 ====================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id VARCHAR(36) PRIMARY KEY,
  `key` VARCHAR(128) UNIQUE NOT NULL,
  response TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(`key`);

-- ==================== 客户端日志表 ====================
CREATE TABLE IF NOT EXISTS client_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  level VARCHAR(16),
  message TEXT,
  source VARCHAR(64),
  detail TEXT,
  url VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 赛季表 ====================
CREATE TABLE IF NOT EXISTS seasons (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT DEFAULT '',
  start_time DATETIME,
  end_time DATETIME,
  status INT NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==================== 赛季用户信息表 ====================
CREATE TABLE IF NOT EXISTS season_user_info (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  season_id VARCHAR(36) NOT NULL,
  level INT NOT NULL DEFAULT 1,
  exp INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(user_id, season_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_season_user_info_user ON season_user_info(user_id);
CREATE INDEX IF NOT EXISTS idx_season_user_info_season ON season_user_info(season_id);

-- ==================== 战斗力表 ====================
CREATE TABLE IF NOT EXISTS combat_power (
  id VARCHAR(36) PRIMARY KEY,
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_combat_power_user ON combat_power(user_id);

-- ==================== 积分交易记录表 ====================
CREATE TABLE IF NOT EXISTS points_transactions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  points INT NOT NULL,
  type VARCHAR(32) NOT NULL,
  remark TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_points_transactions_user ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_created ON points_transactions(created_at);

-- ==================== 助力记录表 ====================
CREATE TABLE IF NOT EXISTS helps (
  id VARCHAR(36) PRIMARY KEY,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_helps_initiator ON helps(initiator_id);
CREATE INDEX IF NOT EXISTS idx_helps_helper ON helps(helper_id);
CREATE INDEX IF NOT EXISTS idx_helps_status ON helps(status);

-- ==================== 帮助助力记录表 ====================
CREATE TABLE IF NOT EXISTS help_helpers (
  id VARCHAR(36) PRIMARY KEY,
  help_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  device_id VARCHAR(128),
  helped_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_help_helpers_help ON help_helpers(help_id);
CREATE INDEX IF NOT EXISTS idx_help_helpers_user ON help_helpers(user_id);

-- ==================== 任务模板表 ====================
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT DEFAULT '',
  task_type VARCHAR(32) NOT NULL DEFAULT '',
  target_value TEXT DEFAULT '',
  reward_type VARCHAR(32) NOT NULL DEFAULT '',
  reward_value INT NOT NULL DEFAULT 0,
  status INT NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ==================== 用户任务进度表 ====================
CREATE TABLE IF NOT EXISTS user_tasks (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  progress_value TEXT DEFAULT '',
  status INT NOT NULL DEFAULT 0,
  rewarded_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(user_id, task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_status ON user_tasks(status);

-- ==================== 通知发送日志表 ====================
CREATE TABLE IF NOT EXISTS notification_logs (
  id VARCHAR(36) PRIMARY KEY,
  scene VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  openid VARCHAR(128) NOT NULL,
  template_id VARCHAR(64),
  content TEXT,
  status VARCHAR(16) DEFAULT 'success',
  error_msg TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_notification_logs_scene ON notification_logs(scene);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at);

-- ==================== 裁判邀请表 ====================
CREATE TABLE IF NOT EXISTS referee_invites (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL,
  phone VARCHAR(20),
  venue_id VARCHAR(36),
  token VARCHAR(64) UNIQUE NOT NULL,
  note TEXT,
  status ENUM('active','used','expired') DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_token (token),
  KEY idx_operator (operator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
