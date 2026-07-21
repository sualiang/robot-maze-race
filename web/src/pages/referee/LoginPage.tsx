import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';

/**
 * 裁判登录页 v3
 * 静默授权（snsapi_base）→ 已注册 openid 直接进 match
 * 公众号菜单"裁判入口"→此页
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('正在验证身份...');

  const doSilentOAuth = () => {
    const appId = 'wx22a4891531ce5fe7';
    const redirectUri = encodeURIComponent('https://amberrobot.com.cn/api/v1/wechat/callback');
    const state = '__login__';
    // snsapi_base: 静默授权，不弹窗，只拿 openid
    window.location.href =
      `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}` +
      `&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;
  };

  useEffect(() => {
    const openidAuth = searchParams.get('openid_auth');
    const notRegistered = searchParams.get('not_registered');

    if (openidAuth) {
      setStatusText('正在登录...');
      handleOpenidAuth(openidAuth);
    } else if (notRegistered === '1') {
      setLoading(false);
      setError('您尚未注册裁判资格，请联系赛事运营商获取邀请');
    } else {
      // 没有任何参数 → 发起静默授权
      doSilentOAuth();
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

  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div className="referee-login-box">
        <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
        <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
        <div className="referee-login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            {error || '请在微信客户端内打开此页面'}
          </p>
        </div>
      </div>
    </div>
  );
}
