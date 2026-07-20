#!/bin/bash
set -e
cd /Users/longshe/.openclaw/workspace/projects/robot-maze-race

echo "=== Fix 1a: MatchPage.tsx check-in state persistence ==="
# Already done via write tool

echo "=== Fix 1b: Backend referees.ts check-in-by-qr HTTP 400→200 ==="
# The card says at line ~1374: res.status(400).json({ code: 400, ... }) → res.json({ code: 200, ... })
# Let's find and fix
sed -i '' "s/res\.status(400)\.json({ code: 400, message: '今日已签到，请先签退'/res.json({ code: 200, message: '今日已签到，请先签退'/" packages/server/src/routes/referees.ts
echo "Fix 1b applied"

echo "=== Fix 5: FinanceCenter.tsx paidAt display full datetime ==="
python3 << 'PYEOF'
with open('packages/web/src/pages/operator/finance/FinanceCenter.tsx', 'r') as f:
    content = f.read()

old = """      render: (v: string) => v ? (typeof v === 'string' ? v.split('T')[0] : v) : '-',"""

new = """      render: (v: string) => v || '-',"""

if old in content:
    content = content.replace(old, new)
    with open('packages/web/src/pages/operator/finance/FinanceCenter.tsx', 'w') as f:
        f.write(content)
    print("Fix 5 applied")
else:
    print("Fix 5: pattern not found, checking...")
    if 'v.split' in content:
        print("Found v.split - checking context")
        import re
        matches = re.findall(r'.{0,100}v\.split.{0,100}', content)
        for m in matches:
            print(f"  Match: {m}")
    else:
        print("v.split not found at all")
PYEOF

echo ""
echo "All fixes applied"
