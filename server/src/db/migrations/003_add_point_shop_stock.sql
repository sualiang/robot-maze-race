-- 积分商城增加库存字段
ALTER TABLE point_shop ADD COLUMN stock INT NOT NULL DEFAULT 0;
