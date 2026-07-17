-- Migration: Rename operator_members.nickname to name
-- 仅在 robot_maze_race_common（common.sql）库中修改
-- operator_members 表放在公共库中，因为登录时需要按手机号查找成员

-- 检查列是否存在，存在则重命名（MySQL 8.0+ 的 RENAME COLUMN 语法）
-- 如果已经改名或不存在该列，忽略错误
ALTER TABLE operator_members CHANGE COLUMN nickname name VARCHAR(64);
