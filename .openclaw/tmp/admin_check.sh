#!/bin/bash
ssh -i ~/.ssh/robot_server_925.pem -o StrictHostKeyChecking=no ubuntu@175.24.200.63 bash << 'REMOTE'
echo "=== CURL admin-login ==="
curl -v -X POST http://localhost:3000/api/v1/auth/admin-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' 2>&1 | tail -20

echo ""
echo "=== Docker logs (last 30) ==="
sudo docker logs robot-maze-race-backend-1 --tail 30 2>&1 | head -30

echo ""
echo "=== 直接node验证bcrypt ==="
sudo docker exec robot-maze-race-backend-1 node -e "
var bcrypt = require('bcryptjs');
var hash = '\$2b\$10\$5srKEw5p.QlQRz54KcawBumWwUKk7zFLZiM039n7M4wIeDJ6IMOUW';
console.log('matches admin123:', bcrypt.compareSync('admin123', hash));
"
REMOTE
