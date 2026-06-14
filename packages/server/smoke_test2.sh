#!/bin/bash
# Comprehensive smoke test script for robot-maze-race API
BASE=http://localhost:3000/api/v1

# Step 1: Fresh admin login
echo "=== Step 1: Admin Login ==="
ADMIN_RESULT=$(curl -s $BASE/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))")
echo "Admin login: OK (token length=${#ADMIN_TOKEN})"

# Step 2a: GET admin/operators
echo ""
echo "=== Step 2a: GET /api/v1/admin/operators ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/operators -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2b: POST admin/operators (create new with fresh phone)
echo ""
echo "=== Step 2b: POST /api/v1/admin/operators ==="
PHONE="1365555$(shuf -i 1000-9999 -n 1)"
R=$(curl -s -w "\n%{http_code}" -X POST $BASE/admin/operators \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"name\":\"冒烟测试运营商\",\"contact_person\":\"李四\",\"contact_phone\":\"$PHONE\",\"address\":\"测试路100号\",\"province\":\"广东省\",\"city\":\"广州市\",\"district\":\"天河区\"}")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"
NEW_OP_ACCOUNT=$(echo "$R" | sed '$d' | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('account',''))")
NEW_OP_PWD=$(echo "$R" | sed '$d' | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('password',''))")
echo "New operator account: $NEW_OP_ACCOUNT, password: $NEW_OP_PWD"

# Step 2c: GET admin/rbac/roles
echo ""
echo "=== Step 2c: GET /api/v1/admin/rbac/roles ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/rbac/roles -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2d: GET admin/rbac/users
echo ""
echo "=== Step 2d: GET /api/v1/admin/rbac/users ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/rbac/users -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2e: POST admin/rbac/users (use role_id instead of role_key)
echo ""
echo "=== Step 2e: POST /api/v1/admin/rbac/users ==="
R=$(curl -s -w "\n%{http_code}" -X POST $BASE/admin/rbac/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13788880001","nickname":"测试运营人员","role_id":"role-admin"}')
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2f: GET admin/marketing/config
echo ""
echo "=== Step 2f: GET /api/v1/admin/marketing/config ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/marketing/config -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2g: PUT admin/marketing/config
echo ""
echo "=== Step 2g: PUT /api/v1/admin/marketing/config ==="
R=$(curl -s -w "\n%{http_code}" -X PUT $BASE/admin/marketing/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"home_banner":"https://example.com/banner.jpg","share_title":"冒烟测试分享","share_desc":"冒烟测试描述"}')
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2h: GET /api/v1/venues (public)
echo ""
echo "=== Step 2h: GET /api/v1/venues (public) ==="
R=$(curl -s -w "\n%{http_code}" $BASE/venues)
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2i: GET /api/v1/referees (public)
echo ""
echo "=== Step 2i: GET /api/v1/referees (public) ==="
R=$(curl -s -w "\n%{http_code}" $BASE/referees)
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2j: GET /api/v1/race-packages (public)
echo ""
echo "=== Step 2j: GET /api/v1/race-packages (public) ==="
R=$(curl -s -w "\n%{http_code}" $BASE/race-packages)
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2k: GET admin/finance/withdraws
echo ""
echo "=== Step 2k: GET /api/v1/admin/finance/withdraws ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/finance/withdraws -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2l: GET admin/settings
echo ""
echo "=== Step 2l: GET /api/v1/admin/settings ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/settings -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2m: GET admin/settings/profit-share-rate
echo ""
echo "=== Step 2m: GET /api/v1/admin/settings/profit-share-rate ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/settings/profit-share-rate -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 2n: GET admin/dashboard/stats (actual path, not /summary)
echo ""
echo "=== Step 2n: GET /api/v1/admin/dashboard/stats ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/dashboard/stats -H "Authorization: Bearer $ADMIN_TOKEN")
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 3a: Operator login (using phone as username, password from creation)
echo ""
echo "=== Step 3a: Operator Login ==="
OP_LOGIN=$(curl -s -w "\n%{http_code}" $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$NEW_OP_ACCOUNT\",\"password\":\"$NEW_OP_PWD\",\"role\":\"operator\"}")
OP_CODE=$(echo "$OP_LOGIN" | tail -1)
echo "[code: $OP_CODE] $(echo "$OP_LOGIN" | sed '$d')"
OP_TOKEN=$(echo "$OP_LOGIN" | sed '$d' | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)

if [ -n "$OP_TOKEN" ]; then
  # Step 3b: GET operator/venues
  echo ""
  echo "=== Step 3b: GET /api/v1/operator/venues ==="
  R=$(curl -s -w "\n%{http_code}" $BASE/operator/venues -H "Authorization: Bearer $OP_TOKEN")
  echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

  # Step 3c: GET operator/referees
  echo ""
  echo "=== Step 3c: GET /api/v1/operator/referees ==="
  R=$(curl -s -w "\n%{http_code}" $BASE/operator/referees -H "Authorization: Bearer $OP_TOKEN")
  echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

  # Step 3d: GET operator/race-packages
  echo ""
  echo "=== Step 3d: GET /api/v1/operator/race-packages ==="
  R=$(curl -s -w "\n%{http_code}" $BASE/operator/race-packages -H "Authorization: Bearer $OP_TOKEN")
  echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

  # Step 3e: GET operator/rbac/users
  echo ""
  echo "=== Step 3e: GET /api/v1/operator/rbac/users ==="
  R=$(curl -s -w "\n%{http_code}" $BASE/operator/rbac/users -H "Authorization: Bearer $OP_TOKEN")
  echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

  # Step 3f: GET operator/finance/revenue
  echo ""
  echo "=== Step 3f: GET /api/v1/operator/finance/revenue ==="
  R=$(curl -s -w "\n%{http_code}" $BASE/operator/finance/revenue -H "Authorization: Bearer $OP_TOKEN")
  echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"
else
  echo "[SKIP] Operator login failed, skipping operator API tests"
fi

# Step 4a: No auth token (should return 401)
echo ""
echo "=== Step 4a: No auth token (expect 401) ==="
R=$(curl -s -w "\n%{http_code}" $BASE/admin/operators)
echo "GET admin/operators (no auth) -> [code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

R=$(curl -s -w "\n%{http_code}" $BASE/admin/rbac/users)
echo "GET admin/rbac/users (no auth) -> [code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

R=$(curl -s -w "\n%{http_code}" $BASE/admin/dashboard/stats)
echo "GET admin/dashboard/stats (no auth) -> [code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

R=$(curl -s -w "\n%{http_code}" $BASE/admin/finance/withdraws)
echo "GET admin/finance/withdraws (no auth) -> [code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

# Step 4b: Create venue with non-existent operator_id
echo ""
echo "=== Step 4b: Create venue with non-existent operator_id ==="
R=$(curl -s -w "\n%{http_code}" -X POST $BASE/venues \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"测试场馆","operator_id":"non-existent-id-12345","address":"测试地址","province":"广东省","city":"深圳市","district":"南山区"}')
echo "[code: $(echo "$R" | tail -1)] $(echo "$R" | sed '$d')"

echo ""
echo "=== ALL TESTS COMPLETE ==="
