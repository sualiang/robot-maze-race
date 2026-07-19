-- ============================================================
-- P0 补偿 SQL：补录所有缺失的 payments 和 settlements 记录
-- ============================================================
-- 用法：
--   1. 查所有运营商库名：
--      SELECT db_name FROM robot_maze_race_common.operators_registry WHERE db_name IS NOT NULL;
--   2. 对每个库替换 __OP_DB__ 后执行下方 INSERT
--   3. 执行后运行验证 SQL 确认补录结果
-- ============================================================

-- ============================================================
-- Part A: 补录缺失的 payments 记录
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
-- Part B: 补录缺失的 settlements 记录
-- ============================================================
INSERT INTO __OP_DB__.settlements (id, order_id, amount_cents, commission_cents, operator_id, status, created_at)
SELECT
    UUID() AS id,
    o.id AS order_id,
    o.amount_cents,
    0 AS commission_cents,
    COALESCE(o.operator_id, '') AS operator_id,
    'pending' AS status,
    o.paid_at AS created_at
FROM __OP_DB__.orders o
LEFT JOIN __OP_DB__.settlements s ON s.order_id = o.id
WHERE o.status = 'paid'
  AND o.paid_at IS NOT NULL
  AND s.id IS NULL;

-- ============================================================
-- 验证 SQL
-- ============================================================
-- -- 每个库对比一下
-- SELECT 
--   'payments' AS tbl,
--   (SELECT COUNT(*) FROM __OP_DB__.orders WHERE status='paid' AND paid_at IS NOT NULL) AS expected,
--   (SELECT COUNT(*) FROM __OP_DB__.payments WHERE status IN ('paid','success')) AS actual
-- UNION ALL
-- SELECT 
--   'settlements',
--   (SELECT COUNT(*) FROM __OP_DB__.orders WHERE status='paid' AND paid_at IS NOT NULL),
--   (SELECT COUNT(*) FROM __OP_DB__.settlements);

-- ============================================================
-- 安博文化单条快速补录 ORD_1784401698727
-- ============================================================
-- （替换 __AMBOR_DB__ 为实际库名）
--
-- INSERT INTO __AMBOR_DB__.payments (id, order_id, operator_id, user_id, transaction_id, amount_cents, channel, status, pay_time, created_at)
-- SELECT UUID(), o.id, o.operator_id, o.user_id, COALESCE(o.transaction_id, ''), o.amount_cents,
--        'wechat_pay', 'paid', o.paid_at, o.paid_at
-- FROM __AMBOR_DB__.orders o WHERE o.order_no = 'ORD_1784401698727';
--
-- INSERT INTO __AMBOR_DB__.settlements (id, order_id, amount_cents, commission_cents, operator_id, status, created_at)
-- SELECT UUID(), o.id, o.amount_cents, 0, COALESCE(o.operator_id, ''), 'pending', o.paid_at
-- FROM __AMBOR_DB__.orders o WHERE o.order_no = 'ORD_1784401698727';
