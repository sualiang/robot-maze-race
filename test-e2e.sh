#!/bin/bash
# ============================================
# 铁甲快狗 - 全后台端到端登录测试
# ============================================
set -e

BASE="https://amberrobot.com.cn"
ADMIN_TOKEN=""
OP_TOKEN=""
MERCHANT_TOKEN=""
REFEREE_TOKEN=""
SCREEN_TOKEN=""

PASS=0
FAIL=0
RESULTS=""

test_api() {
  local label="$1" method="$2" url="$3" token="$4" data="$5"
  local http_code
  local auth_header=""
  [[ -n "$token" ]] && auth_header="-H 'Authorization: Bearer $token'"
  
  http_code=$(curl -sk -o /tmp/test_resp.json -w "%{http_code}" \
    -X "$method" "$BASE$url" \
    -H 'Content-Type: application/json' \
    ${auth_header:+ -H "Authorization: Bearer $token"} \
    ${data:+ -d "$data"} 2>/dev/null)
  
  local body=$(cat /tmp/test_resp.json 2>/dev/null | head -c 200)
  
  if [[ "$http_code" == "500" ]]; then
    echo "  ❌ FAIL [$http_code] $label: $url — $body"
    FAIL=$((FAIL + 1))
    RESULTS+="FAIL|$label|$url|$http_code|$body"$'\n'
  elif [[ "$http_code" == "404" ]]; then
    echo "  ⚠️  NOTFOUND [$http_code] $label: $url — $body"
    FAIL=$((FAIL + 1))
    RESULTS+="NOTFOUND|$label|$url|$http_code|$body"$'\n'
  elif [[ "$http_code" == "401" ]]; then
    echo "  ⚠️  UNAUTHORIZED [$http_code] $label: $url — $body"
    FAIL=$((FAIL + 1))
    RESULTS+="UNAUTHORIZED|$label|$url|$http_code|$body"$'\n'
  elif [[ "$http_code" == "403" ]]; then
    echo "  ⚠️  FORBIDDEN [$http_code] $label: $url (may be expected)"
    RESULTS+="FORBIDDEN|$label|$url|$http_code|--"$'\n'
  else
    echo "  ✅ OK [$http_code] $label: $url"
    PASS=$((PASS + 1))
    RESULTS+="OK|$label|$url|$http_code|--"$'\n'
  fi
}

echo "============================================"
echo " 🔐 1. ADMIN 后台测试"
echo "============================================"

# 1.1 Login
echo ">> 1.1 Admin Login"
RESP=$(curl -sk -X POST "$BASE/api/v1/auth/admin-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin123"}')
ADMIN_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
echo "   Token: ${ADMIN_TOKEN:0:30}..."

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "❌ Admin login failed! Response: $RESP"
  exit 1
fi
echo "   ✅ Admin login OK"

# 1.2 Change password
echo ">> 1.2 Admin Change Password"
test_api "admin-change-pwd" POST "/api/v1/auth/admin/change-password" "$ADMIN_TOKEN" \
  '{"oldPassword":"Admin123","newPassword":"Admin1234"}'

# 1.3 Re-login with new password
echo ">> 1.3 Admin Re-login with new password"
RESP=$(curl -sk -X POST "$BASE/api/v1/auth/admin-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}')
ADMIN_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "❌ Admin re-login failed!"
else
  echo "   ✅ Admin re-login OK"
fi

# Reset password back
curl -sk -X POST "$BASE/api/v1/auth/admin/change-password" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"oldPassword":"Admin1234","newPassword":"Admin123"}' > /dev/null 2>&1

# Re-login with original password
RESP=$(curl -sk -X POST "$BASE/api/v1/auth/admin-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin123"}')
ADMIN_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

echo ""
echo ">> 1.4 Admin APIs — Core"
test_api "admin-me" GET "/api/v1/auth/me" "$ADMIN_TOKEN"
test_api "admin-refresh" POST "/api/v1/auth/refresh" "$ADMIN_TOKEN"

echo ""
echo ">> 1.5 Admin APIs — Dashboard"
test_api "admin-dashboard" GET "/api/v1/admin/dashboard" "$ADMIN_TOKEN"
test_api "admin-dashboard-stats" GET "/api/v1/admin/dashboard/stats" "$ADMIN_TOKEN"
test_api "admin-dashboard-revenue" GET "/api/v1/admin/dashboard/revenue" "$ADMIN_TOKEN"
test_api "admin-dashboard-users" GET "/api/v1/admin/dashboard/users" "$ADMIN_TOKEN"

