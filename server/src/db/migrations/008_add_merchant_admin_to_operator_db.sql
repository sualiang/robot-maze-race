-- Migration 008: Add merchant_admin table to operator databases
-- 该表随 operator.sql 部署，但现有 operator 数据库缺少此表
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
CREATE INDEX IF NOT EXISTS idx_merchant_admin_username ON merchant_admin(username);
CREATE INDEX IF NOT EXISTS idx_merchant_admin_merchant ON merchant_admin(merchant_id);
