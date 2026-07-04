#!/bin/bash
# Full E2E test - writes all results to /tmp/full_test_report.txt
set -e
OUT=/tmp/full_test_report.txt
> $OUT

log() { echo "$@" >> $OUT; echo "$@"; }

BASE="https://amberrobot.com.cn"
FAIL_COUNT=0
PASS_COUNT=0

# Helper: test an API and record result
test_api() {
  local label="$1" method="$2" url="$3" token="$4" data="$5"
  local code body auth_hdr
  if [ -n "$token" ]; then
    auth_hdr="-H Authorization: Bearer $token"
  fi
  body=$(curl -sk -o /tmp/_resp.json -w "%{http_code}" -X "$method" "$BASE$url" \
    -H 'Content-Type: application/json' ${auth_hdr:+"$auth_hdr"} \
    ${data:+-d "$data"} 2>/dev/null)
  code=$body
  local resp_preview=$(head -c 120 /tmp/_resp.json 2>/dev/null | tr '\n' ' ')
  
  case "$code" in
    500)
      log "  FAIL [500] $label $method $url -> $resp_preview"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    404)
      log "  FAIL [404] $label $method $url -> $resp_preview"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    401)
      log "  FAIL [401] $label $method $url"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      ;;
    *)
      log "  OK   [$code] $label $method $url"
      PASS_COUNT=$((PASS_COUNT + 1))
      ;;
  esac
}

# ==========================================
log "========================================="
log " 1. ADMIN BACKEND TESTS"
log "========================================="

# Login
log ""
log "--- Admin Login ---"
RESP=$(curl -sk -X POST $BASE/api/v1/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123"}')
AT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null || echo "")
if [ -z "$AT" ]; then
  log "  FAIL: Admin login failed! Response: $(echo $RESP | head -c 200)"
  exit 1
fi
log "  OK: Admin login success (token=${AT:0:30}...)"

# Auth
log ""
log "--- Auth Endpoints ---"
test_api "auth-me" GET "/api/v1/auth/me" "$AT"
test_api "auth-refresh" POST "/api/v1/auth/refresh" "$AT"
test_api "change-pwd" POST "/api/v1/auth/admin/change-password" "$AT" '{"oldPassword":"Admin123","newPassword":"Admin1234"}'

