import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';

/**
 * 裁判登录页 v6
 * - 微信内打开 → 静默授权（snsapi_base）→ 服务号回调 → 带 openid_auth 参数返回
 * - 非微信（手机浏览器）→ 直接显示手机号输入框
 * - 手机号验证 → 1个运营商直接登录 / N个选一 / 0个提示未注册
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('正在验证身份...');
  const [isWechat, setIsWechat] = useState(false);

  // 手机号验证步骤
  const [phoneStep, setPhoneStep] = useState<'phone' | 'select' | 'done'>('phone');
  const [phone, setPhone] = useState('');
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);
  const [operators, setOperators] = useState<Array<{
    refereeId: string;
    refereeName: string;
    operatorId: string;
    operatorName: string;
  }>>([]);

  const isWechatBrowser = () => /micromessenger/i.test(navigator.userAgent);

  const doSilentOAuth = () => {
    const appId = 'wx22a4891531ce5fe7';
    const redirectUri = encodeURIComponent('https://amberrobot.com.cn/api/v1/wechat/callback');
    const state = '__login__';
    window.location.href =
      `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}` +
      `&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;
  };

  // 提交手机号验证
  const handlePhoneSubmit = async () => {
    if (!phone.trim()) {
      setError('请输入手机号');
      return;
    }
    setPhoneSubmitting(true);
    setError('');
    try {
      const res: any = await api.post('/auth/referee-bind', { phone: phone.trim() });
      const { status, token, user, operators: ops } = res;

      if (status === 'success' && token) {
        localStorage.setItem('token', token);
        if (user) localStorage.setItem('referee_user_info', JSON.stringify(user));
        setPhoneStep('done');
        navigate('/referee/match', { replace: true });
      } else if (status === 'need_select' && ops) {
        setOperators(ops);
        setPhoneStep('select');
      } else if (status === 'not_registered') {
        setError('该手机号未注册裁判资格，请联系赛事运营商获取邀请');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '验证失败');
    } finally {
      setPhoneSubmitting(false);
    }
  };

  // 选择运营商
  const handleOperatorSelect = async (operatorId: string) => {
    setError('');
    try {
      const res: any = await api.post('/auth/referee-bind', {
        phone: phone.trim(),
        operator_id: operatorId,
      });
      const { status, token, user } = res;
      if (status === 'success' && token) {
        localStorage.setItem('token', token);
        if (user) localStorage.setItem('referee_user_info', JSON.stringify(user));
        setPhoneStep('done');
        navigate('/referee/match', { replace: true });
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
    }
  };

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
      // 非微信 → 直接显示手机号输入框
      setLoading(false);
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

  // ====== 错误 ======
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
            <button
              onClick={() => { setError(''); setPhoneStep('phone'); setPhone(''); }}
              style={{
                marginTop: 16, padding: '10px 24px', borderRadius: 8,
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 14,
              }}
            >
              重新输入
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ====== 运营商选择步骤 ======
  if (phoneStep === 'select') {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
          <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px', fontSize: 14 }}>
              检测到您关联了多个运营商，请选择登录
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {operators.map((op) => (
                <button
                  key={op.operatorId}
                  onClick={() => handleOperatorSelect(op.operatorId)}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15,
                    border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{op.operatorName}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                    裁判：{op.refereeName}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ====== 手机号输入 ======
  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div className="referee-login-box">
        <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
        <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
        <div className="referee-login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px', fontSize: 14 }}>
            请输入注册裁判时的手机号
          </p>
          <input
            type="tel"
            placeholder="手机号"
            maxLength={11}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePhoneSubmit(); }}
            autoFocus
            style={{
              width: '100%', maxWidth: 260, padding: '12px 16px', borderRadius: 8,
              background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 16,
              border: '1px solid rgba(255,255,255,0.15)', outline: 'none',
              textAlign: 'center', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handlePhoneSubmit}
            disabled={phoneSubmitting}
            style={{
              display: 'block', margin: '16px auto 0', width: '100%', maxWidth: 260,
              padding: '12px 0', borderRadius: 8, fontSize: 15, fontWeight: 600,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', cursor: phoneSubmitting ? 'not-allowed' : 'pointer',
              opacity: phoneSubmitting ? 0.6 : 1,
            }}
          >
            {phoneSubmitting ? '验证中...' : '验证手机号登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
