import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  accuracy: number;
  accuracyText: string;
}

interface VenueInfo {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

type AttendanceStatus = 'unchecked' | 'checked' | 'loading';

function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('浏览器不支持GPS定位')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}

async function reverseGeocodeAddress(lat: number, lng: number): Promise<string> {
  try {
    const resp = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1', { headers: { 'Accept-Language': 'zh' } });
    const data = await resp.json();
    return data.display_name || lat.toFixed(6) + ', ' + lng.toFixed(6);
  } catch { return lat.toFixed(6) + ', ' + lng.toFixed(6); }
}

export default function AttendancePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AttendanceStatus>('unchecked');
  const [actionLoading, setActionLoading] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [venueInfo, setVenueInfo] = useState<VenueInfo | null>(null);
  const [checkInTime, setCheckInTime] = useState('');
  const [durationText, setDurationText] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [distanceFromVenue, setDistanceFromVenue] = useState<number | null>(null);
  const [withinRange, setWithinRange] = useState(false);
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
    try { await acquireLocation(); } catch {}
    try { await checkAttendanceStatus(); } catch {}

    const cached = localStorage.getItem('referee_venue');
    if (cached) { try { const p = JSON.parse(cached); setVenueInfo(p); if (location) checkDistance(p.latitude, p.longitude, location); } catch {} }
    setPageLoading(false);
  };

  const acquireLocation = async () => {
    try {
      const pos = await getCurrentPosition();
      const lat = pos.coords.latitude; const lng = pos.coords.longitude; const accuracy = pos.coords.accuracy;
      let address = lat.toFixed(6) + ', ' + lng.toFixed(6);
      try { address = await reverseGeocodeAddress(lat, lng); } catch {}
      const loc: LocationData = { latitude: lat, longitude: lng, address, accuracy, accuracyText: accuracy.toFixed(1) };
      setLocation(loc); setLocationReady(true);
      if (venueInfo) checkDistance(venueInfo.latitude, venueInfo.longitude, loc);
    } catch { setLocationReady(false); throw new Error('GPS定位失败'); }
  };

  const requestLocationPermission = () => { acquireLocation().catch(() => { setErrorMsg('定位失败，请检查GPS权限'); setTimeout(() => setErrorMsg(''), 2500); }); };

  const checkDistance = (vlat: number, vlng: number, loc: LocationData) => {
    const d = calcDistance(loc.latitude, loc.longitude, vlat, vlng);
    setDistanceFromVenue(Math.round(d)); setWithinRange(d <= 500);
  };

  const checkAttendanceStatus = async () => {
    try {
      const res: any = await api.get('/referees/attendance/status');
      if (res.checkedIn && res.checkinRecord) {
        const vi = {
          id: res.venueId || res.checkinRecord.venue_id || 'default_venue_001',
          name: res.venueName || '赛场',
          address: '',
          latitude: 0,
          longitude: 0
        };
        setStatus('checked'); setVenueInfo(vi); setCheckInTime(res.checkinRecord.checkin_at || '');
        const v = { id: vi.id, name: vi.name, address: vi.address, latitude: vi.latitude, longitude: vi.longitude };
        localStorage.setItem('referee_venue', JSON.stringify(v)); startCheckInTimer();
      }
    } catch (e: any) {
      console.error('[签到状态] 查询失败:', e?.message || e);
    }
  };

  const checkIn = async () => {
    if (!locationReady || !location) { setErrorMsg('请等待GPS定位完成'); return; }
    if (distanceFromVenue !== null && !withinRange) { alert('您当前位置距离赛场约 ' + distanceFromVenue + ' 米，超过签到范围。'); return; }
    setActionLoading(true); setStatus('loading');
    try {
      const res: any = await api.post('/referees/attendance/check-in', { latitude: location.latitude, longitude: location.longitude, address: location.address });
      const vi = res.venueInfo || { id: 'default_venue_001', name: location.address + '赛场', address: location.address, latitude: location.latitude, longitude: location.longitude };
      setStatus('checked'); setVenueInfo(vi); setCheckInTime(res.checkinAt || new Date().toISOString());
      const v = { id: vi.id, name: vi.name, address: vi.address, latitude: vi.latitude, longitude: vi.longitude };
      localStorage.setItem('referee_venue', JSON.stringify(v)); startCheckInTimer();
      setErrorMsg('✅ 签到成功！赛场已激活'); setTimeout(() => setErrorMsg(''), 2000);
    } catch (e: any) {
      console.error('[签到] 签到失败:', e);
      setStatus('unchecked');
    } finally { setActionLoading(false); }
  };

  const checkOut = async () => {
    setActionLoading(true);
    try {
      await api.post('/referees/attendance/check-out', { latitude: location?.latitude, longitude: location?.longitude });
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

  const fc = (c: number) => c.toFixed(6);
  const fd = (m: number) => m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm';

  if (pageLoading) return <div className="referee-loading-mask"><div className="referee-loading-spinner">加载中...</div></div>;

  return (
    <div className="referee-page">
      <div className="referee-card" style={{ marginBottom: 16 }}>
        <div className="referee-card-title">📍 GPS 定位{locationReady ? <span className="referee-tag referee-tag-success" style={{ marginLeft: 8 }}>已定位</span> : <span className="referee-tag referee-tag-warning" style={{ marginLeft: 8 }}>未定位</span>}</div>
        {location ? <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 6 }}><div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{location.address}</div><div style={{ fontSize: 12, color: '#999', fontFamily: "'SF Mono', Menlo, monospace", marginBottom: 2 }}>经度 {fc(location.longitude)} · 纬度 {fc(location.latitude)}</div><div style={{ fontSize: 11, color: '#3498db' }}>精度 ±{location.accuracyText}m</div></div>
          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'rgba(243,156,18,0.08)', borderRadius: 6 }}><span style={{ fontSize: 13, color: '#e67e22', flex: 1 }}>无法获取位置，请开启 GPS 权限</span><button className="referee-btn referee-btn-outline referee-btn-sm" onClick={requestLocationPermission}>开启定位</button></div>}
      </div>
      <div className="referee-card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}><div style={{ width: 16, height: 16, borderRadius: '50%', marginRight: 10, flexShrink: 0, background: status === 'checked' ? '#27ae60' : status === 'loading' ? '#e67e22' : '#999', boxShadow: status === 'checked' ? '0 0 10px rgba(39,174,96,0.5)' : undefined, animation: status === 'checked' ? 'referee-pulse 2s ease-in-out infinite' : status === 'loading' ? 'referee-pulse 1s ease-in-out infinite' : undefined }} /><span style={{ fontSize: 18, fontWeight: 600 }}>{status === 'checked' ? '已签到 · 赛场激活中' : status === 'loading' ? '签到中...' : '未签到'}</span></div>
        {status === 'unchecked' && <button className="referee-btn referee-btn-success referee-btn-lg" onClick={checkIn} disabled={actionLoading || !locationReady}>{locationReady ? '📍 签到激活赛场' : '🔍 等待GPS定位...'}</button>}
        {status === 'checked' && <button className="referee-btn referee-btn-danger referee-btn-lg" onClick={checkOut} disabled={actionLoading}>🏁 签退暂停赛场</button>}
        {status === 'loading' && <button className="referee-btn referee-btn-primary referee-btn-lg" disabled>⏳ 处理中...</button>}
      </div>
      {errorMsg && <div style={{ background: 'rgba(39,174,96,0.1)', color: '#27ae60', padding: '8px 16px', borderRadius: 8, fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{errorMsg}</div>}
      {status === 'checked' && venueInfo && <div className="referee-card" style={{ marginBottom: 16 }}><div className="referee-card-title">🏟 当前赛场</div><div><div className="referee-row-line"><span className="referee-row-label">赛场名称</span><span className="referee-row-value">{venueInfo.name}</span></div><div className="referee-row-line"><span className="referee-row-label">地址</span><span className="referee-row-value">{venueInfo.address}</span></div><div className="referee-row-line"><span className="referee-row-label">签到时间</span><span className="referee-row-value">{checkInTime}</span></div>{durationText && <div className="referee-row-line"><span className="referee-row-label">已签到</span><span className="referee-row-value" style={{ color: '#e94560', fontWeight: 600 }}>{durationText}</span></div>}{distanceFromVenue !== null && <div className="referee-row-line"><span className="referee-row-label">距赛场</span><span className="referee-row-value" style={{ color: withinRange ? '#27ae60' : '#e74c3c' }}>{fd(distanceFromVenue)}{withinRange ? ' ✅ 范围内' : ' ⚠️ 超出范围'}</span></div>}<div className="referee-row-line"><span className="referee-row-label">赛场状态</span><span className="referee-tag referee-tag-success">活跃</span></div></div></div>}

    </div>
  );
}
