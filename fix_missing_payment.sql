-- ============================================================
-- P0 补偿 SQL：补录缺失的支付流水
-- 订单 ORD_1784401698727，运营商「安博文化」
-- operator_id = ebf89164-...
-- ============================================================
-- 
-- 使用方法：
--   1. 先确认运营商库名（在 common 库查询）：
--      SELECT db_name FROM robot_maze_race_common.operators_registry
--      WHERE operator_id LIKE 'ebf89164%';
--   
--   2. 将下面的 __OP_DB__ 替换为实际库名后执行
--   3. 执行前确认该订单的 payments 记录确实缺失：
--      SELECT * FROM __OP_DB__.payments WHERE order_id IN (
--        SELECT id FROM __OP_DB__.orders WHERE order_no = 'ORD_1784401698727'
--      );
--      如果返回空 → 执行补录 SQL

-- ============================================================
-- 补录 payments 表
-- ============================================================
INSERT INTO __OP_DB__.payments (id, order_id, transaction_id, amount_cents, channel, status, paid_at, created_at)
SELECT
    UUID() AS id,
    o.id AS order_id,
    COALESCE(o.transaction_id, '') AS transaction_id,
    o.amount_cents,
    'wechat_pay' AS channel,
    'success' AS status,
    o.paid_at,
    o.paid_at AS created_at
FROM __OP_DB__.orders o
LEFT JOIN __OP_DB__.payments p ON p.order_id = o.id
WHERE o.order_no = 'ORD_1784401698727'
  AND p.id IS NULL;

-- ============================================================
-- 同时检查 payment_transactions 表是否也缺失，一并补录
-- ============================================================
INSERT INTO __OP_DB__.payment_transactions (id, order_id, user_id, amount, transaction_id, payment_method, status, created_at)
SELECT
    UUID() AS id,
    o.id AS order_id,
    o.user_id,
    o.amount_cents AS amount,
    COALESCE(o.transaction_id, ''),
    'wechat_pay',
    'success',
    o.paid_at AS created_at
FROM __OP_DB__.orders o
LEFT JOIN __OP_DB__.payment_transactions pt ON pt.order_id = o.id
WHERE o.order_no = 'ORD_1784401698727'
  AND pt.id IS NULL;

-- ============================================================
-- 验证补录结果
-- ============================================================
-- SELECT 
--   o.order_no,
--   o.status,
--   o.amount_cents,
--   o.transaction_id,
--   o.paid_at,
--   p.id AS payment_id,
--   pt.id AS payment_transaction_id
-- FROM __OP_DB__.orders o
-- LEFT JOIN __OP_DB__.payments p ON p.order_id = o.id
-- LEFT JOIN __OP_DB__.payment_transactions pt ON pt.order_id = o.id
-- WHERE o.order_no = 'ORD_1784401698727';
