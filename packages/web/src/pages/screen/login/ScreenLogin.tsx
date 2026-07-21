import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../../utils/api';

export default function ScreenLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const venueId = searchParams.get('venueId') || '';
  // venueName 直接用 searchParams（和 venueId 一致），不搞 window.location.search
  const venueName = searchParams.get('venueName') || '';
  const [activationCode, setActivationCode] = useState('');
  const [activated, setActivated] = useState(false);
  const [venueClosed, setVenueClosed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [expired, setExpired] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 激活后 2 秒自动跳转到大屏
  useEffect(() => {
    if (!activated) return;
    sessionStorage.setItem('screen_activated', 'true');
    const timer = setTimeout(() => {
      navigate(`/screen/display?venueId=${venueId}`, { replace: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [activated, navigate, venueId]);

  const generateCode = useCallback(() => {
    const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    setActivationCode(code);
    setExpired(false);
    if (timerRef.current) clearInterval(timerRef.current);
    return code;
  }, []);

  const connectWS = useCallback((code: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = import.meta.env.VITE_WS_URL ||
      `${protocol}://${window.location.host}/ws/screen`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'screen_login',
        activation_code: code,
        venueId: venueId,
        venueName: venueName || '',
      }));
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'activated') {
          setActivated(true);
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      ws.close();
    };
    wsRef.current = ws;
  }, [venueId, venueName]);

  useEffect(() => {
    const code = generateCode();
    connectWS(code);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, [generateCode, connectWS]);

  const handleRefresh = () => {
    wsRef.current?.close();
    const code = generateCode();
    connectWS(code);
  };

  // 赛场已关闭
  if (venueClosed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 24, padding: 24 }}>
        <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,77,79,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 64 }}>🚫</span>
        </div>
        <h1 style={{ fontSize: 36, color: '#ff4d4f', margin: 0 }}>赛场已关闭</h1>
        <p style={{ fontSize: 20, color: '#aaa', margin: 0 }}>本赛场目前处于关闭状态，无法激活大屏</p>
        {venueName && <p style={{ fontSize: 18, color: '#888' }}>📍 {venueName}</p>}
      </div>
    );
  }

  if (activated) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'flex-start', minHeight: '100vh', gap: 24, padding: '5vh 24px 24px',
      }}>
        <div style={{
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(82,196,26,0.2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />
        </div>
        <h1 style={{ fontSize: 48, color: '#52c41a', margin: 0 }}>激活成功！</h1>
        <p style={{ fontSize: 24, color: '#aaa' }}>
          已绑定赛场：<span style={{ color: '#fff', fontWeight: 600 }}>{venueName}</span>
        </p>
        <p style={{ fontSize: 18, color: '#666' }}>即将进入赛场大屏...</p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', minHeight: '100vh', gap: 24, padding: '5vh 24px 24px',
    }}>
      {/* 标题 */}
      <div style={{ textAlign: 'center' }}>
        <img src="/iron-dog-logo.png" alt="铁甲快狗" style={{ width: 200, marginBottom: 16 }} />
        <p style={{ fontSize: 20, color: '#888', marginTop: 8 }}>
          赛场大屏展示端
        </p>
        {venueName && (
          <p style={{ fontSize: 24, color: '#ff9a3c', marginTop: 4, fontWeight: 600 }}>
            📍 {venueName}
          </p>
        )}
      </div>

      {/* 激活码展示区 */}
      <div style={{
        background: 'rgba(255,255,255,0.95)', borderRadius: 20,
        padding: '48px 40px', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        minWidth: 320,
      }}>
        <p style={{
          fontSize: 20, color: '#333', marginBottom: 28, fontWeight: 500,
        }}>
          请输入以下激活码激活大屏
        </p>

        {/* 6位纯数字激活码大字 */}
        <div style={{
          fontSize: 72, fontFamily: 'monospace', fontWeight: 800,
          letterSpacing: 16, color: '#ff6b35',
          marginBottom: 12, textAlign: 'center',
          paddingLeft: 16,
        }}>
          {activationCode}
        </div>

        {/* 激活码永久有效 */}
        <div style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', background: '#52c41a',
            marginRight: 6,
          }} />
          激活码长期有效
        </div>

        <div
          onClick={handleRefresh}
          style={{
            cursor: 'pointer', color: '#ff6b35',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 14, userSelect: 'none',
          }}
        >
          <ReloadOutlined /> 刷新激活码
        </div>
      </div>

      {/* 底部提示 */}
      <p style={{
        color: '#555', fontSize: 14, textAlign: 'center',
        maxWidth: 400, lineHeight: 1.8,
      }}>
        在裁判端输入上方6位激活码即可激活本大屏。
        <br />
        激活后大屏将自动显示该赛场的实时竞赛画面。
      </p>
    </div>
  );
}
