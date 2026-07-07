-- Migration 004: 裁判注册审核表
CREATE TABLE IF NOT EXISTS referees (
  id VARCHAR(36) PRIMARY KEY,
  operator_id VARCHAR(36) NOT NULL,
  wechat_openid VARCHAR(64),
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  reject_reason VARCHAR(200),
  reviewed_by VARCHAR(36),
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