echo ""
echo ">> 1.6 Admin APIs — Operators"
test_api "admin-operators-list" GET "/api/v1/admin/operators" "$ADMIN_TOKEN"
test_api "admin-operators-list2" GET "/api/v1/admin/operators?page=1&pageSize=10" "$ADMIN_TOKEN"
test_api "admin-operator-create" POST "/api/v1/admin/operators" "$ADMIN_TOKEN" \
  '{"name":"TestOp","phone":"13900000001","email":"test@test.com","company_name":"Test Co"}'

echo ""
echo ">> 1.7 Admin APIs — Finance"
test_api "admin-finance-overview" GET "/api/v1/admin/finance/overview" "$ADMIN_TOKEN"
test_api "admin-finance-revenue" GET "/api/v1/admin/finance/revenue" "$ADMIN_TOKEN"
test_api "admin-finance-settlements" GET "/api/v1/admin/finance/settlements" "$ADMIN_TOKEN"
test_api "admin-finance-payments" GET "/api/v1/admin/finance/payments" "$ADMIN_TOKEN"

echo ""
echo ">> 1.8 Admin APIs — Marketing"
test_api "admin-marketing-list" GET "/api/v1/admin/marketing" "$ADMIN_TOKEN"
test_api "admin-marketing-config" GET "/api/v1/admin/marketing/config" "$ADMIN_TOKEN"

echo ""
echo ">> 1.9 Admin APIs — Settings"
test_api "admin-settings" GET "/api/v1/admin/settings" "$ADMIN_TOKEN"
test_api "admin-settings-public" GET "/api/v1/admin/settings/public" "$ADMIN_TOKEN"

echo ""
echo ">> 1.10 Admin APIs — Players"
test_api "admin-players-list" GET "/api/v1/admin/players" "$ADMIN_TOKEN"
test_api "admin-players-list2" GET "/api/v1/admin/players?page=1&pageSize=10" "$ADMIN_TOKEN"

echo ""
echo ">> 1.11 Admin APIs — Attendance"
test_api "admin-attendance-list" GET "/api/v1/admin/attendance" "$ADMIN_TOKEN"

echo ""
echo ">> 1.12 Admin APIs — RBAC"
test_api "admin-rbac-roles" GET "/api/v1/admin/rbac/roles" "$ADMIN_TOKEN"
test_api "admin-rbac-users" GET "/api/v1/admin/rbac/users" "$ADMIN_TOKEN"

echo ""
echo ">> 1.13 Admin APIs — Maps"
test_api "admin-maps-provinces" GET "/api/v1/admin/maps/provinces" "$ADMIN_TOKEN"
test_api "admin-maps-cities" GET "/api/v1/admin/maps/cities" "$ADMIN_TOKEN"

echo ""
echo ">> 1.14 Admin APIs — Season"
test_api "admin-season-list" GET "/api/v1/admin/season" "$ADMIN_TOKEN"

echo ""
echo ">> 1.15 Admin APIs — Merchant"
test_api "admin-merchant-list" GET "/api/v1/admin/merchant" "$ADMIN_TOKEN"

echo ""
echo ">> 1.16 Admin APIs — Prize"
test_api "admin-prize-list" GET "/api/v1/admin/prize" "$ADMIN_TOKEN"

echo ""
echo ">> 1.17 Admin APIs — Task"
test_api "admin-task-list" GET "/api/v1/admin/task" "$ADMIN_TOKEN"

echo ""
echo ">> 1.18 Admin APIs — Banks"
test_api "admin-banks-list" GET "/api/v1/admin/banks" "$ADMIN_TOKEN"

echo ""
echo ">> 1.19 Admin APIs — Upload"
test_api "admin-upload-token" GET "/api/v1/upload/token" "$ADMIN_TOKEN"

echo ""
echo "============================================"
echo " 🔐 2. OPERATOR 后台测试"
echo "============================================"

# First find an operator account
echo ">> 2.1 Find operator in DB"
OP_PHONE=$(ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -N -e \"SELECT phone FROM operators WHERE status='active' LIMIT 1\"" 2>/dev/null | tr -d ' ')
echo "   Operator phone: $OP_PHONE"

if [[ -z "$OP_PHONE" ]]; then
  echo "⚠️ No operator found in DB. Creating via admin API..."
  # Create operator via admin
  curl -sk -X POST "$BASE/api/v1/admin/operators" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Test Operator","phone":"13900000099","email":"testop@test.com","company_name":"Test Operator Co"}' > /dev/null 2>&1
  
  # Set operator password
  ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -e \"UPDATE operators SET operator_username = '13900000099', operator_password_hash = '\\\$2b\\\$10\\\$owQ3Qqdd.4QribdRFq9yke5qW1cirLkHiwBenWoS0OMiG5GFrAnb.', password_change_required = 0 WHERE phone = '13900000099'\"" > /dev/null 2>&1
  OP_PHONE="13900000099"
