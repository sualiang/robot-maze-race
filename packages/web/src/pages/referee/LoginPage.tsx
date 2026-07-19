import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import api from '../../utils/api';

/**
 * 裁判登录页 v4
 * - 微信内打开 → 静默授权（snsapi_base）
 * - 非微信（手机浏览器）→ 展示微信扫码登录二维码
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('正在验证身份...');
  const [isWechat, setIsWechat] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [scanState, setScanState] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWechatBrowser = () => /micromessenger/i.test(navigator.userAgent);

  const doSilentOAuth = () => {
    const appId = 'wx22a4891531ce5fe7';
    const redirectUri = encodeURIComponent('https://amberrobot.com.cn/api/v1/wechat/callback');
    const state = '__login__';
    window.location.href =
      `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}` +
      `&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;
  };

  // 生成扫码登录二维码
  const generateScanQR = async () => {
    try {
      const state = 'scan_' + crypto.randomUUID();
      setScanState(state);

      const appId = 'wx22a4891531ce5fe7';
      const redirectUri = encodeURIComponent('https://dog.amberrobot.com.cn/api/v1/wechat/callback');
      const oauthUrl =
        `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}` +
        `&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;

      const dataUrl = await QRCode.toDataURL(oauthUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#ffffff', light: '#0a0e27' },
      });
      setQrDataUrl(dataUrl);
      setLoading(false);

      // 开始轮询登录状态
      startPolling(state);
    } catch (e: any) {
      console.error('[LoginPage] QR generation error:', e);
      setError('二维码生成失败，请刷新重试');
      setLoading(false);
    }
  };

  const startPolling = (state: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setStatusText('请用微信扫码登录');

    pollTimerRef.current = setInterval(async () => {
      try {
        const res: any = await api.get(`/auth/scan-login-status?state=${encodeURIComponent(state)}`);
        const { status, token, user } = res;

        if (status === 'success' && token) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          localStorage.setItem('token', token);
          if (user) localStorage.setItem('referee_user_info', JSON.stringify(user));
          navigate('/referee/match', { replace: true });
        } else if (status === 'not_registered') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setStatusText('');
          setError('您尚未注册裁判资格，请联系赛事运营商获取邀请');
        }
        // status === 'pending' → continue polling
      } catch {
        // 网络错误忽略，继续轮询
      }
    }, 1500);
  };

  // 清理轮询 timer
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const openidAuth = searchParams.get('openid_auth');
    const notRegistered = searchParams.get('not_registered');

    const wechat = isWechatBrowser();
    setIsWechat(wechat);

    if (openidAuth) {
      setStatusText('正在登录...');
      handleOpenidAuth(openidAuth);
    } else if (notRegistered === '1') {
      setLoading(false);
      setError('您尚未注册裁判资格，请联系赛事运营商获取邀请');
    } else if (wechat) {
      // 微信内 → 发起静默授权
      doSilentOAuth();
    } else {
      // 非微信 → 展示扫码登录
      generateScanQR();
    }
  }, [searchParams]);

  const handleOpenidAuth = async (openid: string) => {
    try {
      const res: any = await api.post('/auth/wx-mp-login', { code: '__oauth_' + openid });
      localStorage.setItem('token', res.token);
      if (res.user) localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
      setLoading(false);
    }
  };

  // ====== 加载中 ======
  if (loading) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
          <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: 15 }}>{statusText}</p>
          </div>
        </div>
      </div>
    );
  }

  // ====== 错误（包括未注册） ======
  if (error) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
          <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // ====== 非微信环境 ======
  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div className="referee-login-box">
        <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
        <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
        <div className="referee-login-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px', fontSize: 14 }}>
            请使用微信扫描二维码登录
          </p>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="微信扫码登录"
              style={{ width: 200, height: 200, borderRadius: 8, marginBottom: 16 }}
            />
          )}
          {!qrDataUrl && (
            <div style={{ width: 200, height: 200, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>加载中...</span>
            </div>
          )}
          <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: 13 }}>{statusText}</p>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
