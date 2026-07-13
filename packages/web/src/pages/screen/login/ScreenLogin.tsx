import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';

export default function ScreenLogin() {
  const navigate = useNavigate();
  const [activationCode, setActivationCode] = useState('');
  const [activated, setActivated] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [expired, setExpired] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 激活后 2 秒自动跳转到大屏
  useEffect(() => {
    if (!activated) return;
    const timer = setTimeout(() => {
      navigate('/screen/display', { replace: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [activated, navigate]);

  const generateCode = useCallback(() => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setActivationCode(code);
    setExpired(false);
    setCountdown(60);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setExpired(true);
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

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
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'activated') {
          setActivated(true);
          setVenueName(msg.data?.venue_name || '赛场');
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    const code = generateCode();
    connectWS(code);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      wsRef.current?.close();
    };
  }, [generateCode, connectWS]);

  const handleRefresh = () => {
    wsRef.current?.close();
    const code = generateCode();
    connectWS(code);
  };

  if (activated) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 24,
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
      justifyContent: 'center', height: '100vh', gap: 24,
    }}>
      {/* 标题 */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🐕</div>
        <h1 style={{
          fontSize: 48, margin: 0, fontWeight: 800,
          background: 'linear-gradient(90deg, #ff6b35, #ff9a3c)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          机器狗迷宫竞速
        </h1>
        <p style={{ fontSize: 20, color: '#888', marginTop: 8 }}>
          赛场大屏展示端
        </p>
      </div>

      {/* 二维码激活区 */}
      <div style={{
        background: 'rgba(255,255,255,0.95)', borderRadius: 20,
        padding: '40px 48px', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <p style={{
          fontSize: 22, color: '#333', marginBottom: 24, fontWeight: 500,
        }}>
          请使用 <span style={{ color: '#ff6b35', fontWeight: 700 }}>裁判小程序</span> 扫码激活
        </p>

        {/* 二维码 */}
        <div style={{
          display: 'inline-block', padding: 16,
          background: '#fff', borderRadius: 12,
          border: '2px solid #f0f0f0',
        }}>
          {activationCode ? (
            <QRCode
              value={`robotmaze://activate-screen?code=${activationCode}`}
              size={220}
              bordered={false}
              status={expired ? 'expired' : 'active'}
            />
          ) : (
            <div style={{
              width: 220, height: 220, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: '#f5f5f5', borderRadius: 8,
            }}>
              <LoadingOutlined style={{ fontSize: 32, color: '#ccc' }} />
            </div>
          )}
        </div>

        {/* 激活码和倒计时 */}
        <div style={{ marginTop: 20 }}>
          <div style={{
            fontSize: 32, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: 8, color: '#ff6b35',
            marginBottom: 8,
          }}>
            {activationCode}
          </div>
          <div style={{ fontSize: 14, color: expired ? '#f5222d' : '#999' }}>
            {expired ? (
              <span>二维码已过期，请刷新</span>
            ) : (
              <>
                <span style={{
                  display: 'inline-block', width: 8, height: 8,
                  borderRadius: '50%', background: '#52c41a',
                  marginRight: 6,
                }} />
                有效期剩余 {countdown} 秒
              </>
            )}
          </div>
          <div
            onClick={handleRefresh}
            style={{
              marginTop: 12, cursor: 'pointer', color: '#ff6b35',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 14, userSelect: 'none',
            }}
          >
            <ReloadOutlined spin={false} /> 刷新二维码
          </div>
        </div>
      </div>

      {/* 底部提示 */}
      <p style={{
        color: '#555', fontSize: 14, textAlign: 'center',
        maxWidth: 400, lineHeight: 1.8,
      }}>
        打开裁判小程序，扫描上方二维码即可激活本大屏。
        <br />
        激活后大屏将自动显示该赛场的实时竞赛画面。
      </p>
    </div>
  );
}
