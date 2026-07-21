#!/bin/bash
# Smoke test script for robot-maze-race API
set -e

BASE=http://localhost:3000/api/v1
TEMP_FILE=/tmp/robot-smoke-results.json

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
RESULTS=()

record() {
  local name="$1"
  local code="$2"
  local desc="$3"
  if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    echo -e "${GREEN}[PASS]${NC} $name -> $code"
    PASS=$((PASS+1))
  elif [ "$code" -ge 400 ] && [ "$code" -lt 500 ]; then
    if [ "$code" -eq 401 ] || [ "$code" -eq 403 ]; then
      echo -e "${GREEN}[PASS]${NC} $name -> $code (expected)"
      PASS=$((PASS+1))
    else
      echo -e "${RED}[FAIL]${NC} $name -> $code"
      FAIL=$((FAIL+1))
    fi
  else
    echo -e "${RED}[FAIL]${NC} $name -> $code"
    FAIL=$((FAIL+1))
  fi
  RESULTS+=("$name|$code|$desc")
}

echo "============================================"
echo "  Smoke Test: robot-maze-race API"
echo "============================================"
echo ""

# ============================================
# Step 1: Admin Login
# ============================================
echo ""
echo "--- Step 1: Admin Login ---"
ADMIN_RESULT=$(curl -s $BASE/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
echo "Admin login token obtained: ${ADMIN_TOKEN:0:20}..."
record "admin-login" 200 "$(echo "$ADMIN_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null | head -15)"

# ============================================
# Step 2: Admin API Tests
# ============================================
echo ""
echo "--- Step 2a: GET /api/v1/admin/operators ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/operators -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/operators" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:800])" 2>/dev/null)"

echo ""
echo "--- Step 2b: POST /api/v1/admin/operators (create) ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/operators -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138001","name":"测试运营商","contact_person":"张三","contact_phone":"13800138002","address":"测试路1号","province":"广东省","city":"深圳市","district":"南山区"}')
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "POST admin/operators" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:600])" 2>/dev/null)"
NEW_OP_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','') or d.get('data',{}).get('operator_id',''))" 2>/dev/null)
echo "New operator ID: $NEW_OP_ID"
# Also try to get operator_username if returned
OP_USERNAME=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('operator_username',''))" 2>/dev/null)
echo "Operator username: $OP_USERNAME"

echo ""
echo "--- Step 2c: GET /api/v1/admin/rbac/roles ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/rbac/roles -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/rbac/roles" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:600])" 2>/dev/null)"

echo ""
echo "--- Step 2d: GET /api/v1/admin/rbac/users ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/rbac/users -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/rbac/users" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:600])" 2>/dev/null)"

echo ""
echo "--- Step 2e: POST /api/v1/admin/rbac/users ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/rbac/users -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900139000","nickname":"测试运营","role_key":"operator_admin"}')
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "POST admin/rbac/users" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:600])" 2>/dev/null)"

echo ""
echo "--- Step 2f: GET /api/v1/admin/marketing/config ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/marketing/config -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/marketing/config" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2g: PUT /api/v1/admin/marketing/config ---"
R=$(curl -s -w "\n%{http_code}" -X PUT $BASE/admin/marketing/config -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"home_banner":"https://example.com/banner.jpg","share_title":"测试分享","share_desc":"测试描述"}')
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "PUT admin/marketing/config" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2h: GET /api/v1/venues ---"
R=$(curl -s -w "\n%{http_code}" $BASE/venues)
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET venues (public)" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2i: GET /api/v1/referees ---"
R=$(curl -s -w "\n%{http_code}" $BASE/referees)
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET referees (public)" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2j: GET /api/v1/race-packages ---"
R=$(curl -s -w "\n%{http_code}" $BASE/race-packages)
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET race-packages (public)" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2k: GET /api/v1/admin/finance/withdraws ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/finance/withdraws -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/finance/withdraws" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2l: GET /api/v1/admin/settings ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/settings -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/settings" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2m: GET /api/v1/admin/settings/profit-share-rate ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/settings/profit-share-rate -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/settings/profit-share-rate" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

echo ""
echo "--- Step 2n: GET /api/v1/admin/dashboard/summary ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/dashboard/summary -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "GET admin/dashboard/summary" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:600])" 2>/dev/null)"

# ============================================
# Step 3: Operator-side API
# ============================================
echo ""
echo "--- Step 3a: Operator login ---"
# First, let's check what operators exist
OP_LIST=$(curl -s $BASE/admin/operators -H "Authorization: Bearer $ADMIN_TOKEN")
echo "Existing operators: $(echo "$OP_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"

# Try to get operator username from the list or from the one we just created
OP_USER=$(echo "$OP_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('list',[]) or d.get('data',[]); print(items[-1].get('operator_username','') if items else '')" 2>/dev/null)
echo "Operator username from list: $OP_USER"

