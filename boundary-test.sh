#!/bin/bash
# ============================================
# 边界场景测试脚本
# ============================================

BASE_URL="http://localhost:3000"
NOPROXY="--noproxy localhost"

ADMIN_TOKEN=$(NODE_PATH=/Users/longshe/.openclaw/workspace/robot-maze-race/packages/server/node_modules node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign({ userId: 'admin_001', openid: 'admin_openid', role: 'admin' }, 'robot-maze-race-dev-secret', { expiresIn: '7d' }));
")

AUTH="Authorization: Bearer $ADMIN_TOKEN"
INVALID_AUTH="Authorization: Bearer invalid_token_12345"

echo "============================================"
echo "【第4步】边界场景测试"
echo "============================================"

echo ""
echo "=== 1. 缺少必填字段 ==="

echo ""
echo "1a. 创建运营商 - 缺少 name"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X POST "$BASE_URL/api/v1/admin/operators" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"phone":"13600000099","company_name":"测试公司"}'

echo ""
echo "1b. 创建参赛包 - 缺少 name"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X POST "$BASE_URL/api/v1/race-packages" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"price":29,"race_count":1}'

echo ""
echo "1c. 创建参赛包 - 缺少 price"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X POST "$BASE_URL/api/v1/race-packages" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"name":"测试包","race_count":1}'

echo ""
echo "1d. 创建赛场 - 缺少 name"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X POST "$BASE_URL/api/v1/venues" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"address":"测试地址"}'

echo ""
echo "1e. 更新运营商状态 - 无效的 status 值"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  -X PATCH "$BASE_URL/api/v1/admin/operators/op_001" \
  -H 'Content-Type: application/json' \
  -H "$AUTH" \
  -d '{"status":"banned"}'

echo ""
echo "=== 2. 使用无效 token 访问保护路由 ==="

echo ""
echo "2a. 运营商列表（无效 token）"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/operators" \
  -H "$INVALID_AUTH"

echo ""
echo "2b. 财务总览（无效 token）"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/finance" \
  -H "$INVALID_AUTH"

echo ""
echo "2c. 考勤记录（无效 token）"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/attendance" \
  -H "$INVALID_AUTH"

echo ""
echo "2d. 无 Authorization header"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/operators"

echo ""
echo "=== 3. 不存在资源的 404 ==="

echo ""
echo "3a. 运营商详情 - 不存在的 ID"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/admin/operators/nonexistent_id" \
  -H "$AUTH"

echo ""
echo "3b. 赛场详情 - 不存在的 ID"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/venues/nonexistent_id"

echo ""
echo "3c. 参赛包详情 - 不存在的 ID"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/race-packages/nonexistent_id"

echo ""
echo "3d. 不存在的 API 路径"
curl -s -w "\nHTTP_CODE: %{http_code}\n" $NOPROXY \
  "$BASE_URL/api/v1/nonexistent"

echo ""
echo "============================================"
echo "【边界场景测试完成】"
echo "============================================"
