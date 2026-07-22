import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useOperatorContext } from '../../hooks/useOperatorContext';
import NoContextBanner from '../../components/NoContextBanner';

interface Racer {
  id: string;
  nickname: string;
  name?: string;
  robotName: string;
  attempt: number;
  remainingRaces: number;
  avatarUrl?: string;
  isCurrent?: boolean;
  race_type?: string;
}

type MatchStatus = 'idle' | 'running' | 'paused' | 'finished' | 'malfunctioned';

function padZero(n: number): string { return n < 10 ? '0' + n : String(n); }

function formatFullTime(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return padZero(min) + ':' + padZero(sec) + '.' + padZero(cs);
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return padZero(min) + ':' + padZero(sec);
}

function formatMs(ms: number): string {
  return '.' + padZero(Math.floor((ms % 1000) / 10));
}

export default function MatchPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Racer[]>([]);
  const [currentRacer, setCurrentRacer] = useState<Racer | null>(null);
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [maxTimeout] = useState(300);
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [showDcAlert, setShowDcAlert] = useState(false);
  const localTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { hasContext, loading: contextLoading } = useOperatorContext();
  const destroyedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const prevCheckedInRef = useRef<boolean | null>(null);
  const checkedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/referee/login', { replace: true }); return; }
    destroyedRef.current = false;
    loadQueue();
    checkAttendanceStatus();
    connectWebSocket();
    // 定期检查签到状态（兼容签到页签到后不刷新页面的场景）
    const checkinPoll = setInterval(() => { checkAttendanceStatus(); }, 2000);
    return () => { destroyedRef.current = true; clearInterval(checkinPoll); if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.onerror = null; wsRef.current.onmessage = null; wsRef.current.onopen = null; wsRef.current.close(); wsRef.current = null; } if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); if (localTimerRef.current) { clearInterval(localTimerRef.current); localTimerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听签到状态变化：true→false 时（离线签退/轮询检测到签退），清除排队和计时
  useEffect(() => {
    checkedInRef.current = checkedIn;
    const wasIn = prevCheckedInRef.current;
    prevCheckedInRef.current = checkedIn;
    // 大屏恢复连接 自动关闭弹窗
    if (wsConnected && checkedIn === true && showDcAlert) {
      setShowDcAlert(false);
    }
    if (wasIn === true && checkedIn === false) {
      setQueue([]);
      setCurrentRacer(null);
      setStatus('idle');
      setElapsed(0);
      setPausedElapsed(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedIn]);

  const connectWebSocket = useCallback(() => {
    // 通过 Vite proxy 连接，避免直连后端端口
    // 直接连后端 WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = import.meta.env.VITE_REFEREE_WS_URL || `${protocol}://${window.location.host}/ws/referee`;
    if (wsRef.current) wsRef.current.close();
    try {
      const ws = new WebSocket(wsUrl); wsRef.current = ws;
      ws.onopen = () => {
        console.log('[WS] 连接成功'); setWsConnected(true); reconnectCountRef.current = 0;
        const token = localStorage.getItem('token');
        if (token) ws.send(JSON.stringify({ event: 'auth', data: { token }, timestamp: Date.now() }));
        const hb = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'ping', data: {}, timestamp: Date.now() }));
          else clearInterval(hb);
        }, 30000);
      };
      ws.onmessage = (event) => {
        try { const msg = JSON.parse(event.data); if (destroyedRef.current) return;
          switch (msg.event) {
            case 'queue_update': setQueue(msg.data.queue || []); setCurrentRacer(msg.data.currentRacer || null); break;
            case 'timer_sync':
              if (typeof msg.data.elapsed === 'number') {
                const newStatus = msg.data.status;
                if (newStatus === 'running') {
                  // 本地 50ms 动画补偿：服务端瞬时值为基准，客户端帧间累加
                  const serverElapsed = msg.data.elapsed;
                  const localStart = Date.now();
                  setElapsed(serverElapsed);
                  setStatus('running');
                  // 清除旧定时器，启动新的
                  if (localTimerRef.current) clearInterval(localTimerRef.current);
                  localTimerRef.current = setInterval(() => {
                    setElapsed(serverElapsed + (Date.now() - localStart));
                  }, 50);
                } else {
                  // 非 running 状态：停本地定时器，设最终值
                  if (localTimerRef.current) { clearInterval(localTimerRef.current); localTimerRef.current = null; }
                  setElapsed(msg.data.elapsed);
                  setStatus(newStatus);
                }
              }
              break;
            case 'result_push': setErrorMsg(msg.data.nickname + ': ' + formatFullTime(msg.data.finishTimeMs) + (msg.data.isTimeout ? ' (超时)' : '')); setTimeout(() => setErrorMsg(''), 2500); loadQueue(true); break;
            case 'racer_ready': setErrorMsg(msg.data.nickname + ' 已就位'); setTimeout(() => setErrorMsg(''), 2000); break;
            case 'venue_reopen':
              setCheckedIn(true);
              sessionStorage.setItem('referee_checkin_status', JSON.stringify({ checkedIn: true, at: Date.now() }));
              setErrorMsg('✅ 赛场已激活');
              setTimeout(() => setErrorMsg(''), 2000);
              loadQueue();
              break;
            case 'venue_closed':
              setCheckedIn(false);
              sessionStorage.removeItem('referee_checkin_status');
              // 赛场关闭，停止计时
              if (localTimerRef.current) { clearInterval(localTimerRef.current); localTimerRef.current = null; }
              setQueue([]);
              setCurrentRacer(null);
              setStatus('idle');
              setElapsed(0);
              setPausedElapsed(0);
              setErrorMsg('赛场已关闭，排队信息已清除');
              setTimeout(() => setErrorMsg(''), 3000);
              break;
          }
        } catch {}
      };
      ws.onclose = () => { console.log('[WS] 关闭'); setWsConnected(false); if (checkedInRef.current === true) { setShowDcAlert(true); api.post('/referees/attendance/check-out').catch(() => {}); setCheckedIn(false); sessionStorage.removeItem('referee_checkin_status'); } if (!destroyedRef.current && reconnectCountRef.current < 10) { reconnectCountRef.current++; reconnectTimerRef.current = setTimeout(() => { if (!destroyedRef.current) connectWebSocket(); }, 3000); } };
      ws.onerror = () => setWsConnected(false);
    } catch { console.warn('[WS] 不可用'); }
  }, []);

  const loadQueue = async (skipCurrentRacer?: boolean) => {
    setPageLoading(true);
    try { const res: any = await api.get('/referees/match/queue'); setQueue(res.queue || []); if (!skipCurrentRacer) setCurrentRacer(res.currentRacer || null); }
    catch { setErrorMsg('加载失败，请重试'); } finally { setPageLoading(false); }
  };

  const checkAttendanceStatus = async () => {
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
  };

  const handleSignIn = async () => {
    setActionLoading(true);
    try {
      await api.post('/referees/attendance/check-in', { venueId: 'default_venue_001' });
      setCheckedIn(true);
      sessionStorage.setItem('referee_checkin_status', JSON.stringify({ checkedIn: true, at: Date.now() }));
      setErrorMsg('✅ 签到成功，赛场已激活');
      setTimeout(() => setErrorMsg(''), 2000);
      loadQueue();
    } catch {
      setErrorMsg('签到失败，请重试');
    }
    setActionLoading(false);
  };

  const selectRacer = async (racerId: string) => {
    const racer = queue.find((r) => r.id === racerId); if (!racer) return;
    setActionLoading(true);
    try { await api.post('/referees/match/select-racer', { racerId }); setCurrentRacer(racer); setStatus('idle'); setElapsed(0); setPausedElapsed(0); setErrorMsg('已叫号: ' + (racer.nickname || racer.name)); setTimeout(() => setErrorMsg(''), 2000); loadQueue(true); }
    catch {} finally { setActionLoading(false); }
  };

  const startRace = async () => {
    if (!currentRacer) { setErrorMsg('请先选择比赛选手'); return; }
    if (status === 'running') { setErrorMsg('比赛已在进行中'); return; }
    setActionLoading(true);
    try {
      await api.post('/referees/match/start', { racerId: currentRacer.id });
      loadQueue();
      setStatus('running');
      setPausedElapsed(0);
      setElapsed(0);
    } catch {} finally { setActionLoading(false); }
  };

  const pauseRace = async () => { if (status !== 'running') return; setStatus('paused'); setPausedElapsed(elapsed); try { await api.post('/referees/match/pause', { racerId: currentRacer?.id, elapsed }); loadQueue(); } catch {}; setErrorMsg('⏸ 已暂停'); setTimeout(() => setErrorMsg(''), 1500); };

  const endRace = async () => {
    if (status !== 'running' && status !== 'paused') return;
    const finalTime = elapsed;
    setActionLoading(true);
    try {
      await api.post('/referees/match/end', { racerId: currentRacer?.id, status: 'finished' });
      setErrorMsg('🏁 ' + formatFullTime(finalTime));
      setTimeout(() => setErrorMsg(''), 2500);
      setStatus('finished');
      setPausedElapsed(0);
      loadQueue();
    } catch {
      setErrorMsg('网络异常，结果已记录到本地');
      setTimeout(() => setErrorMsg(''), 2000);
      setStatus('finished');
      setPausedElapsed(0);
      loadQueue();
    }
    finally { setActionLoading(false); }
  };

  const handleMalfunction = () => {
    if (!currentRacer) return;
    const racerName = currentRacer.nickname || currentRacer.name; const ri = currentRacer.id;
    if (!window.confirm(racerName + ' 的机器狗发生故障？\n\n• 选手保留参赛次数\n• 计时归零重新开始\n• 当前计时作废')) { if (!destroyedRef.current) { setStatus('running'); } return; }
    setActionLoading(true);
    api.post('/referees/match/malfunction', { racerId: ri }).then(() => {
      setElapsed(0);
      setPausedElapsed(0);
      setStatus('malfunctioned');
      setErrorMsg('故障已登记，**' + racerName + '** 请重新开始');
      loadQueue();
    }).catch(() => { setErrorMsg('网络异常，操作已本地缓存'); }).finally(() => setActionLoading(false));
  };

  const handleForfeit = () => {
    if (!currentRacer) return;
    const racerName = currentRacer.nickname || currentRacer.name; const ri = currentRacer.id;
    if (!window.confirm('确认 ' + racerName + ' 弃赛？\n\n将消耗一次参赛次数。')) { if (status === 'running' && !destroyedRef.current) return; }
    setActionLoading(true);
    api.post('/referees/match/forfeit', { racerId: ri }).then(() => { setErrorMsg(racerName + ' 弃赛'); resetMatch(); loadQueue(); }).catch(() => { setErrorMsg('网络异常，操作已缓存'); resetMatch(); }).finally(() => setActionLoading(false));
  };

  const handleInvalidate = () => {
    if (!currentRacer) return;
    const racerName = currentRacer.nickname || currentRacer.name; const ri = currentRacer.id;
    if (!window.confirm('确认将 ' + racerName + ' 本次成绩标记为无效？\n\n该操作不可撤销。')) return;
    setActionLoading(true);
    api.post('/referees/match/invalidate', { racerId: ri }).then(() => { setErrorMsg('❌ ' + racerName + ' 成绩已标记无效'); loadQueue(); }).catch(() => { setErrorMsg('网络异常，操作失败'); }).finally(() => setActionLoading(false));
  };

  const handleSkip = () => {
    if (!currentRacer) return;
    const racerName = currentRacer.nickname || currentRacer.name; const ri = currentRacer.id;
    if (!window.confirm('确认跳过 ' + racerName + '？\n\n该选手将排到下一位后面。')) return;
    setActionLoading(true);
    api.post('/referees/match/skip', { racerId: ri }).then(() => { setErrorMsg('⏭ ' + racerName + ' 已跳过'); resetMatch(); loadQueue(); }).catch(() => { setErrorMsg('网络异常，操作失败'); }).finally(() => setActionLoading(false));
  };

  const resetMatch = () => { setStatus('idle'); setElapsed(0); setPausedElapsed(0); setCurrentRacer(null); setActionLoading(false); };
  const isTimeoutDanger = maxTimeout > 0 && elapsed >= (maxTimeout - 10) * 1000;
  const timeoutPercent = maxTimeout > 0 ? Math.min(100, (elapsed / (maxTimeout * 1000)) * 100) : 0;

  if (pageLoading || checkingStatus || contextLoading) return <div className="referee-loading-mask"><div className="referee-loading-spinner">加载中...</div></div>;

  // 无运营商上下文：引导线下扫码
  if (!hasContext) {
    return (
      <div className="referee-page">
        <div className="referee-ws-badge">
          <span>在线模式</span>
        </div>
        <NoContextBanner />
        <div className="referee-card" style={{ marginBottom: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏁</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ref-text)', marginBottom: 8 }}>请联系运营商绑定赛场</div>
          <div style={{ fontSize: 14, color: 'var(--ref-text-dim)', lineHeight: 1.6 }}>
            请前往线下赛场扫描官方小程序码<br />由运营商后台为您分配赛场后即可使用
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              className="referee-btn referee-btn-outline"
              onClick={async () => {
                if ('caches' in window) {
                  try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((k: string) => caches.delete(k)));
                  } catch {}
                }
                localStorage.clear();
                window.location.reload();
              }}
              style={{ fontSize: 13, padding: '8px 20px' }}
            >
              🔄 已经联系绑定，强制清除缓存
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="referee-page">
      {/* WS 连接状态 - 页面最顶部 */}
      <div className="referee-ws-badge">
        <div className="referee-ws-dot" style={{ background: wsConnected && checkedIn !== true ? '#e74c3c' : undefined }} data-connected={wsConnected} />
        <span>{wsConnected ? (checkedIn === true ? '赛场已激活 · 大屏已连接' : '离线未签到 ↴ 请去签到页签到') : checkedIn === true ? '⚠️ 赛场未激活 · 大屏未连接' : '离线模式'}</span>
      </div>
      <div className="referee-card referee-timer-card" style={{ textAlign: 'center', padding: '24px 20px', marginBottom: 16 }}>
        <div className="referee-timer-display" data-running={status === 'running'} data-danger={isTimeoutDanger}>
          <span className="referee-timer-main">{formatTime(elapsed)}<span className="referee-timer-ms">{formatMs(elapsed)}</span></span>
        </div>
        {status === 'running' && maxTimeout > 0 && <div className="referee-progress-bar"><div className="referee-progress-fill" style={{ width: timeoutPercent + '%' }} data-danger={isTimeoutDanger} /></div>}
        {currentRacer && (
          <div className="referee-racer-info">
            <div className="referee-racer-detail">
              <div className="text-one-line">{currentRacer.nickname || currentRacer.name}</div>
              <div className="referee-racer-remaining">剩<strong>{currentRacer.remainingRaces}</strong>次</div>
            </div>
          </div>
        )}
        <div className="referee-status-tag">
          {status === 'idle' && <span className="referee-tag referee-tag-info">准备就绪</span>}
          {status === 'running' && <span className="referee-tag referee-tag-success">▶ 进行中</span>}
          {status === 'paused' && <span className="referee-tag referee-tag-warning">⏸ 已暂停</span>}
          {status === 'finished' && <span className="referee-tag referee-tag-danger">🏁 比赛结束</span>}
        </div>
        <div className="referee-actions">
          {checkedIn !== true && <div className="referee-card" style={{ textAlign: 'center', padding: 24, marginTop: 8 }}><button onClick={() => navigate('/referee/attendance')} style={{ background: '#27ae60', border: 'none', borderRadius: 10, padding: '14px 28px', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>📍 请先签到激活赛场</button></div>}
          {checkedIn === true && status === 'finished' && (
            <div className="referee-btn-row" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="referee-btn referee-btn-primary referee-btn-lg" onClick={async () => {
                if (currentRacer) {
                  try { await api.post('/referees/match/call-next', { racerId: currentRacer.id }); } catch {}
                }
                setStatus('idle'); setCurrentRacer(null); setElapsed(0); loadQueue(true);
              }}>👋 完成，呼叫下一位</button>
              <button className="referee-btn referee-btn-ghost referee-btn-sm" disabled={actionLoading || (currentRacer?.remainingRaces ?? 0) <= 0} style={{ opacity: (currentRacer?.remainingRaces ?? 0) <= 0 ? 0.25 : 0.4, fontSize: 12, padding: '6px 12px', margin: '0 auto' }} onClick={async () => {
                if (!currentRacer) return;
                setActionLoading(true);
                try {
                  await api.post('/referees/match/re-enter');
                  setQueue(queue.map((r) => ({ ...r, isCurrent: r.id === currentRacer.id })));
                  setStatus('idle'); setElapsed(0); setPausedElapsed(0);
                  setErrorMsg('已叫号: ' + (currentRacer.nickname || currentRacer.name));
                  setTimeout(() => setErrorMsg(''), 2000);
                } catch { setErrorMsg('操作失败'); }
                setActionLoading(false);
              }}>🔄 再玩一次</button>
            </div>
          )}
          {status === 'idle' && currentRacer && <button className="referee-btn referee-btn-success referee-btn-lg" onClick={startRace} disabled={actionLoading}>▶ 开始比赛</button>}
          {status === 'malfunctioned' && currentRacer && <button className="referee-btn referee-btn-success referee-btn-lg" onClick={startRace} disabled={actionLoading}>▶ 重新比赛</button>}
          {status === 'running' && <div className="referee-btn-row"><button className="referee-btn referee-btn-danger" onClick={endRace}>⏹ 结束比赛</button></div>}
          {status === 'paused' && <div className="referee-btn-row"><button className="referee-btn referee-btn-success" onClick={startRace} disabled={actionLoading}>▶ 继续比赛</button><button className="referee-btn referee-btn-danger" onClick={endRace}>⏹ 结束比赛</button></div>}
        </div>
        {status === 'running' && maxTimeout > 0 && <div className="referee-timeout-hint">⏰ 超时限制5分钟 · 超时将自动记录</div>}
      </div>
      {errorMsg && <div className="referee-error-msg" dangerouslySetInnerHTML={{ __html: errorMsg.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#27ae60">$1</strong>') }} />}
      {checkedIn === true && currentRacer && (status === 'running' || status === 'paused') && <div className="referee-card referee-card-compact" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 16 }}><button className="referee-btn referee-btn-outline" onClick={handleMalfunction} disabled={actionLoading}>机器狗故障 · 保留次数重新排队</button><button className="referee-btn referee-btn-danger-outline" onClick={handleForfeit} disabled={actionLoading}>🚫 弃赛</button></div>}
      {checkedIn === true && currentRacer && status === 'finished' && <div className="referee-card referee-card-compact" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 16 }}><button className="referee-btn referee-btn-outline" style={{ borderColor: '#e74c3c', color: '#e74c3c' }} onClick={handleInvalidate} disabled={actionLoading}>❌ 标记成绩无效</button></div>}
      {checkedIn === true && currentRacer && (status === 'called' || status === 'waiting') && <div className="referee-card referee-card-compact" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 16 }}><button className="referee-btn referee-btn-ghost referee-btn-sm" onClick={handleSkip} disabled={actionLoading}>⏭ 跳过此选手</button></div>}
      {checkedIn === true && <><div className="referee-section">
        <div className="referee-section-header"><span>📋 排队列表</span><span className="referee-section-count">{queue.length} 人</span><button className="referee-btn referee-btn-ghost referee-btn-sm" onClick={() => loadQueue()} disabled={actionLoading} style={{ marginLeft: 'auto' }}>🔄 刷新</button></div>
        {queue.length === 0 && <div className="referee-empty"><img src="/logo-avatar.png" alt="暂无排队" style={{ width: 80, height: 80, marginBottom: 12 }} /><span className="referee-empty-text">暂无排队选手</span></div>}
        {queue.map((item, index) => (
          <div key={item.id} className="referee-card referee-queue-item" data-active={item.isCurrent} onClick={() => { if (!item.isCurrent && status === 'idle') selectRacer(item.id); }}>
            <div className="referee-queue-index" data-current={item.isCurrent}>{item.isCurrent ? '★' : index + 1}</div>
            <div className="referee-queue-name"><span className="text-one-line" style={{ color: '#fff' }}>{item.nickname || item.name || '选手' + item.id}</span><span className="referee-queue-remaining">剩<strong>{item.remainingRaces ?? '?'}</strong>次</span></div>
            {item.isCurrent && <div className="referee-queue-badge"><span className="referee-queue-dot">●</span><span>进行中</span></div>}
            {!item.isCurrent && status === 'idle' && checkedIn === true && <button className="referee-btn referee-btn-primary referee-btn-sm" style={{ marginLeft: 8, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); selectRacer(item.id); }}>上场</button>}
          </div>
        ))}
      </div></>}
      {/* 大屏断连弹窗 */}
      {showDcAlert && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div style={{
            width: '80%', maxWidth: 360, padding: 28, background: '#fff', borderRadius: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔌</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 8 }}>大屏未连接</div>
            <div style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 20 }}>大屏已掉线或关闭<br/>请前往签到页重新激活赛场</div>
            <button
              style={{ width: '100%', padding: '12px 0', border: 'none', borderRadius: 8, background: '#27ae60', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => navigate('/referee/attendance')}
            >前往签到页激活</button>
          </div>
        </div>
      )}
    </div>
  );
}
