import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

/**
 * 裁判登录页 v7
 * - 手机号 + 密码 登录
 * - 调 POST /api/v1/auth/login { phone, password, role: 'referee' }
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const p = phone.trim();
    if (!p) {
      setError('请输入手机号');
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(p)) {
      setError('手机号格式不正确');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res: any = await api.post('/auth/login', {
        phone: p,
        password,
        role: 'referee',
      });
      localStorage.setItem('token', res.token);
      if (res.user) localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

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
              onClick={() => setError('')}
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

  // ====== 登录表单 ======
  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div className="referee-login-box">
        <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
        <div className="referee-login-role"><span className="referee-login-role-icon">⚡</span> 裁判工作台</div>
        <div className="referee-login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px', fontSize: 14 }}>
            请输入运营商分配的裁判账号
          </p>
          <input
            type="tel"
            placeholder="手机号"
            maxLength={11}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
            style={{
              width: '100%', maxWidth: 260, padding: '12px 16px', borderRadius: 8,
              background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 16,
              border: '1px solid rgba(255,255,255,0.15)', outline: 'none',
              textAlign: 'center', boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
            style={{
              display: 'block', margin: '10px auto 0', width: '100%', maxWidth: 260,
              padding: '12px 16px', borderRadius: 8,
              background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 16,
              border: '1px solid rgba(255,255,255,0.15)', outline: 'none',
              textAlign: 'center', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              display: 'block', margin: '16px auto 0', width: '100%', maxWidth: 260,
              padding: '12px 0', borderRadius: 8, fontSize: 15, fontWeight: 600,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
