import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface VenueInfo {
  id: string;
  name: string;
  address: string;
}

type AttendanceStatus = 'unchecked' | 'checked' | 'loading';

const CHECKIN_CACHE_KEY = 'referee_checkin_status';

function saveCheckinCache(vi: VenueInfo, checkinAt: string) {
  try {
    sessionStorage.setItem(CHECKIN_CACHE_KEY, JSON.stringify({ vi, checkinAt, ts: Date.now() }));
  } catch { /* ignore */ }
}

function loadCheckinCache(): { vi: VenueInfo; checkinAt: string } | null {
  try {
    const raw = sessionStorage.getItem(CHECKIN_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.vi && data?.checkinAt) return data;
    return null;
  } catch { return null; }
}

function clearCheckinCache() {
  try { sessionStorage.removeItem(CHECKIN_CACHE_KEY); } catch { /* ignore */ }
}

export default function AttendancePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AttendanceStatus>(() => {
    const cached = loadCheckinCache();
    return cached ? 'checked' : 'unchecked';
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [venueInfo, setVenueInfo] = useState<VenueInfo | null>(() => {
    const cached = loadCheckinCache();
    return cached?.vi || null;
  });
  const [checkInTime, setCheckInTime] = useState(() => {
    const cached = loadCheckinCache();
    return cached?.checkinAt || '';
  });
  const [durationText, setDurationText] = useState(() => {
    const cached = loadCheckinCache();
    if (cached?.checkinAt) {
      const elapsed = Date.now() - new Date(cached.checkinAt).getTime();
      const h = Math.floor(elapsed / 3600000);
      const m = Math.floor((elapsed % 3600000) / 60000);
      return h > 0 ? h + ' 小时 ' + m + ' 分钟' : m + ' 分钟';
    }
    return '';
  });
  const [pageLoading, setPageLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [scanError, setScanError] = useState('');
  const checkInTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/referee/login', { replace: true }); return; }
    destroyedRef.current = false;

    const cached = loadCheckinCache();
    if (cached) {
      // 从缓存恢复后立即启动计时器
      startCheckInTimer();
    }

    // 异步同步后端状态
    initPage();

    return () => { destroyedRef.current = true; stopCheckInTimer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initPage = async () => {
    setPageLoading(true);
    try { await checkAttendanceStatus(); } catch {}
    setPageLoading(false);
  };

  const checkAttendanceStatus = async () => {
    try {
      const res: any = await api.get('/referees/attendance/status');
      if (res.checkedIn && res.checkinRecord) {
        const vi = {
          id: res.venueId || res.checkinRecord.venue_id || 'default_venue_001',
          name: res.venueName || '赛场',
          address: res.venueInfo?.address || '',
        };
        setStatus('checked'); setVenueInfo(vi); setCheckInTime(res.checkinRecord.checkin_at || '');
        saveCheckinCache(vi, res.checkinRecord.checkin_at);
        startCheckInTimer();
      } else if (res.checkedIn === false || (!res.checkinRecord)) {
        // 后端说未签到，清除前端缓存
        setStatus('unchecked'); setVenueInfo(null); setCheckInTime(''); setDurationText('');
        clearCheckinCache(); stopCheckInTimer();
      }
    } catch (e: any) {
      console.error('[签到状态] 查询失败:', e?.message || e);
    }
  };

  const scanAndCheckIn = async (activationCode: string) => {
    setStatus('loading');
    try {
      const res: any = await api.post('/referees/attendance/check-in-by-qr', { activationCode });
      const vi = { id: res.venueId, name: res.venueName, address: '' };
      const checkinAt = res.checkinAt;
      setStatus('checked'); setVenueInfo(vi); setCheckInTime(checkinAt);
      setInputCode('');
      saveCheckinCache(vi, checkinAt); startCheckInTimer();
      setErrorMsg('✅ 签到成功！赛场已激活');
      setTimeout(() => setErrorMsg(''), 2000);
    } catch (e: any) {
      setStatus('unchecked');
      setScanError(e?.message || '激活码无效，请重试');
      setTimeout(() => setScanError(''), 3000);
    }
  };

  const handleCheckIn = () => {
    const code = inputCode.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setScanError('请输入6位数字激活码');
      return;
    }
    setScanError('');
    scanAndCheckIn(code);
  };

  const checkOut = async () => {
    const confirm = window.confirm(
      '⚠️ 确认要签退吗？\n\n' +
      '比赛时间未结束，签退后赛场将暂停运营，' +
      '选手将无法继续比赛。如需继续比赛请重新签到。\n\n' +
      '确定签退？'
    );
    if (!confirm) return;

    setActionLoading(true);
    try {
      await api.post('/referees/attendance/check-out');
      clearCheckinCache(); stopCheckInTimer(); setStatus('unchecked'); setVenueInfo(null); setCheckInTime(''); setDurationText('');
      setErrorMsg('🏁 签退成功！赛场已暂停'); setTimeout(() => setErrorMsg(''), 2000);
    } catch { clearCheckinCache(); setStatus('unchecked'); setVenueInfo(null); setCheckInTime(''); setDurationText(''); setErrorMsg('网络异常，签退已本地缓存'); setTimeout(() => setErrorMsg(''), 2000); }
    finally { setActionLoading(false); }
  };

  const startCheckInTimer = () => {
    stopCheckInTimer();
    checkInTimerRef.current = setInterval(() => {
      if (destroyedRef.current) { stopCheckInTimer(); return; }
      if (status !== 'checked' || !checkInTime) return;
      const elapsed = Date.now() - new Date(checkInTime).getTime();
      const h = Math.floor(elapsed / 3600000); const m = Math.floor((elapsed % 3600000) / 60000);
      setDurationText(h > 0 ? h + ' 小时 ' + m + ' 分钟' : m + ' 分钟');
    }, 30000);
  };

  const stopCheckInTimer = () => { if (checkInTimerRef.current) { clearInterval(checkInTimerRef.current); checkInTimerRef.current = null; } };

  if (pageLoading && status !== 'checked') return <div className="referee-loading-mask"><div className="referee-loading-spinner">加载中...</div></div>;

  return (
    <div className="referee-page">
      <div className="referee-card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', marginRight: 10, flexShrink: 0,
            background: status === 'checked' ? '#27ae60' : status === 'loading' ? '#e67e22' : '#999',
            boxShadow: status === 'checked' ? '0 0 10px rgba(39,174,96,0.5)' : undefined,
            animation: status === 'checked' ? 'referee-pulse 2s ease-in-out infinite' : status === 'loading' ? 'referee-pulse 1s ease-in-out infinite' : undefined,
          }} />
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            {status === 'checked' ? '已签到 · 赛场激活中' : status === 'loading' ? '签到中...' : '未签到'}
          </span>
        </div>

        {/* 未签到 — 直接显示输入区 */}
        {status === 'unchecked' && (
          <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
              请输入大屏上显示的6位数字激活码
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="输入6位数字激活码"
              maxLength={6}
              value={inputCode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                setInputCode(v);
                if (scanError) setScanError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCheckIn();
              }}
              style={{
                width: '100%', padding: '14px 12px', fontSize: 24,
                textAlign: 'center', letterSpacing: 10,
                borderRadius: 12, border: '2px solid #e0e0e0',
                boxSizing: 'border-box', outline: 'none',
                fontFamily: 'monospace',
              }}
            />
            {scanError && (
              <p style={{ color: '#e74c3c', fontSize: 13, marginTop: 8 }}>{scanError}</p>
            )}
            <button
              className="referee-btn referee-btn-success referee-btn-lg"
              onClick={handleCheckIn}
              disabled={actionLoading || inputCode.length !== 6}
              style={{ marginTop: 14 }}
            >
              ✅ 确认签到
            </button>
          </div>
        )}

        {status === 'checked' && <button className="referee-btn referee-btn-danger referee-btn-lg" onClick={checkOut} disabled={actionLoading}>🏁 签退暂停赛场</button>}
        {status === 'loading' && <button className="referee-btn referee-btn-primary referee-btn-lg" disabled>⏳ 处理中...</button>}
      </div>
      {errorMsg && <div style={{ background: 'rgba(39,174,96,0.1)', color: '#27ae60', padding: '8px 16px', borderRadius: 8, fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{errorMsg}</div>}
      {status === 'checked' && venueInfo && <div className="referee-card" style={{ marginBottom: 16 }}>
        <div className="referee-card-title">🏟 当前赛场</div>
        <div>
          <div className="referee-row-line"><span className="referee-row-label">赛场名称</span><span className="referee-row-value">{venueInfo.name}</span></div>
          <div className="referee-row-line"><span className="referee-row-label">地址</span><span className="referee-row-value">{venueInfo.address}</span></div>
          <div className="referee-row-line"><span className="referee-row-label">签到时间</span><span className="referee-row-value">{checkInTime ? new Date(checkInTime).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}</span></div>
          {durationText && <div className="referee-row-line"><span className="referee-row-label">已签到</span><span className="referee-row-value" style={{ color: '#e94560', fontWeight: 600 }}>{durationText}</span></div>}
          <div className="referee-row-line"><span className="referee-row-label">赛场状态</span><span className="referee-tag referee-tag-success">活跃</span></div>
        </div>
      </div>}
    </div>
  );
}
