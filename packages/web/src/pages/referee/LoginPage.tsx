import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';

/**
 * 裁判登录页 v2
 * OAuth -> openid -> 老用户进主页 / 新用户提示联系运营商
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

  useEffect(() => {
    const openidAuth = searchParams.get('openid_auth');
    if (openidAuth) handleOpenidAuth(openidAuth);
  }, [searchParams]);

  const handleOpenidAuth = async (openid: string) => {
    setLoading(true); setStatusText('正在验证身份...');
    try {
      const res: any = await api.post('/auth/wx-mp-login', { code: '__oauth_' + openid });
      localStorage.setItem('token', res.token);
      if (res.user) localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
    } finally { setLoading(false); }
  };

  const handleLogin = () => {
    if (!isWeChat) { setError('请在微信客户端内打开'); return; }
    // use a generic token for login-only OAuth flow
    window.location.href = '/api/v1/referee/invite/__login__/oauth';
  };

  if (loading) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
          <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: 15 }}>{statusText || '正在验证...'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div className="referee-login-box">
        <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
        <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
        <div className="referee-login-card">
          {error && <div className="referee-login-error">{error}</div>}
          {isWeChat ? (
            <button className="referee-login-btn" onClick={handleLogin} style={{ background: 'linear-gradient(135deg, #07c160, #06ad56)', boxShadow: '0 4px 20px rgba(7,193,96,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" /></svg>
              微信快捷登录
            </button>
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
              <p>请在微信客户端内打开此页面</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>从「安博天智」服务号菜单点击"裁判入口"</p>
            </div>
          )}
          <div className="referee-login-hint">使用微信服务号授权快捷登录<br />仅限已授权的赛事裁判使用</div>
        </div>
      </div>
    </div>
  );
}