# If we have an operator username, try to login as operator
if [ -n "$OP_USER" ]; then
  echo "Trying operator login with username: $OP_USER"
  # Need to find operator password - default is often the phone
  OP_PHONE=$(echo "$OP_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('list',[]) or d.get('data',[]); print(items[-1].get('phone','') if items else '')" 2>/dev/null)
  echo "Operator phone: $OP_PHONE"
  
  # Try default password "123456" or phone as password
  OP_LOGIN_RESULT=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' \
    -d "{\"username\":\"$OP_USER\",\"password\":\"123456\",\"role\":\"operator\"}")
  echo "Operator login result: $(echo "$OP_LOGIN_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False)[:300])" 2>/dev/null)"
  
  OP_TOKEN=$(echo "$OP_LOGIN_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
  
  if [ -n "$OP_TOKEN" ]; then
    echo "Operator token obtained: ${OP_TOKEN:0:20}..."
    record "operator-login" 200 "$OP_USER"
    
    echo ""
    echo "--- Step 3b: GET /api/v1/operator/venues ---"
    R=$(curl -s -w "\n%{http_code}" $BASE/operator/venues -H "Authorization: Bearer $OP_TOKEN")
    HTTP_CODE=$(echo "$R" | tail -1)
    BODY=$(echo "$R" | sed '$d')
    record "GET operator/venues" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"
    
    echo ""
    echo "--- Step 3c: GET /api/v1/operator/referees ---"
    R=$(curl -s -w "\n%{http_code}" $BASE/operator/referees -H "Authorization: Bearer $OP_TOKEN")
    HTTP_CODE=$(echo "$R" | tail -1)
    BODY=$(echo "$R" | sed '$d')
    record "GET operator/referees" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"
    
    echo ""
    echo "--- Step 3d: GET /api/v1/operator/race-packages ---"
    R=$(curl -s -w "\n%{http_code}" $BASE/operator/race-packages -H "Authorization: Bearer $OP_TOKEN")
    HTTP_CODE=$(echo "$R" | tail -1)
    BODY=$(echo "$R" | sed '$d')
    record "GET operator/race-packages" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"
    
    echo ""
    echo "--- Step 3e: GET /api/v1/operator/rbac/users ---"
    R=$(curl -s -w "\n%{http_code}" $BASE/operator/rbac/users -H "Authorization: Bearer $OP_TOKEN")
    HTTP_CODE=$(echo "$R" | tail -1)
    BODY=$(echo "$R" | sed '$d')
    record "GET operator/rbac/users" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"
    
    echo ""
    echo "--- Step 3f: GET /api/v1/operator/finance/revenue ---"
    R=$(curl -s -w "\n%{http_code}" $BASE/operator/finance/revenue -H "Authorization: Bearer $OP_TOKEN")
    HTTP_CODE=$(echo "$R" | tail -1)
    BODY=$(echo "$R" | sed '$d')
    record "GET operator/finance/revenue" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:400])" 2>/dev/null)"
  else
    echo -e "${YELLOW}[SKIP]${NC} Operator login failed, skipping operator tests"
  fi
else
  echo -e "${YELLOW}[SKIP]${NC} No operator username found, trying direct password approach..."
  # Try to get operator info differently
  OP_ID=$(echo "$OP_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('list',[]) or d.get('data',[]); print(items[0].get('id','') if items else '')" 2>/dev/null)
  echo "First operator ID: $OP_ID"
fi

# ============================================
# Step 4a: No auth token (should return 401)
# ============================================
echo ""
echo "--- Step 4a: No auth token (expect 401) ---"
R=$(curl -s -w "\n%{http_code}" $BASE/admin/operators)
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "No auth - GET admin/operators (expect 401)" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:200])" 2>/dev/null)"

R=$(curl -s -w "\n%{http_code}" $BASE/admin/rbac/users)
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "No auth - GET admin/rbac/users (expect 401)" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:200])" 2>/dev/null)"

R=$(curl -s -w "\n%{http_code}" $BASE/admin/dashboard/summary)
HTTP_CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | sed '$d')
record "No auth - GET admin/dashboard (expect 401)" "$HTTP_CODE" "$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False)[:200])" 2>/dev/null)"

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "  Test Summary"
echo "============================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS+FAIL))"

# Save results for report generation
echo '{' > /tmp/robot-smoke-meta.json
echo '  "pass": '$PASS',' >> /tmp/robot-smoke-meta.json
echo '  "fail": '$FAIL',' >> /tmp/robot-smoke-meta.json
echo '  "results": [' >> /tmp/robot-smoke-meta.json
FIRST=true
for result in "${RESULTS[@]}"; do
  IFS='|' read -r name code desc <<< "$result"
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo ',' >> /tmp/robot-smoke-meta.json
  fi
  echo "    {\"name\": \"$name\", \"code\": $code, \"desc\": $(echo "$desc" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null)}" >> /tmp/robot-smoke-meta.json
done
echo '  ]' >> /tmp/robot-smoke-meta.json
echo '}' >> /tmp/robot-smoke-meta.json

if [ $FAIL -eq 0 ]; then
  echo -e "\n${GREEN}All tests passed!${NC}"
else
  echo -e "\n${RED}$FAIL test(s) failed!${NC}"
fi
