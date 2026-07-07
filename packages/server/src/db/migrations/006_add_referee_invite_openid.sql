-- Migration 006: 裁判邀请表新增 openid 字段（路径 B：微信静默授权绑定）
ALTER TABLE referee_invites ADD COLUMN openid VARCHAR(128) DEFAULT NULL;
