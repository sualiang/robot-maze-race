import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface VenueInfo {
  id: string;
  name: string;
  address: string;
}

type AttendanceStatus = 'unchecked' | 'checked' | 'loading';

export default function AttendancePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AttendanceStatus>('unchecked');
  const [actionLoading, setActionLoading] = useState(false);
  const [venueInfo, setVenueInfo] = useState<VenueInfo | null>(null);
  const [checkInTime, setCheckInTime] = useState('');
  const [durationText, setDurationText] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const checkInTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/referee/login', { replace: true }); return; }
    destroyedRef.current = false; initPage();
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
        localStorage.setItem('referee_venue', JSON.stringify(vi)); startCheckInTimer();
      }
    } catch (e: any) {
      console.error('[签到状态] 查询失败:', e?.message || e);
    }
  };

  const checkIn = async () => {
    setActionLoading(true); setStatus('loading');
    try {
      const res: any = await api.post('/referees/attendance/check-in', { venueId: venueInfo?.id || 'default_venue_001' });
      const vi = res.venueInfo || { id: 'default_venue_001', name: '默认赛场', address: '' };
      setStatus('checked'); setVenueInfo(vi); setCheckInTime(res.checkinAt || new Date().toISOString());
      localStorage.setItem('referee_venue', JSON.stringify(vi)); startCheckInTimer();
      setErrorMsg('✅ 签到成功！赛场已激活'); setTimeout(() => setErrorMsg(''), 2000);
    } catch (e: any) {
      console.error('[签到] 签到失败:', e);
      setStatus('unchecked');
    } finally { setActionLoading(false); }
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
      stopCheckInTimer(); setStatus('unchecked'); setVenueInfo(null); setCheckInTime(''); setDurationText('');
      setErrorMsg('🏁 签退成功！赛场已暂停'); setTimeout(() => setErrorMsg(''), 2000);
    } catch { setStatus('unchecked'); setVenueInfo(null); setCheckInTime(''); setDurationText(''); setErrorMsg('网络异常，签退已本地缓存'); setTimeout(() => setErrorMsg(''), 2000); }
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

  if (pageLoading) return <div className="referee-loading-mask"><div className="referee-loading-spinner">加载中...</div></div>;

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
        {status === 'unchecked' && <button className="referee-btn referee-btn-success referee-btn-lg" onClick={checkIn} disabled={actionLoading}>📍 签到激活赛场</button>}
        {status === 'checked' && <button className="referee-btn referee-btn-danger referee-btn-lg" onClick={checkOut} disabled={actionLoading}>🏁 签退暂停赛场</button>}
        {status === 'loading' && <button className="referee-btn referee-btn-primary referee-btn-lg" disabled>⏳ 处理中...</button>}
      </div>
      {errorMsg && <div style={{ background: 'rgba(39,174,96,0.1)', color: '#27ae60', padding: '8px 16px', borderRadius: 8, fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{errorMsg}</div>}
      {status === 'checked' && venueInfo && <div className="referee-card" style={{ marginBottom: 16 }}>
        <div className="referee-card-title">🏟 当前赛场</div>
        <div>
          <div className="referee-row-line"><span className="referee-row-label">赛场名称</span><span className="referee-row-value">{venueInfo.name}</span></div>
          <div className="referee-row-line"><span className="referee-row-label">地址</span><span className="referee-row-value">{venueInfo.address}</span></div>
          <div className="referee-row-line"><span className="referee-row-label">签到时间</span><span className="referee-row-value">{checkInTime}</span></div>
          {durationText && <div className="referee-row-line"><span className="referee-row-label">已签到</span><span className="referee-row-value" style={{ color: '#e94560', fontWeight: 600 }}>{durationText}</span></div>}
          <div className="referee-row-line"><span className="referee-row-label">赛场状态</span><span className="referee-tag referee-tag-success">活跃</span></div>
        </div>
      </div>}
    </div>
  );
}
