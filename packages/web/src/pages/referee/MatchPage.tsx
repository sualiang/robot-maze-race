import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface Racer {
  id: string;
  nickname: string;
  name?: string;
  robotName: string;
  attempt: number;
  remainingRaces: number;
  avatarUrl?: string;
  isCurrent?: boolean;
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
  const [maxTimeout] = useState(180);
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const destroyedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const prevCheckedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/referee/login', { replace: true }); return; }
    destroyedRef.current = false;
    loadQueue();
    checkAttendanceStatus();
    connectWebSocket();
    // 定期检查签到状态（兼容签到页签到后不刷新页面的场景）
    const checkinPoll = setInterval(() => { checkAttendanceStatus(); }, 2000);
    return () => { destroyedRef.current = true; clearTimer(); clearInterval(checkinPoll); if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.onerror = null; wsRef.current.onmessage = null; wsRef.current.onopen = null; wsRef.current.close(); wsRef.current = null; } if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听签到状态变化：true→false 时（离线签退/轮询检测到签退），清除排队和计时
  useEffect(() => {
    const wasIn = prevCheckedInRef.current;
    prevCheckedInRef.current = checkedIn;
    if (wasIn === true && checkedIn === false) {
      clearTimer();
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
    const wsUrl = import.meta.env.VITE_REFEREE_WS_URL || 'ws://localhost:3000/ws/referee';
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
            case 'timer_sync': if (typeof msg.data.elapsed === 'number') { setElapsed(msg.data.elapsed); setStatus(msg.data.status); } break;
            case 'result_push': setErrorMsg(msg.data.nickname + ': ' + formatFullTime(msg.data.finishTimeMs) + (msg.data.isTimeout ? ' (超时)' : '')); setTimeout(() => setErrorMsg(''), 2500); loadQueue(true); break;
            case 'racer_ready': setErrorMsg(msg.data.nickname + ' 已就位'); setTimeout(() => setErrorMsg(''), 2000); break;
            case 'venue_reopen':
              setCheckedIn(true);
              setErrorMsg('✅ 赛场已激活');
              setTimeout(() => setErrorMsg(''), 2000);
              loadQueue();
              break;
            case 'venue_closed':
              setCheckedIn(false);
              clearTimer();
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
      ws.onclose = () => { console.log('[WS] 关闭'); setWsConnected(false); if (!destroyedRef.current && reconnectCountRef.current < 10) { reconnectCountRef.current++; reconnectTimerRef.current = setTimeout(() => { if (!destroyedRef.current) connectWebSocket(); }, 3000); } };
      ws.onerror = () => setWsConnected(false);
    } catch { console.warn('[WS] 不可用'); }
  }, []);

  const loadQueue = async (skipCurrentRacer?: boolean) => {
    setPageLoading(true);
    try { const res: any = await api.get('/referees/match/queue'); setQueue(res.queue || []); if (!skipCurrentRacer) setCurrentRacer(res.currentRacer || null); }
    catch { setErrorMsg('加载失败，请重试'); } finally { setPageLoading(false); }
  };

  const checkAttendanceStatus = async () => {
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
  };

  const handleSignIn = async () => {
    setActionLoading(true);
    try {
      await api.post('/referees/attendance/check-in', { venueId: 'default_venue_001' });
      setCheckedIn(true);
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
    try { await api.post('/referees/match/select-racer', { racerId }); setQueue(queue.map((r) => ({ ...r, isCurrent: r.id === racerId }))); setCurrentRacer(racer); setStatus('idle'); setElapsed(0); setPausedElapsed(0); setErrorMsg('已叫号: ' + (racer.nickname || racer.name)); setTimeout(() => setErrorMsg(''), 2000); }
    catch {} finally { setActionLoading(false); }
  };

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const startTimerInternal = (baseElapsed: number, startTimestamp: number) => {
    clearTimer();
    timerRef.current = setInterval(() => {
      if (destroyedRef.current) { clearTimer(); return; }
      const e = baseElapsed + (Date.now() - startTimestamp);
      elapsedRef.current = e;
      if (maxTimeout > 0 && e >= maxTimeout * 1000) { setElapsed(e); clearTimer(); endRace(); return; }
      setElapsed(e);
    }, 10);
  };

  const startRace = async () => {
    if (!currentRacer) { setErrorMsg('请先选择比赛选手'); return; }
    if (status === 'running') { setErrorMsg('比赛已在进行中'); return; }
    setActionLoading(true);
    try { await api.post('/referees/match/start', { racerId: currentRacer.id }); clearTimer(); const now = Date.now(); const base = status === 'paused' ? pausedElapsed : elapsed; setStatus('running'); setElapsed(base); setPausedElapsed(0); startTimerInternal(base, now); }
    catch {} finally { setActionLoading(false); }
  };

  const pauseRace = async () => { if (status !== 'running') return; clearTimer(); setStatus('paused'); setPausedElapsed(elapsed); try { await api.post('/referees/match/pause', { racerId: currentRacer?.id, elapsed }); } catch {}; setErrorMsg('⏸ 已暂停'); setTimeout(() => setErrorMsg(''), 1500); };

  const endRace = async () => {
    if (status !== 'running' && status !== 'paused') return; clearTimer();
    const finalTime = elapsedRef.current || elapsed; const isTimeout = maxTimeout > 0 && finalTime >= maxTimeout * 1000; const raceStatus = isTimeout ? 'timeout' : 'finished';
    setActionLoading(true);
    try {
      await api.post('/referees/match/end', { racerId: currentRacer?.id, finishTimeMs: finalTime, status: raceStatus });
      setErrorMsg(isTimeout ? '⏰ 超时！' + formatFullTime(finalTime) : '🏁 ' + formatFullTime(finalTime));
      setTimeout(() => setErrorMsg(''), 2500);
      setStatus('finished');
      setPausedElapsed(0);
      loadQueue();
    } catch {
      setErrorMsg('网络异常，结果已记录到本地');
      setTimeout(() => setErrorMsg(''), 2000);
      setStatus('finished');
      setPausedElapsed(0);
    }
    finally { setActionLoading(false); }
  };

  const handleMalfunction = () => {
    if (!currentRacer) return; clearTimer();
    const racerName = currentRacer.nickname || currentRacer.name; const ce = elapsed; const ri = currentRacer.id;
    if (!window.confirm(racerName + ' 的机器狗发生故障？\n\n• 选手保留参赛次数\n• 计时归零重新开始\n• 当前计时作废')) { if (!destroyedRef.current) { setStatus('running'); startTimerInternal(ce, Date.now()); } return; }
    setActionLoading(true);
    api.post('/referees/match/malfunction', { racerId: ri }).then(() => {
      setElapsed(0);
      setPausedElapsed(0);
      setStatus('malfunctioned');
      setErrorMsg('🤖 故障已登记，**' + racerName + '** 请重新开始');
    }).catch(() => { setErrorMsg('网络异常，操作已本地缓存'); }).finally(() => setActionLoading(false));
  };

  const handleForfeit = () => {
    if (!currentRacer) return; clearTimer();
    const racerName = currentRacer.nickname || currentRacer.name; const ri = currentRacer.id;
    if (!window.confirm('确认 ' + racerName + ' 弃赛？\n\n将消耗一次参赛次数。')) { if (status === 'running' && !destroyedRef.current) startTimerInternal(elapsed, Date.now()); return; }
    setActionLoading(true);
    api.post('/referees/match/forfeit', { racerId: ri }).then(() => { setErrorMsg(racerName + ' 弃赛'); resetMatch(); loadQueue(); }).catch(() => { setErrorMsg('网络异常，操作已缓存'); resetMatch(); }).finally(() => setActionLoading(false));
  };

  const resetMatch = () => { clearTimer(); setStatus('idle'); setElapsed(0); setPausedElapsed(0); setCurrentRacer(null); setActionLoading(false); };
  const isTimeoutDanger = maxTimeout > 0 && elapsed >= (maxTimeout - 10) * 1000;
  const timeoutPercent = maxTimeout > 0 ? Math.min(100, (elapsed / (maxTimeout * 1000)) * 100) : 0;

  if (pageLoading || checkingStatus) return <div className="referee-loading-mask"><div className="referee-loading-spinner">加载中...</div></div>;

  return (
    <div className="referee-page">
      {/* WS 连接状态 - 页面最顶部 */}
      <div className="referee-ws-badge">
        <div className="referee-ws-dot" style={{ background: wsConnected && checkedIn !== true ? '#e74c3c' : undefined }} data-connected={wsConnected} />
        <span>{wsConnected ? (checkedIn === true ? '赛场已激活 · 大屏已连接' : '离线未签到 ↴ 请去签到页签到') : '离线模式'}</span>
      </div>
      <div className="referee-card referee-timer-card" style={{ textAlign: 'center', padding: '24px 20px', marginBottom: 16 }}>
        <div className="referee-timer-display" data-running={status === 'running'} data-danger={isTimeoutDanger}>
          <span className="referee-timer-main">{formatTime(elapsed)}<span className="referee-timer-ms">{formatMs(elapsed)}</span></span>
        </div>
        {status === 'running' && maxTimeout > 0 && <div className="referee-progress-bar"><div className="referee-progress-fill" style={{ width: timeoutPercent + '%' }} data-danger={isTimeoutDanger} /></div>}
        {currentRacer && (
          <div className="referee-racer-info">
            <div className="referee-racer-avatar">{currentRacer.avatarUrl || '🤖'}</div>
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
          {checkedIn !== true && <div className="referee-card" style={{ textAlign: 'center', padding: '24px', marginTop: 8 }}><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ref-text-dim)', marginBottom: 8 }}>📍 请先签到激活赛场</div><div style={{ fontSize: 14, color: 'var(--ref-text-dim)', lineHeight: 1.6 }}>请前往「签到页」完成签到后，方可进行比赛操作</div></div>}
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
        {status === 'running' && maxTimeout > 0 && <div className="referee-timeout-hint">⏰ 超时限制 {maxTimeout}秒 · 超时将自动记录</div>}
      </div>
      {errorMsg && <div className="referee-error-msg" dangerouslySetInnerHTML={{ __html: errorMsg.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#27ae60">$1</strong>') }} />}
      {checkedIn === true && currentRacer && (status === 'running' || status === 'paused') && <div className="referee-card referee-card-compact" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 16 }}><button className="referee-btn referee-btn-outline" onClick={handleMalfunction} disabled={actionLoading}>🤖 机器狗故障 · 保留次数重新排队</button><button className="referee-btn referee-btn-ghost referee-btn-sm" onClick={handleForfeit} disabled={actionLoading}>🚫 选手弃赛</button></div>}
      {checkedIn === true && <><div className="referee-section">
        <div className="referee-section-header"><span>📋 排队列表</span><span className="referee-section-count">{queue.length} 人</span></div>
        {queue.length === 0 && <div className="referee-empty"><span className="referee-empty-icon">📭</span><span className="referee-empty-text">暂无排队选手</span></div>}
        {queue.map((item, index) => (
          <div key={item.id} className="referee-card referee-queue-item" data-active={item.isCurrent} onClick={() => { if (!item.isCurrent && status === 'idle') selectRacer(item.id); }}>
            <div className="referee-queue-index" data-current={item.isCurrent}>{item.isCurrent ? '★' : index + 1}</div>
            <div className="referee-queue-avatar" data-current={item.isCurrent}>{item.avatarUrl || '🤖'}</div>
            <div className="referee-queue-name"><span className="text-one-line">{item.nickname || item.name || '选手' + item.id}</span><span className="referee-queue-remaining">剩<strong>{item.remainingRaces ?? '?'}</strong>次</span></div>
            {item.isCurrent && <div className="referee-queue-badge"><span className="referee-queue-dot">●</span><span>进行中</span></div>}
            {!item.isCurrent && status === 'idle' && checkedIn === true && <button className="referee-btn referee-btn-primary referee-btn-sm" style={{ marginLeft: 8, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); selectRacer(item.id); }}>上场</button>}
          </div>
        ))}
      </div></>}
    </div>
  );
}
