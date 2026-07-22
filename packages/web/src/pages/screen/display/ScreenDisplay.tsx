import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, Tag } from 'antd';
import { TrophyOutlined, ClockCircleOutlined, UserOutlined, WifiOutlined, WifiOutlined as WifiOfflined } from '@ant-design/icons';

interface LeaderboardEntry {
  rank: number;
  nickname: string;
  finish_time_ms: number;
  status: string;
  avatar_url?: string;
}

interface QueueItem {
  queue_number: number;
  nickname: string;
  status: string;
  avatar_url?: string;
}

interface ScreenData {
  venue_name: string;
  venue_status: string;
  venueId?: string;
  current_racer: { nickname: string; queue_number: number; avatar_url?: string } | null;
  elapsed_ms: number;
  race_status: string;
  leaderboard: LeaderboardEntry[];
  queue: QueueItem[];
  next_racer: { nickname: string; queue_number: number; avatar_url?: string } | null;
  start_time?: number;
  last_result?: { racerName: string; racerAvatar?: string; elapsed: number };
}

export default function ScreenDisplay() {
  const [searchParams] = useSearchParams();
  const venueId = searchParams.get('venueId') || '';
  const urlVenueName = searchParams.get('venueName') || '';
  const theme = searchParams.get('theme') || 'dark'; // 'dark' | 'light'
  const isLight = theme === 'light';

  // 配色方案
  const colors = {
    bg: isLight ? '#ffffff' : '#0a0a1a',
    containerBg: isLight ? '#ffffff' : 'linear-gradient(135deg, #0a0a1a 0%, #1a1040 50%, #0d0d2b 100%)',
    cardBg: isLight ? '#f5f5f5' : 'rgba(255,255,255,0.05)',
    text: isLight ? '#1a1a1a' : '#fff',
    textSecondary: '#888',
    textTertiary: '#666',
    timerActive: isLight ? '#e65100' : '#ff6b35',
    timerInactive: isLight ? '#ccc' : '#444',
    border: isLight ? '#e0e0e0' : 'rgba(255,255,255,0.08)',
    topbarBg: isLight ? '#fafafa' : 'rgba(255,255,255,0.03)',
    topbarDivider: isLight ? '#e0e0e0' : 'rgba(255,255,255,0.1)',
    goldHighlight: isLight ? '#b8860b' : '#ffd700',
    chartTitle: isLight ? '#1a1a1a' : '#fff',
    overlayBg: isLight ? '#ffffff' : '#0a0a1a',
    overlayText: isLight ? '#1a1a1a' : '#fff',
    overlaySubText: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)',
    overlayDotText: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)',
    fullscreenBtnBg: isLight ? '#f0f0f0' : 'rgba(255,255,255,0.08)',
    fullscreenBtnBorder: isLight ? '#d0d0d0' : 'rgba(255,255,255,0.2)',
    fullscreenBtnColor: isLight ? '#333' : '#fff',
    fullscreenBtnHover: isLight ? '#e0e0e0' : 'rgba(255,255,255,0.15)',
  };

  // 激活状态跟踪：不再依赖 sessionStorage，由 WS screen_data 的 venue_status 决定
  const [isActivated, setIsActivated] = useState(false);
  const [venueName, setVenueName] = useState(urlVenueName);
  const [activationCode, setActivationCode] = useState('');

  const [data, setData] = useState<ScreenData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectingRef = useRef(false);
  const [forfeitMessage, setForfeitMessage] = useState('');
  const [forfeitName, setForfeitName] = useState('');
  const [forfeitHint, setForfeitHint] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 记录上一个 race_status，用于判断是否刚结束比赛
  const prevStatusRef = useRef<string>('idle');
  // 标记比赛已结束，阻止后续任何 setInterval
  const raceEndedRef = useRef(false);
  const MAX_TIMEOUT_SEC = 180;
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    // 直接连后端 WebSocket，跳过 Vite proxy 避免 EPIPE 崩溃
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}://${window.location.host}/ws/screen`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'screen' }));

      // 从 localStorage 获取或生成激活码（永久复用，不重复生成）
      const CODE_KEY = 'screen_activation_code_' + venueId;
      let code = localStorage.getItem(CODE_KEY);
      if (!code) {
        code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        localStorage.setItem(CODE_KEY, code);
      }
      setActivationCode(code);
      ws.send(JSON.stringify({
        type: 'screen_login',
        activation_code: code,
        venueId: venueId || undefined,
      }));

      // 请求一次当前数据（防止签到后打开大屏没有初始数据）
      ws.send(JSON.stringify({ type: 'get_screen_data' }));
      // 心跳保活：每 15 秒发一次 ping，防止 NAT/防火墙断开空闲连接
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'ping' }));
        }
      }, 15000);
    };

    ws.onmessage = (event) => {
      console.log('[大屏WS] 收到消息:', event.data);
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'screen_data') {
          const screenData = msg.data as ScreenData;
          const prevStatus = prevStatusRef.current;
          prevStatusRef.current = screenData.race_status;

          // 根据 venue_status 更新大屏激活状态
          if (screenData.venue_status === 'open') {
            setIsActivated(true);
            setVenueName(screenData.venue_name || '');
          } else {
            setIsActivated(false);
            // 未激活状态下后端可能已查到 venueName（如 IIFE 遍历 op_ 库）
            // 如果 URL 已有 venueName 则不覆盖
            if (screenData.venue_name && !venueName) {
              setVenueName(screenData.venue_name);
            }
          }

          setData(screenData);

          // 新玩家上场时清除弃赛/故障提示
          if (screenData.current_racer) {
            setForfeitMessage('');
            setForfeitName('');
            setForfeitHint('');
          }

          // 比赛一旦结束就锁定 timer
          if (screenData.race_status === 'finished') {
            raceEndedRef.current = true;
          } else if (screenData.race_status === 'idle' || screenData.race_status === 'waiting') {
            raceEndedRef.current = false;
          }

          // 故障恢复重新比赛时解除锁定
          if (screenData.race_status === 'racing') {
            raceEndedRef.current = false;
            setForfeitMessage('');
            setForfeitName('');
            setForfeitHint('');
          }

          // 计时统一用服务端 WS 推送的 elapsed_ms
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

          if (screenData.race_status === 'racing' && !raceEndedRef.current) {
            // 以服务端推送的 elapsed_ms 为基准，客户端 50ms 刷新（保证秒数跳动）
            const serverElapsed = screenData.elapsed_ms || 0;
            const startNow = Date.now();
            setElapsed(serverElapsed);
            timerRef.current = setInterval(() => {
              const e = serverElapsed + (Date.now() - startNow);
              if (MAX_TIMEOUT_SEC > 0 && e >= MAX_TIMEOUT_SEC * 1000) {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
                raceEndedRef.current = true;
                setElapsed(MAX_TIMEOUT_SEC * 1000);
              } else {
                setElapsed(e);
              }
            }, 50);
          } else if (screenData.race_status === 'finished') {
            const finalElapsed = screenData.elapsed_ms || 0;
            setElapsed(finalElapsed);
            
            // 自动判断进榜：如果成绩有效且能进前 10，插入榜单
            if (finalElapsed > 0 && screenData.last_result?.racerName) {
              const currentLeaderboard = screenData.leaderboard || [];
              const newEntry: LeaderboardEntry = {
                rank: 0, // 后面重新排
                nickname: screenData.last_result.racerName,
                finish_time_ms: finalElapsed,
                status: 'finished',
              };
              // 判断是否进前 10（榜单不足 10 人，或者比第 10 名快）
              let canEnter = currentLeaderboard.length < 10;
              if (!canEnter && currentLeaderboard.length >= 10) {
                const tenthTime = currentLeaderboard[9]?.finish_time_ms;
                if (tenthTime && finalElapsed < tenthTime) {
                  canEnter = true;
                }
              }
              if (canEnter) {
                const newBoard = [...currentLeaderboard, newEntry]
                  .filter(e => e.finish_time_ms > 0)
                  .sort((a, b) => a.finish_time_ms - b.finish_time_ms)
                  .slice(0, 20)
                  .map((e, i) => ({ ...e, rank: i + 1 }));
                setData(prev => prev ? { ...prev, leaderboard: newBoard } : prev);
              }
            }
          } else {
            // idle / waiting / paused: 直接展示服务端推送的 elapsed_ms
            setElapsed(screenData.elapsed_ms || 0);
          }
        } else if (msg.type === 'activated') {
          // 大屏收到激活，切换到已激活状态
          setIsActivated(true);
          setVenueName(msg.data?.venue_name || '');
          // 立刻将 status 设为 open，避免短暂显示"已关闭"
          setData(prev => ({ ...prev, venue_status: 'open', venue_name: msg.data?.venue_name || prev.venue_name }));
        } else if (msg.type === 'deactivated' || msg.event === 'venue_closed') {
          // 大屏收到去激活，回到激活码输入状态
          setIsActivated(false);
          setData(null);
          setElapsed(0);
        } else if (msg.event === 'venue_reopen') {
          setForfeitMessage('');
          setForfeitName('');
          setForfeitHint('');
          setData(null);
          setElapsed(0);
          // 主动请求最新赛场数据
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'get_screen_data' }));
          }
        } else if (msg.event === 'racer_forfeit') {
          raceEndedRef.current = true;
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setForfeitMessage('选手 ' + (msg.data?.racerName || '已') + ' 弃赛');
          setForfeitName(msg.data?.racerName || '');
          setForfeitHint('弃赛');
          if (msg.data?.currentRacer === null) {
            setData(prev => prev ? { ...prev, current_racer: null } : prev);
          }
        } else if (msg.event === 'racer_malfunction') {
          raceEndedRef.current = true;
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setForfeitMessage('选手 ' + (msg.data?.racerName || '已') + ' 铁甲故障检修');
          setForfeitName(msg.data?.racerName || '');
          setForfeitHint('铁甲故障检修');
          setData(prev => prev ? { ...prev, race_status: 'malfunction', current_racer: null } : prev);
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      setConnected(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      // 断网或者新开一局，重置结束标记让新 race 能正常启动计时
      raceEndedRef.current = false;
      // 断网自动重连
      if (!reconnectingRef.current) {
        reconnectingRef.current = true;
        setReconnecting(true);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectingRef.current = false;
          setReconnecting(false);
          connect();
        }, 2000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []); // 空依赖——connect 只创建一次，重连靠 onclose 内的闭包

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // 全屏快捷键 F11 / F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11' || (e.key === 'f' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const formatTime = (ms: number) => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const milli = ms % 1000;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(Math.floor(milli / 10)).padStart(2, '0')}`;
  };

  const formatTimeMs = (ms: number) => {
    if (!ms) return '--:--.--';
    return formatTime(ms);
  };



  // 默认场地数据（API 获取失败时的回退值）
  // 默认数据（当 WebSocket 返回 undefined 时的回退值）
  const fallbackData: ScreenData = {
    venue_name: '机器狗迷宫赛场',
    venue_status: 'inactive',
    current_racer: null,
    elapsed_ms: 0,
    race_status: 'idle',
    leaderboard: [],
    queue: [],
    next_racer: null,
  };

  // 合并 data 与 fallbackData，确保关键字段存在
  const mergedData = { ...fallbackData, ...(data || {}) };
  const displayData = {
    ...mergedData,
    leaderboard: Array.isArray(mergedData.leaderboard) ? mergedData.leaderboard : [],
    queue: Array.isArray(mergedData.queue) ? mergedData.queue : [],
    venue_name: mergedData.venue_name || '机器狗迷宫赛场',
    venue_status: mergedData.venue_status || 'inactive',
    race_status: mergedData.race_status || 'idle',
  } as ScreenData;

  // 闪烁动画 - 竞速中高亮
  const isRacing = displayData.current_racer && displayData.race_status === 'racing';
  // 选手已上场但未开始比赛：current_racer 存在且状态为 waiting 或 idle
  const isOnArena = displayData.current_racer && (displayData.race_status === 'waiting' || displayData.race_status === 'idle');
  // 比赛刚结束：race_status=finished 且 current_racer 为 null，但有有效 elapsed 时间
  const isFinished = displayData.race_status === 'finished';
  const highlightTime = isFinished && elapsed > 0;

  // 注入全局样式覆盖：大屏全屏时去掉 #root 的背景/边框/宽度限制
  useEffect(() => {
    const bg = isLight ? '#ffffff' : '#0a0a1a';
    const style = document.createElement('style');
    style.id = 'screen-display-override';
    style.textContent = `
      #root {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        background: transparent !important;
        min-height: 100vh !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        background: ${bg} !important;
      }
      /* 大屏全局文字截断：最多一行，超出显示… */
      .screen-display * {
        max-width: 100%;
        overflow-wrap: break-word;
      }
      .screen-display .text-ellipsis {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .screen-display .text-one-line {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }
      .screen-display .text-one-line {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;
    document.head.appendChild(style);
    return () => { const s = document.getElementById('screen-display-override'); if (s) s.remove(); };
  }, [isLight]);

  return (
    <div className="screen-display" style={{ height: '100vh', width: '100vw', background: colors.containerBg, fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif", color: colors.text, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 赛场未激活状态 */}
      {!isActivated && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: colors.overlayBg, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 24,
        }}>
          {/* Logo + 赛场名 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <img src="/iron-dog-logo.png" alt="铁甲快狗" style={{ height: 60, width: 'auto' }} />
            {venueName && (
              <span style={{ fontSize: 24, fontWeight: 600, color: '#ff6b35' }}>{venueName}</span>
            )}
          </div>
          {activationCode ? (
            <>
              <div style={{ fontSize: 56, marginBottom: 8 }}>🐕</div>
              <div style={{
                fontSize: 72, fontFamily: 'monospace', fontWeight: 800,
                letterSpacing: 16, color: '#ff6b35', paddingLeft: 16,
              }}>{activationCode}</div>
              <div style={{ fontSize: 18, color: colors.overlaySubText, letterSpacing: 1 }}>
                裁判输入上方激活码激活大屏
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, fontWeight: 700, color: colors.overlayText }}>赛场未激活</div>
              <div style={{ fontSize: 18, color: colors.overlaySubText, letterSpacing: 1 }}>
                等待裁判签到激活…
              </div>
            </>
          )}
          {connected && (
            <div style={{ fontSize: 14, color: colors.overlayDotText }}>
              已连接，等待裁判扫码
            </div>
          )}
          <div style={{
            width: 4, height: 40,
            background: 'linear-gradient(180deg, transparent, rgba(99,102,241,0.4), transparent)',
            borderRadius: 2, marginTop: 8,
            animation: 'referee-pulse 1.5s ease-in-out infinite',
          }} />
        </div>
      )}
      {/* 静默重连，不显示断网横幅 */}

      {/* 顶栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 48px', borderBottom: `1px solid ${colors.topbarDivider}`,
        background: colors.topbarBg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/iron-dog-logo.png" alt="铁甲快狗" style={{ height: 50, width: 'auto' }} />
          <h1 style={{ fontSize: 32, margin: 0, lineHeight: 1.4, fontWeight: 700, background: 'linear-gradient(90deg, #ff6b35, #ff9a3c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            闯关竞速赛
          </h1>
          <span style={{ fontSize: 18, color: '#aaa' }}>|</span>
          <span style={{ fontSize: 20, fontWeight: 500 }}>{displayData.venue_name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <WifiOutlined style={{ color: connected ? '#52c41a' : '#f5222d', fontSize: 18 }} />
          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
            style={{
              background: colors.fullscreenBtnBg, border: `1px solid ${colors.fullscreenBtnBorder}`,
              color: colors.fullscreenBtnColor, borderRadius: 8, padding: '4px 12px', fontSize: 13,
              cursor: 'pointer', marginLeft: 12, transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = colors.fullscreenBtnHover}
            onMouseLeave={e => e.currentTarget.style.background = colors.fullscreenBtnBg}
          >⛶ 全屏</button>
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', padding: '24px 48px', gap: 32 }}>
        {/* 左侧：当前竞速 + 排队 */}
        <div style={{ flex: '1 1 55%', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 当前选手计时区 */}
          <div style={{
            background: highlightTime
              ? 'linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,215,0,0.1))'
              : (isRacing
                ? 'linear-gradient(135deg, rgba(255,107,53,0.2), rgba(255,154,60,0.1))'
                : colors.cardBg),
            borderRadius: 20, padding: '40px 32px',
            textAlign: 'center',
            border: highlightTime
              ? '2px solid rgba(255,215,0,0.6)'
              : (isRacing ? '2px solid rgba(255,107,53,0.5)' : `1px solid ${colors.border}`),
            boxShadow: highlightTime
              ? '0 0 50px rgba(255,215,0,0.3)'
              : (isRacing ? '0 0 40px rgba(255,107,53,0.2)' : 'none'),
            transition: 'all 0.3s ease',
          }}>
            {/* 比赛完成：先显示 🏆 比赛完成 再显示时间 */}
            {!highlightTime && (
              <div style={{
                fontSize: 16, marginBottom: 8,
                color: colors.textSecondary,
              }}>
                <ClockCircleOutlined /> 当前选手
              </div>
            )}
            {/* 弃赛提示 / 比赛完成 */}
            {forfeitMessage ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                marginBottom: 8, color: '#ef4444', whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>🚫</span>
                <span style={{ fontSize: 28, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 }}>{forfeitName}</span>
                <span style={{ fontSize: 28, fontWeight: 700, flexShrink: 0 }}>{forfeitHint}</span>
              </div>
            ) : highlightTime ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 40, lineHeight: 1, marginRight: 4 }}>🏆</span>
                {/* 选手名字 */}
                <div className="text-one-line" style={{
                  fontSize: 36, fontWeight: 700, color: colors.goldHighlight,
                  fontFamily: 'monospace',
                  textShadow: `0 0 20px ${isLight ? 'rgba(184,134,11,0.3)' : 'rgba(255,215,0,0.5)'}`,
                  maxWidth: 400,
                }}>
                  {displayData.last_result?.racerName || ''}
                </div>
              </div>
            ) : null}
            {/* 选手名字（已上场/竞速中显示） */}
            {(isRacing || isOnArena) && displayData.current_racer && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 6,
              }}>
                <div className="text-one-line" style={{
                  fontSize: 42, fontWeight: 700,
                  color: '#ff6b35',
                  fontFamily: 'monospace',
                  maxWidth: 400,
                }}>
                  {displayData.current_racer.nickname}
                </div>
              </div>
            )}
            {!isRacing && !highlightTime && !isOnArena && !forfeitMessage && (
              <div style={{ fontSize: 32, fontWeight: 500, color: colors.textTertiary }}>
                等待参赛...
              </div>
            )}
            <div style={{
              fontSize: 120, fontFamily: "'SF Mono', 'JetBrains Mono', monospace",
              fontWeight: 800,
              letterSpacing: -2,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
              color: highlightTime ? colors.goldHighlight : (isRacing ? colors.timerActive : colors.timerInactive),
              textShadow: highlightTime
                ? `0 0 40px ${isLight ? 'rgba(184,134,11,0.5)' : 'rgba(255,215,0,0.7)'}`
                : (isRacing ? '0 0 30px rgba(255,107,53,0.5)' : 'none'),
              transition: 'all 0.3s ease',
              animation: highlightTime ? 'highlightPulse 1.5s ease-in-out infinite' : 'none',
            }}>
              {formatTime(elapsed)}
            </div>
            {/* 不显示最新成绩标签，避免遮挡 */}
            {displayData.race_status === 'waiting' && displayData.current_racer && (
              <div style={{ fontSize: 18, color: '#fbbf24', marginTop: 8 }}>
                ⏳ 等待开赛
              </div>
            )}
          </div>

          {/* 排队列表 */}
          <div style={{
            background: colors.cardBg, borderRadius: 16,
            padding: 20, flex: 1,
            border: `1px solid ${colors.border}`,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserOutlined /> 等待队列 <span style={{ fontSize: 14, color: colors.textSecondary }}>({displayData.queue.length}人)</span>
            </div>
            {displayData.queue.length > 0 ? (
              <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                justifyItems: 'center',
              }}>
                {displayData.queue.slice(0, 6).map((q, i) => (
                  <div key={i} style={{
                    width: '100%',
                    maxWidth: 200,
                    background: i === 0 ? 'rgba(255,107,53,0.2)' : 'rgba(255,255,255,0.08)',
                    borderRadius: 12, padding: '14px 12px',
                    border: i === 0 ? '1px solid rgba(255,107,53,0.4)' : '1px solid transparent',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    {i === 0 ? (
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: '#ff6b35',
                        marginBottom: 0,
                      }}>👇 下一个</div>
                    ) : (
                      <div style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 0 }}>&nbsp;</div>
                    )}
                    <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-all' }}>{q.nickname}</div>
                  </div>
                ))}
              </div>
              {displayData.queue.length > 6 && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  &nbsp;
                </div>
              )}
              </>
            ) : (
              <Empty description="暂无排队选手" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
            {displayData.next_racer && (
              <div style={{ marginTop: 'auto', padding: '18px 20px', background: 'rgba(82,196,26,0.1)', borderRadius: 10, border: '1px solid rgba(82,196,26,0.3)' }}>
                <div style={{ fontSize: 15, color: '#52c41a', marginBottom: 4 }}>📢 下一位准备 · 请就位</div>
                <div className="text-one-line" style={{ fontSize: 22, fontWeight: 700, maxWidth: '100%' }}>
                  {displayData.next_racer.nickname}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：排行榜 */}
        <div style={{
          flex: '0 0 40%', background: colors.cardBg,
          borderRadius: 16, padding: 24,
          border: `1px solid ${colors.border}`,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrophyOutlined style={{ color: colors.goldHighlight }} /> 本场实时排行榜
            <span style={{ fontSize: 14, fontWeight: 400, color: colors.textSecondary }}>
              （{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}）
            </span>
          </div>
          {displayData.leaderboard.length > 0 ? (
            <div>
              {/* 表头 */}
              <div style={{ display: 'flex', padding: '8px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 14, color: colors.textSecondary, fontWeight: 500 }}>
                <div style={{ width: 50 }}>排名</div>
                <div style={{ flex: 1, textAlign: 'left', paddingLeft: 20 }}>选手</div>
                <div style={{ width: 120, textAlign: 'left' }}>用时</div>
              </div>
              {displayData.leaderboard.slice(0, 10).map((entry, i) => {
                const rankColors: Record<number, string> = {
                  1: colors.goldHighlight, 2: '#c0c0c0', 3: '#cd7f32',
                };
                const bgColors: Record<number, string> = {
                  1: isLight ? 'rgba(184,134,11,0.08)' : 'rgba(255,215,0,0.08)',
                  2: isLight ? 'rgba(192,192,192,0.08)' : 'rgba(192,192,192,0.06)',
                  3: isLight ? 'rgba(205,127,50,0.08)' : 'rgba(205,127,50,0.06)',
                };
                return (
                  <div key={i} style={{
                    display: 'flex', padding: '10px 0',
                    borderBottom: `1px solid ${colors.border}`,
                    alignItems: 'center',
                    background: bgColors[entry.rank],
                    borderRadius: i < 3 ? 6 : 0,
                    marginBottom: i < 3 ? 2 : 0,
                    paddingLeft: i < 3 ? 8 : 0,
                    paddingRight: i < 3 ? 8 : 0,
                  }}>
                    <div style={{
                      width: 50, fontSize: 20, fontWeight: 700,
                      color: rankColors[entry.rank] || colors.text,
                    }}>
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                    </div>
                    <div style={{ flex: 1, fontSize: 17, fontWeight: entry.rank <= 3 ? 600 : 400, paddingLeft: 20, overflow: 'hidden' }}>
                      <span className="text-one-line">{entry.nickname}</span>
                    </div>
                    <div style={{
                      width: 120, fontSize: 16, textAlign: 'right',
                      fontFamily: 'monospace',
                      color: entry.rank <= 3 ? colors.goldHighlight : colors.textSecondary,
                    }}>
                      {formatTimeMs(entry.finish_time_ms)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty description="暂无成绩" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
      </div>

      {/* highlightPulse 动画 */}
      <style>{`
        @keyframes highlightPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
