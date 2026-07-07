-- Migration: add stock field to point_shop table
-- Feature: 积分商城库存功能
-- Date: 2026-07-08

ALTER TABLE point_shop
  ADD COLUMN stock INT NOT NULL DEFAULT 0;
