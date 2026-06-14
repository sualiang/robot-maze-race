-- ============================================
-- Migration: 为 operators 表添加省市区地址字段
-- ============================================

ALTER TABLE operators ADD COLUMN province TEXT DEFAULT '';
ALTER TABLE operators ADD COLUMN city TEXT DEFAULT '';
ALTER TABLE operators ADD COLUMN district TEXT DEFAULT '';
ALTER TABLE operators ADD COLUMN company_address TEXT DEFAULT '';