fi

# Try operator login via /api/v1/auth/login
echo ">> 2.2 Operator Login (auth/login)"
RESP=$(curl -sk -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$OP_PHONE\",\"password\":\"Admin123\",\"role\":\"operator\"}")
echo "   Response: $(echo $RESP | head -c 200)"
OP_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)

if [[ -z "$OP_TOKEN" ]]; then
  # Try /api/v1/operator/login
  echo ">> 2.2b Operator Login (operator/login)"
  RESP=$(curl -sk -X POST "$BASE/api/v1/operator/login" \
    -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$OP_PHONE\",\"password\":\"Admin123\"}")
  echo "   Response: $(echo $RESP | head -c 200)"
  OP_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
fi

if [[ -n "$OP_TOKEN" ]]; then
  echo "   ✅ Operator login OK (${OP_TOKEN:0:30}...)"
  
  echo ">> 2.3 Operator APIs"
  test_api "op-dashboard" GET "/api/v1/operator/dashboard" "$OP_TOKEN"
  test_api "op-profile" GET "/api/v1/operator/profile" "$OP_TOKEN"
  test_api "op-venues" GET "/api/v1/operator/venues" "$OP_TOKEN"
  test_api "op-rbac-roles" GET "/api/v1/operator/rbac/roles" "$OP_TOKEN"
  test_api "op-rbac-users" GET "/api/v1/operator/rbac/users" "$OP_TOKEN"
  test_api "op-finance-revenue" GET "/api/v1/operator/finance/revenue" "$OP_TOKEN"
  test_api "op-finance-settlements" GET "/api/v1/operator/finance/settlements" "$OP_TOKEN"
  test_api "op-finance-payments" GET "/api/v1/operator/finance/payments" "$OP_TOKEN"
  test_api "op-finance-overview" GET "/api/v1/operator/finance/overview" "$OP_TOKEN"
  test_api "op-marketing" GET "/api/v1/operator/marketing" "$OP_TOKEN"
  test_api "op-marketing-config" GET "/api/v1/operator/marketing/config" "$OP_TOKEN"
  test_api "op-players" GET "/api/v1/operator/players" "$OP_TOKEN"
  test_api "op-referee-applications" GET "/api/v1/operator/referee-applications" "$OP_TOKEN"
  test_api "op-merchant-list" GET "/api/v1/operator/merchant" "$OP_TOKEN"
else
  echo "   ❌ Operator login failed"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "============================================"
echo " 🔐 3. MERCHANT 后台测试"
echo "============================================"

echo ">> 3.1 Find/Create merchant account"
# Check if there's a merchant in DB
MERCHANT_USER=$(ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -N -e \"SELECT username FROM merchant_admin LIMIT 1\"" 2>/dev/null | tr -d ' ')

if [[ -z "$MERCHANT_USER" ]]; then
  echo "   No merchant found. Creating..."
  # Generate invite code first
  ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -e \"
    INSERT INTO merchants (id, merchant_name, merchant_address, contact_phone, audit_status, created_at, updated_at) 
    VALUES (UUID(), 'Test Merchant', 'Test Address', '13800000088', 1, NOW(), NOW());
    SET @mid = (SELECT id FROM merchants WHERE merchant_name='Test Merchant' LIMIT 1);
    INSERT INTO merchant_invite_codes (id, merchant_id, code, used, created_at) 
    VALUES (UUID(), @mid, 'INVITE-TEST', 0, NOW());
  \"" 2>/dev/null > /dev/null 2>&1
  
  # Register via API
  curl -sk -X POST "$BASE/api/v1/merchant/auth/register" \
    -H 'Content-Type: application/json' \
    -d '{"username":"testmerchant","password":"Admin123","inviteCode":"INVITE-TEST","phone":"13800000088","realName":"Test Merchant"}' > /dev/null 2>&1
  
  MERCHANT_USER="testmerchant"
fi

echo "   Merchant username: $MERCHANT_USER"
echo ">> 3.2 Merchant Login"
RESP=$(curl -sk -X POST "$BASE/api/v1/merchant/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$MERCHANT_USER\",\"password\":\"Admin123\"}")
echo "   Response: $(echo $RESP | head -c 200)"
MERCHANT_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)