# Change back password
RESP2=$(curl -sk -X POST $BASE/api/v1/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin1234"}')
AT2=$(echo "$RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null || echo "")
curl -sk -X POST $BASE/api/v1/auth/admin/change-password -H "Authorization: Bearer $AT2" -H 'Content-Type: application/json' -d '{"oldPassword":"Admin1234","newPassword":"Admin123"}' > /dev/null 2>&1
RESP=$(curl -sk -X POST $BASE/api/v1/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123"}')
AT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null || echo "")
log "  OK: Password change cycle complete"

# Dashboard
log ""
log "--- Dashboard ---"
test_api "dash-stats" GET "/api/v1/admin/dashboard/stats" "$AT"
test_api "dash-rev-breakdown" GET "/api/v1/admin/dashboard/revenue-breakdown" "$AT"
test_api "dash-rev-region" GET "/api/v1/admin/dashboard/revenue-by-region" "$AT"
test_api "dash-top-ops" GET "/api/v1/admin/dashboard/top-operators" "$AT"
test_api "dash-region-rev" GET "/api/v1/admin/dashboard/region-revenue" "$AT"

# Operators
log ""
log "--- Operators ---"
test_api "ops-list" GET "/api/v1/admin/operators" "$AT"

# Finance
log ""
log "--- Finance ---"
test_api "fin-withdraws" GET "/api/v1/admin/finance/withdraws" "$AT"
test_api "fin-history" GET "/api/v1/admin/finance/history-withdraws" "$AT"
test_api "fin-export" GET "/api/v1/admin/finance/export" "$AT"

# Marketing
log ""
log "--- Marketing ---"
test_api "mkt-list" GET "/api/v1/admin/marketing" "$AT"
test_api "mkt-config" GET "/api/v1/admin/marketing/config" "$AT"

# Settings
log ""
log "--- Settings ---"
test_api "settings" GET "/api/v1/admin/settings" "$AT"

# Players
log ""
log "--- Players ---"
test_api "players" GET "/api/v1/admin/players" "$AT"

# Attendance
log ""
log "--- Attendance ---"
test_api "attendance" GET "/api/v1/admin/attendance" "$AT"
test_api "attendance-export" GET "/api/v1/admin/attendance/export" "$AT"

# RBAC
log ""
log "--- RBAC ---"
test_api "rbac-roles" GET "/api/v1/admin/rbac/roles" "$AT"
test_api "rbac-users" GET "/api/v1/admin/rbac/users" "$AT"

# Banks
log ""
log "--- Banks ---"
test_api "banks" GET "/api/v1/admin/banks" "$AT"

# Maps
log ""
log "--- Maps ---"
test_api "maps-provinces" GET "/api/v1/admin/maps/provinces" "$AT"

# Season
log ""
log "--- Season ---"
test_api "season-list" GET "/api/v1/admin/season/season" "$AT"

# Merchant
log ""
log "--- Merchant ---"
test_api "merchant-list" GET "/api/v1/admin/merchant" "$AT"

# Prize
log ""
log "--- Prize ---"
test_api "prize-list" GET "/api/v1/admin/prize/prize/list" "$AT"

# Task
log ""
log "--- Task ---"
test_api "task-list" GET "/api/v1/admin/task/task/list" "$AT"

# Upload
log ""
log "--- Upload ---"
test_api "upload-logo" POST "/api/v1/upload/admin-merchant-logo" "$AT" '{"image":"data:image/png;base64,iVBORw0KGgo="}'

# ==========================================
log ""
log "========================================="
log " 2. OPERATOR BACKEND TESTS"
log "========================================="

log ""
log "--- Finding Operator ---"
OP_PHONE=$(ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -N -e \"SELECT phone FROM operators WHERE status='active' LIMIT 1\"" 2>/dev/null | tr -d ' \n\r' || echo "")
log "  Operator phone: $OP_PHONE"

if [ -z "$OP_PHONE" ]; then
  log "  FAIL: No operator found in DB"
else
  # Set operator password
  HASH=$(cd /Users/longshe/.openclaw/workspace/projects/robot-maze-race/packages/server && node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('Admin123', 10))")
  ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -e \"UPDATE operators SET operator_username = '$OP_PHONE', operator_password_hash = '$HASH', password_change_required = 0 WHERE phone = '$OP_PHONE'\"" 2>/dev/null
  
  log "--- Operator Login (auth/login) ---"
  RESP=$(curl -sk -X POST $BASE/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$OP_PHONE\",\"password\":\"Admin123\",\"role\":\"operator\"}")
  OT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")
  
  if [ -z "$OT" ]; then
    log "--- Operator Login (operator/login) ---"
    RESP=$(curl -sk -X POST $BASE/api/v1/operator/login -H 'Content-Type: application/json' -d "{\"phone\":\"$OP_PHONE\",\"password\":\"Admin123\"}")
    OT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")
  fi
  
  if [ -z "$OT" ]; then
    log "  FAIL: Operator login failed"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    log "  OK: Operator login success"
    
    log ""
    log "--- Operator APIs ---"
    test_api "op-dashboard" GET "/api/v1/operator/dashboard" "$OT"
    test_api "op-profile" GET "/api/v1/operator/profile" "$OT"
    test_api "op-venues" GET "/api/v1/operator/venues" "$OT"
    test_api "op-rbac-roles" GET "/api/v1/operator/rbac/roles" "$OT"
    test_api "op-rbac-users" GET "/api/v1/operator/rbac/users" "$OT"
    test_api "op-fin-revenue" GET "/api/v1/operator/finance/revenue" "$OT"
    test_api "op-fin-settlements" GET "/api/v1/operator/finance/settlements" "$OT"
    test_api "op-fin-payments" GET "/api/v1/operator/finance/payments" "$OT"
    test_api "op-fin-overview" GET "/api/v1/operator/finance/overview" "$OT"
    test_api "op-mkt" GET "/api/v1/operator/marketing" "$OT"
    test_api "op-mkt-config" GET "/api/v1/operator/marketing/config" "$OT"
    test_api "op-players" GET "/api/v1/operator/players" "$OT"
    test_api "op-referee-apps" GET "/api/v1/operator/referee-applications" "$OT"
    test_api "op-merchant-list" GET "/api/v1/operator/merchant" "$OT"
  fi
fi

# ==========================================
log ""
log "========================================="
log " 3. MERCHANT BACKEND TESTS"
log "========================================="

log ""
log "--- Finding/Creating Merchant ---"
M_USER=$(ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -N -e \"SELECT username FROM merchant_admin LIMIT 1\"" 2>/dev/null | tr -d ' \n\r' || echo "")

if [ -z "$M_USER" ]; then
  log "  No merchant found, creating..."
  ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -e \"
    INSERT IGNORE INTO merchants (id, merchant_name, merchant_address, contact_phone, audit_status, created_at, updated_at) VALUES (UUID(), 'Test Merchant', 'Test Address', '13800000088', 1, NOW(), NOW());
    SET @mid = (SELECT id FROM merchants WHERE merchant_name = 'Test Merchant' LIMIT 1);
    INSERT IGNORE INTO merchant_invite_codes (id, merchant_id, code, used, created_at) VALUES (UUID(), @mid, 'INVITE-TEST-001', 0, NOW());
  \"" 2>/dev/null
  
  curl -sk -X POST $BASE/api/v1/merchant/auth/register -H 'Content-Type: application/json' -d '{"username":"testmerchant","password":"Admin123","inviteCode":"INVITE-TEST-001","phone":"13800000088","realName":"Test Merchant"}' > /dev/null 2>&1
  M_USER="testmerchant"
fi
log "  Merchant username: $M_USER"

log "--- Merchant Login ---"
RESP=$(curl -sk -X POST $BASE/api/v1/merchant/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$M_USER\",\"password\":\"Admin123\"}")
MT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -z "$MT" ]; then
  log "  FAIL: Merchant login failed. Response: $(echo $RESP | head -c 200)"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  log "  OK: Merchant login success"
  
  log ""
  log "--- Merchant APIs ---"
  test_api "merchant-profile" GET "/api/v1/merchant/auth/profile" "$MT"
  test_api "merchant-coupons" GET "/api/v1/merchant/coupon" "$MT"
  test_api "merchant-coupons-list" GET "/api/v1/merchant/coupon/list" "$MT"
  test_api "merchant-verify-stats" GET "/api/v1/merchant/verify/stats" "$MT"
  test_api "merchant-verify-records" GET "/api/v1/merchant/verify/records" "$MT"
fi

# ==========================================
log ""
log "========================================="
log " 4. REFEREE BACKEND TESTS"
log "========================================="

log ""
log "--- Finding/Creating Referee ---"
R_PHONE=$(ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -N -e \"SELECT r.phone FROM referees r JOIN users u ON r.user_id = u.id WHERE u.password IS NOT NULL AND u.password != '' LIMIT 1\"" 2>/dev/null | tr -d ' \n\r' || echo "")

if [ -z "$R_PHONE" ]; then
  log "  No referee found, creating..."
  R_PHONE="13800000077"
  curl -sk -X POST $BASE/api/v1/referees/create-by-operator -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"name\":\"Test Referee\",\"phone\":\"$R_PHONE\"}" > /dev/null 2>&1
  
  # Set password on the user record
  HASH=$(cd /Users/longshe/.openclaw/workspace/projects/robot-maze-race/packages/server && node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('Admin123', 10))")
  ssh -i ~/.ssh/cc-dev-test -o StrictHostKeyChecking=no cc-dev@175.24.200.63 "docker exec sasdt-test-mysql mysql -u sasdt_test -p'SasdtTest2026!Safe' sasdt_test -e \"UPDATE users u JOIN referees r ON u.id = r.user_id SET u.password = '$HASH', u.first_login = 0 WHERE r.phone = '$R_PHONE'\"" 2>/dev/null
  log "  Created referee: $R_PHONE"
fi
log "  Referee phone: $R_PHONE"

log "--- Referee Login ---"
RESP=$(curl -sk -X POST $BASE/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"phone\":\"$R_PHONE\",\"password\":\"Admin123\",\"role\":\"referee\"}")
RT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -z "$RT" ]; then
  log "  FAIL: Referee login failed. Response: $(echo $RESP | head -c 200)"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  log "  OK: Referee login success"
  
  log ""
  log "--- Referee APIs ---"
  test_api "referee-me" GET "/api/v1/auth/me" "$RT"
  test_api "referee-referees" GET "/api/v1/referees" "$RT"
  test_api "referee-venues" GET "/api/v1/venues" "$RT"
  test_api "referee-info" GET "/api/v1/player/info" "$RT"
  test_api "referee-packages" GET "/api/v1/packages" "$RT"
  test_api "referee-announce" GET "/api/v1/announcement" "$RT"
  test_api "referee-rank" GET "/api/v1/rank" "$RT"
  test_api "referee-season" GET "/api/v1/season" "$RT"
  test_api "referee-task" GET "/api/v1/task" "$RT"
fi

# ==========================================
log ""
log "========================================="
log " 5. SCREEN (PUBLIC) TESTS"
log "========================================="

log ""
test_api "screen-health" GET "/api/v1/health" ""
test_api "screen-venues" GET "/api/v1/venues" ""
test_api "screen-announce" GET "/api/v1/announcement" ""
test_api "screen-rank" GET "/api/v1/rank" ""
test_api "screen-season" GET "/api/v1/season" ""

# ==========================================
log ""
log "========================================="
log " SUMMARY"
log "========================================="
log "  Passed: $PASS_COUNT"
log "  Failed: $FAIL_COUNT"
log ""

if [ $FAIL_COUNT -gt 0 ]; then
  log "SOME TESTS FAILED - Review above for details"
else
  log "ALL TESTS PASSED"
fi
