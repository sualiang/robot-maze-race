cd /Users/longshe/.openclaw/workspace/projects/robot-maze-race
echo "=== operator-marketing.ts operator_members refs ==="
grep -n 'operator_members' packages/server/src/routes/operator-marketing.ts
echo ""
echo "=== referee-invite.ts operator_members refs ==="
grep -n 'operator_members' packages/server/src/routes/referee-invite.ts
echo ""
echo "=== referees.ts operator_members refs ==="
grep -n 'operator_members' packages/server/src/routes/referees.ts
echo ""
echo "=== queryOpOne remaining ==="
grep -rn 'queryOpOne' packages/server/src/routes/operator-marketing.ts packages/server/src/routes/referee-invite.ts packages/server/src/routes/referees.ts
echo ""
echo "=== DONE ==="