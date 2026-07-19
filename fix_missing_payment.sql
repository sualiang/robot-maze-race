-- ============================================================
-- P0 补偿 SQL：补录所有缺失的 payments 记录
-- ============================================================
-- 背景：payments 表 channel 列 NOT NULL 无默认值，之前 INSERT 漏写 channel
-- 导致所有已支付订单的 payments 可能缺失
--
-- 执行步骤：
--   1. 在 common 库查所有运营商库名：
--      SELECT db_name FROM robot_maze_race_common.operators_registry WHERE db_name IS NOT NULL;
--   2. 对每个库执行下方 INSERT（替换 __OP_DB__）
--   3. 执行后验证：下方验证 SQL
-- ============================================================

-- ============================================================
-- 补录：已支付但缺失 payments 记录的订单
-- 从 orders 表直接取字段
-- ============================================================
INSERT INTO __OP_DB__.payments (id, order_id, operator_id, user_id, transaction_id, amount_cents, channel, status, pay_time, created_at)
SELECT
    UUID() AS id,
    o.id AS order_id,
    o.operator_id,
    o.user_id,
    COALESCE(o.transaction_id, ''),
    o.amount_cents,
    'wechat_pay' AS channel,
    'paid' AS status,
    o.paid_at AS pay_time,
    o.paid_at AS created_at
FROM __OP_DB__.orders o
LEFT JOIN __OP_DB__.payments p ON p.order_id = o.id
WHERE o.status = 'paid'
  AND o.paid_at IS NOT NULL
  AND p.id IS NULL;

-- ============================================================
-- 验证：列出刚补录的记录
-- ============================================================
-- SELECT p.id, p.order_id, o.order_no, p.amount_cents, p.transaction_id, p.pay_time
-- FROM __OP_DB__.payments p
-- JOIN __OP_DB__.orders o ON o.id = p.order_id
-- LEFT JOIN __OP_DB__.payments p2 ON p2.order_id = p.order_id AND p2.id < p.id
-- WHERE p2.id IS NULL
-- ORDER BY p.created_at DESC;
--
-- 或者直接对比：
-- SELECT 
--   (SELECT COUNT(*) FROM __OP_DB__.orders WHERE status='paid' AND paid_at IS NOT NULL) AS paid_orders,
--   (SELECT COUNT(*) FROM __OP_DB__.payments WHERE status='paid') AS payment_records;

-- ============================================================
-- 指定补录安博文化的 ORD_1784401698727（单条快速修复）
-- ============================================================
-- 先确认安博文化库名：
-- SELECT db_name FROM robot_maze_race_common.operators_registry
-- WHERE operator_id LIKE 'ebf89164%';

-- 然后执行（替换 __AMBOR_DB__ 为实际库名）：
-- INSERT INTO __AMBOR_DB__.payments (id, order_id, operator_id, user_id, transaction_id, amount_cents, channel, status, pay_time, created_at)
-- SELECT UUID(), o.id, o.operator_id, o.user_id, COALESCE(o.transaction_id, ''), o.amount_cents,
--        'wechat_pay', 'paid', o.paid_at, o.paid_at
-- FROM __AMBOR_DB__.orders o
-- WHERE o.order_no = 'ORD_1784401698727';
