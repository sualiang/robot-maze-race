-- Migration 009: Drop login fields from operators table
-- operator_members is now the single login table
-- Run this only on robot_maze_race_common database

ALTER TABLE operators DROP COLUMN IF EXISTS operator_username;
ALTER TABLE operators DROP COLUMN IF EXISTS operator_password_hash;
ALTER TABLE operators DROP COLUMN IF EXISTS password_change_required;
ALTER TABLE operators DROP COLUMN IF EXISTS first_login;
