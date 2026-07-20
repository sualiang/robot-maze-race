import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const p = phone.trim();
    if (!p) { setError('请输入手机号'); return; }
    if (!/^1[3-9]\d{9}$/.test(p)) { setError('手机号格式不正确'); return; }
    if (!password) { setError('请输入密码'); return; }
    setLoading(true);
    setError('');
    try {
      const res: any = await api.post('/auth/login', { phone: p, password });
      localStorage.setItem('token', res.token);
      if (res.user) localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    input: {
      display: 'block', margin: '0 auto', width: '100%', maxWidth: 260,
      padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.06)',
      color: '#fff', fontSize: 16, border: '1px solid rgba(255,255,255,0.15)',
      outline: 'none', textAlign: 'center', boxSizing: 'border-box',
    },
    errorBox: {
      marginBottom: 16, padding: '10px 14px', borderRadius: 8,
      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
      color: '#fca5a5', fontSize: 13, textAlign: 'center',
    } as React.CSSProperties,
    submitBtn: {
      display: 'block', margin: '16px auto 0', width: '100%', maxWidth: 260,
      padding: '12px 0', borderRadius: 8, fontSize: 15, fontWeight: 600,
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
      border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.6 : 1,
    },
  };

  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div className="referee-login-box">
        <div className="referee-login-logo">
          <img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} />
        </div>
        <div className="referee-login-role">
          <span className="referee-login-role-icon">⚡</span> 裁判工作台
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={{ textAlign: 'center' }}>
          <input type="tel" placeholder="手机号" maxLength={11}
            value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }} autoFocus
            style={styles.input} />
          <input type="password" placeholder="密码"
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
            style={{ ...styles.input, margin: '10px auto 0' }} />
          <button onClick={handleLogin} disabled={loading} style={styles.submitBtn}>
            {loading ? '登录中...' : '登录'}
          </button>
        </div>
      </div>
    </div>
  );
}