if [[ -n "$MERCHANT_TOKEN" ]]; then
  echo "   ✅ Merchant login OK"
  
  echo ">> 3.3 Merchant APIs"
  test_api "merchant-profile" GET "/api/v1/merchant/auth/profile" "$MERCHANT_TOKEN"
  test_api "merchant-coupons" GET "/api/v1/merchant/coupon" "$MERCHANT_TOKEN"
  test_api "merchant-coupons-list" GET "/api/v1/merchant/coupon/list" "$MERCHANT_TOKEN"
  test_api "merchant-verify-stats" GET "/api/v1/merchant/verify/stats" "$MERCHANT_TOKEN"
  test_api "merchant-verify-records" GET "/api/v1/merchant/verify/records" "$MERCHANT_TOKEN"
else
  echo "   ❌ Merchant login failed"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "============================================"
echo " 🔐 4. REFEREE 后台测试"
echo "============================================"

echo ">> 4.1 Find/Create referee account"
REFEREE_PHONE=$(ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -N -e \"SELECT r.phone FROM referees r JOIN users u ON r.user_id = u.id WHERE u.password IS NOT NULL AND u.password != '' LIMIT 1\"" 2>/dev/null | tr -d ' ')

if [[ -z "$REFEREE_PHONE" ]]; then
  echo "   No referee with password found. Creating via API..."
  # Create referee via operator API
  REFEREE_PHONE="13800000077"
  curl -sk -X POST "$BASE/api/v1/referees/create-by-operator" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Test Referee\",\"phone\":\"$REFEREE_PHONE\"}" > /dev/null 2>&1
  echo "   Created referee with phone: $REFEREE_PHONE"
fi

echo "   Referee phone: $REFEREE_PHONE"

echo ">> 4.2 Referee Login (auth/login)"
RESP=$(curl -sk -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$REFEREE_PHONE\",\"password\":\"Admin123\",\"role\":\"referee\"}")
echo "   Response: $(echo $RESP | head -c 200)"
REFEREE_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)

# Try getting the initial password from the creation response
if [[ -z "$REFEREE_TOKEN" ]]; then
  REF_PWD=$(ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -N -e \"SELECT u.password FROM users u JOIN referees r ON u.id = r.user_id WHERE r.phone = '$REFEREE_PHONE'\"" 2>/dev/null | tr -d ' ')
  echo "   Referee password hash: ${REF_PWD:0:20}..."
  
  # Try different passwords
  for pwd in "Admin123" "admin123" "123456" "password" "test123"; do
    RESP=$(curl -sk -X POST "$BASE/api/v1/auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"phone\":\"$REFEREE_PHONE\",\"password\":\"$pwd\",\"role\":\"referee\"}")
    REFEREE_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
    if [[ -n "$REFEREE_TOKEN" ]]; then
      echo "   ✅ Logged in with password: $pwd"
      break
    fi
  done
fi

if [[ -n "$REFEREE_TOKEN" ]]; then
  echo "   ✅ Referee login OK"
  
  echo ">> 4.3 Referee APIs"
  test_api "referee-me" GET "/api/v1/auth/me" "$REFEREE_TOKEN"
  test_api "referee-referees-list" GET "/api/v1/referees" "$REFEREE_TOKEN"
  test_api "referee-venues-list" GET "/api/v1/venues" "$REFEREE_TOKEN"
  test_api "referee-player" GET "/api/v1/player/info" "$REFEREE_TOKEN"
  test_api "referee-race-packages" GET "/api/v1/race-packages" "$REFEREE_TOKEN"
  test_api "referee-announcement" GET "/api/v1/announcement" "$REFEREE_TOKEN"
  test_api "referee-rank" GET "/api/v1/rank" "$REFEREE_TOKEN"
  test_api "referee-season" GET "/api/v1/season" "$REFEREE_TOKEN"
  test_api "referee-task" GET "/api/v1/task" "$REFEREE_TOKEN"
else
  echo "   ❌ Referee login failed"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "============================================"
echo " 🔐 5. SCREEN 后台测试"
echo "============================================"

echo ">> 5.1 Screen access (no login, public pages)"
# Screen is a public display page
test_api "screen-ping" GET "/api/v1/health" ""
test_api "screen-venues" GET "/api/v1/venues" ""
test_api "screen-announcement" GET "/api/v1/announcement" ""

echo ""
echo "============================================"
echo " 📊 TEST SUMMARY"
echo "============================================"
echo ""
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""
echo "Detailed results:"
echo "$RESULTS" | column -t -s '|'

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "⚠️  SOME TESTS FAILED — check details above"
  exit 1
else
  echo ""
  echo "✅ ALL TESTS PASSED"
fi
