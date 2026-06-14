#!/bin/bash
# ============================================
# API 端到端测试脚本
# ============================================

BASE_URL="http://localhost:3000"
NOPROXY="--noproxy localhost"

# 生成 admin token
ADMIN_TOKEN=$(NODE_PATH=/Users/longshe/.openclaw/workspace/robot-maze-race/packages/server/node_modules node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign({ userId: 'admin_001', openid: 'admin_openid', role: 'admin' }, 'robot-maze-race-dev-secret', { expiresIn: '7d' }));
")

AUTH="Authorization: Bearer $ADMIN_TOKEN"

echo "ADMIN_TOKEN=${ADMIN_TOKEN:0:20}..."

echo ""
echo "============================================"
echo "【第2步】API 端到端测试"
echo "============================================"

echo ""
echo "=== 1. Admin 登录（POST /api/v1/auth/admin-login）==="
# Note: The route file doesn't have admin-login, so this will 404
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X POST "$BASE_URL/api/v1/auth/admin-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

echo ""
echo "=== 2. 运营商列表（GET /api/v1/admin/operators）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/operators" \
  -H "$AUTH"

echo ""
echo "=== 3. 创建运营商（POST /api/v1/admin/operators）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X POST "$BASE_URL/api/v1/admin/operators" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"name":"新锐智能科技","phone":"13600000099","email":"xinrui@test.com","company_name":"新锐智能科技有限公司","profit_share_rate":70,"contact_person":"赵六"}'

echo ""
echo "=== 4. 更新运营商（PUT /api/v1/admin/operators/:id）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X PUT "$BASE_URL/api/v1/admin/operators/op_001" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"name":"极速科技有限公司（已更新）","phone":"13800000011","company_name":"极速科技集团","profit_share_rate":85}'

echo ""
echo "=== 5. 运营商详情（GET /api/v1/admin/operators/:id）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/operators/op_001" \
  -H "$AUTH"

echo ""
echo "=== 6. 启用/禁用运营商（PATCH /api/v1/admin/operators/:id）==="
# 禁用
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X PATCH "$BASE_URL/api/v1/admin/operators/op_002" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"status":"disabled"}'

echo ""
echo "=== 7. 财务总览（GET /api/v1/admin/finance）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/finance" \
  -H "$AUTH"

echo ""
echo "=== 8. 结算列表（GET /api/v1/admin/finance/settlements）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/finance/settlements" \
  -H "$AUTH"

echo ""
echo "=== 9. 系统配置（GET /api/v1/admin/settings）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/settings" \
  -H "$AUTH"

echo ""
echo "=== 10. 考勤统计（GET /api/v1/attendance/stats）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/attendance/stats" \
  -H "$AUTH"

echo ""
echo "=== 11. 考勤记录（GET /api/v1/attendance）==="
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/attendance" \
  -H "$AUTH"

echo ""
echo "============================================"
echo "【API 测试完成】"
echo "============================================"
