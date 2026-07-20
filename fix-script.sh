#!/bin/bash
set -e
cd /Users/longshe/.openclaw/workspace/projects/robot-maze-race

# Fix 1a: MatchPage.tsx - add sessionStorage persistence for check-in state
cat > /tmp/patch1.py << 'PYEOF'
import re

with open('packages/web/src/pages/referee/MatchPage.tsx', 'r') as f:
    content = f.read()

# 1. Modify checkAttendanceStatus to read sessionStorage first
old1 = """  const checkAttendanceStatus = async () => {
    try {
      const res: any = await api.get('/referees/attendance/status');
      const isIn = res && res.checkedIn === true;
      setCheckedIn(isIn);
    } catch (e) {
      console.warn('[checkin] api error', e);
      setCheckedIn(false);
    } finally {
      setCheckingStatus(false);
    }
  };"""

new1 = """  const checkAttendanceStatus = async () => {
    // 先从 sessionStorage 恢复（解决切tab状态丢失问题）
    const cached = sessionStorage.getItem('referee_checkin_status');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.checkedIn) {
          setCheckedIn(true);
        }
      } catch {}
    }
    try {
      const res: any = await api.get('/referees/attendance/status');
      const isIn = res && res.checkedIn === true;
      setCheckedIn(isIn);
      if (isIn) {
        sessionStorage.setItem('referee_checkin_status', JSON.stringify({ checkedIn: true, at: Date.now() }));
      } else {
        sessionStorage.removeItem('referee_checkin_status');
      }
    } catch (e) {
      console.warn('[checkin] api error', e);
      // 接口异常时不覆盖缓存状态
      if (!cached) setCheckedIn(false);
    } finally {
      setCheckingStatus(false);
    }
  };"""

if old1 not in content:
    print("ERROR: old1 not found")
    exit(1)

content = content.replace(old1, new1)

# 2. Add sessionStorage after successful check-in
old2 = """      await api.post('/referees/attendance/check-in', { venueId: 'default_venue_001' });
      setCheckedIn(true);
      setErrorMsg('✅ 签到成功，赛场已激活');"""

new2 = """      await api.post('/referees/attendance/check-in', { venueId: 'default_venue_001' });
      setCheckedIn(true);
      sessionStorage.setItem('referee_checkin_status', JSON.stringify({ checkedIn: true, at: Date.now() }));
      setErrorMsg('✅ 签到成功，赛场已激活');"""

if old2 not in content:
    print("ERROR: old2 not found")
    exit(1)

content = content.replace(old2, new2)

# 3. WS venue_reopen -> save sessionStorage
old3 = """            case 'venue_reopen':
              setCheckedIn(true);
              setErrorMsg('✅ 赛场已激活');"""

new3 = """            case 'venue_reopen':
              setCheckedIn(true);
              sessionStorage.setItem('referee_checkin_status', JSON.stringify({ checkedIn: true, at: Date.now() }));
              setErrorMsg('✅ 赛场已激活');"""

if old3 not in content:
    print("ERROR: old3 not found")
    exit(1)

content = content.replace(old3, new3)

# 4. WS venue_closed -> remove sessionStorage
old4 = """            case 'venue_closed':
              setCheckedIn(false);
              clearTimer();"""

new4 = """            case 'venue_closed':
              setCheckedIn(false);
              sessionStorage.removeItem('referee_checkin_status');
              clearTimer();"""

if old4 not in content:
    print("ERROR: old4 not found")
    exit(1)

content = content.replace(old4, new4)

with open('packages/web/src/pages/referee/MatchPage.tsx', 'w') as f:
    f.write(content)

print("Fix 1a applied successfully")
PYEOF

python3 /tmp/patch1.py
echo "Done with fix 1a"
