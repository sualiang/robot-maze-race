-- Migration 005: merchant_admin 加 first_login 列
ALTER TABLE merchant_admin ADD COLUMN IF NOT EXISTS first_login TINYINT NOT NULL DEFAULT 0;
