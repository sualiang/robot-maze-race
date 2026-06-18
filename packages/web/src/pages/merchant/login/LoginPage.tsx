import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import merchantApi from '../../../utils/merchant-api';
import './styles.css';

export default function MerchantLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!phone || phone.length !== 11) {
      setError('请输入正确的11位手机号');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/merchant/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: phone, password }),
      });
      const json = await resp.json();
      if (json.code !== 0) {
        setError(json.message || '登录失败');
        return;
      }
      const res = json.data;
      localStorage.setItem('merchant_token', res.token);
      localStorage.setItem('merchant_user', JSON.stringify(res.admin || {}));
      navigate('/merchant/coupon', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '网络错误';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    if (!phone || phone.length !== 11) {
      setError('请输入正确的11位手机号（作为登录名）');
      return;
    }
    if (!password || password.length < 6) {
      setError('密码长度不能少于6位');
      return;
    }
    if (!inviteCode) {
      setError('请输入邀请码');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/merchant/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: phone, password, inviteCode, phone, realName: '' }),
      });
      const json = await resp.json();
      if (json.code !== 0) {
        setError(json.message || '注册失败');
        return;
      }
      setError('');
      setMode('login');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '网络错误';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="merchant-login-page">
      <div className="merchant-login-glow-1" />
      <div className="merchant-login-glow-2" />

      <div className="merchant-login-box">
        <div className="merchant-login-logo">
          <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 160, height: 160 }} />
        </div>

        <div className="merchant-login-role">
          <span className="merchant-login-role-icon">🏪</span>
          商家工作台
        </div>

        <div className="merchant-login-card">
          <div className="merchant-login-tabs">
            <span
              className={`merchant-login-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); }}
            >
              登录
            </span>
            <span
              className={`merchant-login-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(''); }}
            >
              注册
            </span>
          </div>

          {mode === 'register' && (
            <div className="merchant-login-field">
              <label className="merchant-login-label">邀请码</label>
              <input
                className="merchant-login-input"
                type="text"
                maxLength={10}
                placeholder="运营商提供的邀请码"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              />
            </div>
          )}

          <div className="merchant-login-field">
            <label className="merchant-login-label">手机号</label>
            <input
              className="merchant-login-input"
              type="tel"
              maxLength={11}
              placeholder="请输入11位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
            />
          </div>

          <div className="merchant-login-field">
            <label className="merchant-login-label">密码</label>
            <input
              className="merchant-login-input"
              type="password"
              placeholder={mode === 'register' ? '密码（至少6位）' : '请输入密码'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
            />
          </div>

          {error && <div className="merchant-login-error">{error}</div>}

          <button
            className="merchant-login-btn"
            onClick={mode === 'login' ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading ? (
              <span className="merchant-login-loading">处理中<span className="merchant-login-dot-anim">...</span></span>
            ) : (
              mode === 'login' ? '登录' : '注册'
            )}
          </button>

          {mode === 'register' && (
            <div style={{ textAlign: 'center', marginTop: 8, color: '#999', fontSize: 13 }}>
              已有账号？<span style={{ color: '#1890ff', cursor: 'pointer' }} onClick={() => { setMode('login'); setError(''); }}>去登录</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
