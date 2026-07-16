#!/bin/bash
cd /Users/longshe/.openclaw/workspace/projects/robot-maze-race

# Fix remaining member.role -> member.role_id
sed -i '' '
s/member\.role === /member.role_id === /g
s/\[member\.role\]/[member.role_id]/g
s/role_id: member\.role,/role_id: member.role_id,/g
s/admin_role_id: member\.role,/admin_role_id: member.role_id,/g
' packages/server/src/routes/auth.ts

# Verify
echo "Remaining member.role references:"
grep -n 'member\.role\b' packages/server/src/routes/auth.ts || echo "NONE - all fixed!"
echo ""
echo "Current member.role_id references:"
grep -c 'member\.role_id' packages/server/src/routes/auth.ts
