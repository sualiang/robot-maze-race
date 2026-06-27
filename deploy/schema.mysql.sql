-- =============================================================
-- 铁甲快狗 (IronDog) — MySQL Schema
-- 生成日期: 2026-06-26
-- 源: SQLite → MySQL DDL 转换
-- 数据库: robot_race
-- =============================================================

-- 数据库创建（如果不存在）
-- CREATE DATABASE IF NOT EXISTS robot_race DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE robot_race;

-- -----------------------------------------------------------
-- 1. 运营者 / 商家 (operators)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(128) PRIMARY KEY,
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
    province VARCHAR(255) DEFAULT '',
    city VARCHAR(255) DEFAULT '',
    district VARCHAR(255) DEFAULT '',
    company_address VARCHAR(255) DEFAULT '',
    operator_username VARCHAR(255) DEFAULT '',
    operator_password_hash VARCHAR(255) DEFAULT '',
    contact_phone VARCHAR(20),
    scope VARCHAR(64),
    role VARCHAR(32) DEFAULT 'admin',
    password_change_required INT DEFAULT 1,
    first_login INT DEFAULT 1,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 2. 用户 (users)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,
    openid VARCHAR(128) UNIQUE NOT NULL,
    unionid VARCHAR(128),
    nickname VARCHAR(64),
    avatar_url VARCHAR(512),
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL DEFAULT 'player',
    race_count INT DEFAULT 0,
    total_race_time_ms INT DEFAULT 0,
    best_score_ms INT,
    gender VARCHAR(10) DEFAULT '',
    age INT DEFAULT 0,
    subscribe_venue_id VARCHAR(128),
    password VARCHAR(128) DEFAULT '',
    first_login INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_openid (openid),
    INDEX idx_users_role (role),
    INDEX idx_users_phone (phone),
    CONSTRAINT fk_users_subscribe_venue FOREIGN KEY (subscribe_venue_id) REFERENCES venues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 3. 场馆 (venues)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS venues (
    id VARCHAR(128) PRIMARY KEY,
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
    city VARCHAR(255) DEFAULT '',
    district VARCHAR(255) DEFAULT '',
    description TEXT,
    profit_share_rate DOUBLE DEFAULT 0,
    operator_id VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_venues_status (status),
    INDEX idx_venues_operator (operator_id),
    CONSTRAINT fk_venues_operator FOREIGN KEY (operator_id) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 4. 竞速套餐 (race_packages)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS race_packages (
    id VARCHAR(128) PRIMARY KEY,
    operator_id VARCHAR(128),
    name VARCHAR(128) NOT NULL,
    description TEXT,
    price_cents INT NOT NULL,
    race_count INT NOT NULL DEFAULT 1,
    valid_days INT DEFAULT 365,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_race_packages_status (status),
    CONSTRAINT fk_race_packages_operator FOREIGN KEY (operator_id) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 5. 支付记录 (payments)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(128) PRIMARY KEY,
    order_id VARCHAR(128) NOT NULL,
    transaction_id VARCHAR(128),
    amount_cents INT NOT NULL,
    channel VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    raw_data TEXT,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payments_order (order_id),
    INDEX idx_payments_transaction (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 6. 签到 / 排队 (checkins)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    venue_id VARCHAR(128) NOT NULL,
    package_id VARCHAR(128),
    queue_number INT,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    called_at TIMESTAMP NULL,
    race_started_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_checkins_user (user_id),
    INDEX idx_checkins_venue (venue_id),
    INDEX idx_checkins_venue_queue (venue_id, queue_number),
    INDEX idx_checkins_status (status),
    CONSTRAINT fk_checkins_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_checkins_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
    CONSTRAINT fk_checkins_package FOREIGN KEY (package_id) REFERENCES race_packages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 7. 竞速成绩 (race_results)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS race_results (
    id VARCHAR(128) PRIMARY KEY,
    checkin_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    venue_id VARCHAR(128) NOT NULL,
    referee_id VARCHAR(128),
    score_ms INT,
    rank INT,
    status VARCHAR(20) NOT NULL DEFAULT 'racing',
    fault_reason TEXT,
    started_at TIMESTAMP NULL,
    finished_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_race_results_user (user_id),
    INDEX idx_race_results_venue (venue_id),
    INDEX idx_race_results_score (score_ms),
    INDEX idx_race_results_created (created_at),
    CONSTRAINT fk_race_results_checkin FOREIGN KEY (checkin_id) REFERENCES checkins(id),
    CONSTRAINT fk_race_results_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_race_results_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 8. 助力记录 (helps)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS helps (
    id VARCHAR(128) PRIMARY KEY,
    initiator_id VARCHAR(128) NOT NULL,
    helper_id VARCHAR(128),
    status VARCHAR(20) NOT NULL DEFAULT 'initiated',
    target_package_id VARCHAR(128),
    required_help_count INT NOT NULL DEFAULT 5,
    current_help_count INT NOT NULL DEFAULT 0,
    helper_device_id VARCHAR(128),
    coupon_amount_cents INT DEFAULT 0,
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    helped_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_helps_initiator (initiator_id),
    INDEX idx_helps_helper (helper_id),
    INDEX idx_helps_status (status),
    CONSTRAINT fk_helps_initiator FOREIGN KEY (initiator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 9. 膨胀优惠券 (expand_coupons)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS expand_coupons (
    id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    help_id VARCHAR(128),
    bonus_count INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    used_order_id VARCHAR(128),
    valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_coupons_user (user_id),
    INDEX idx_coupons_status (status),
    INDEX idx_coupons_valid (valid_until),
    CONSTRAINT fk_coupons_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_coupons_help FOREIGN KEY (help_id) REFERENCES helps(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 10. 签到考勤 (attendance)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    id VARCHAR(128) PRIMARY KEY,
    referee_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128),
    venue_id VARCHAR(128) NOT NULL,
    checkin_at TIMESTAMP NOT NULL,
    checkout_at TIMESTAMP NULL,
    gps_lat DOUBLE,
    gps_lng DOUBLE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attendance_referee (referee_id),
    INDEX idx_attendance_venue (venue_id),
    INDEX idx_attendance_date (checkin_at),
    INDEX idx_attendance_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 11. 结算记录 (settlements)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS settlements (
    id VARCHAR(128) PRIMARY KEY,
    order_id VARCHAR(128) NOT NULL,
    operator_id VARCHAR(128) NOT NULL,
    amount_cents INT NOT NULL,
    commission_cents INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    settled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_settlements_operator (operator_id),
    INDEX idx_settlements_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 12. 营销配置 (marketing_config)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_config (
    id VARCHAR(128) PRIMARY KEY,
    venue_id VARCHAR(128),
    key VARCHAR(64) NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_marketing_venue_key (venue_id, key),
    CONSTRAINT fk_marketing_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 13. 系统配置 (system_config)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_config (
    id VARCHAR(128) PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 14. 幂等键 (idempotency_keys)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id VARCHAR(128) PRIMARY KEY,
    key VARCHAR(128) UNIQUE NOT NULL,
    response LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_idempotency_keys_key (key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 15. 系统设置 (settings)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key_name VARCHAR(128) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 16. 管理角色 (admin_roles)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_roles (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    permissions TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 17. 管理员用户 (admin_users)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(128) PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(255),
    email VARCHAR(255) DEFAULT '',
    phone VARCHAR(255) DEFAULT '',
    role_id VARCHAR(128) NOT NULL,
    operator_id VARCHAR(128),
    first_login INT DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_admin_users_username (username),
    INDEX idx_admin_users_role (role_id),
    INDEX idx_admin_users_operator (operator_id),
    CONSTRAINT fk_admin_users_role FOREIGN KEY (role_id) REFERENCES admin_roles(id),
    CONSTRAINT fk_admin_users_operator FOREIGN KEY (operator_id) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 18. 客户端日志 (client_logs)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    level TEXT,
    message TEXT,
    source TEXT,
    detail LONGTEXT,
    url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 19. 运营者成员 (operator_members)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_members (
    id VARCHAR(128) PRIMARY KEY,
    operator_id VARCHAR(128),
    name TEXT,
    phone TEXT,
    password_hash VARCHAR(255),
    role VARCHAR(20) DEFAULT 'member',
    status VARCHAR(20) DEFAULT 'active',
    first_login INT DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 20. 运营者会话 (operator_sessions)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_sessions (
    id VARCHAR(128) PRIMARY KEY,
    operator_id VARCHAR(128),
    member_id VARCHAR(128),
    member_name TEXT,
    token TEXT,
    created_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 21. 竞速考勤 (race_attendance)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS race_attendance (
    id VARCHAR(128) PRIMARY KEY,
    race_id VARCHAR(128),
    player_id VARCHAR(128),
    check_in_time TIMESTAMP NULL,
    status TEXT,
    operator_id VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_race_attendance_operator FOREIGN KEY (operator_id) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 22. 票券兑换 (ticket_redemptions)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_redemptions (
    id VARCHAR(128) PRIMARY KEY,
    ticket_id VARCHAR(128),
    player_id VARCHAR(128),
    redeemed_at TIMESTAMP NULL,
    reward TEXT,
    status TEXT,
    operator_id VARCHAR(128),
    CONSTRAINT fk_ticket_redemptions_operator FOREIGN KEY (operator_id) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

