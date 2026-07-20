import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'sms' | 'password'>('sms');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    const p = phone.trim();
    if (!p) { setError('请输入手机号'); return; }
    if (!/^1[3-9]\d{9}$/.test(p)) { setError('手机号格式不正确'); return; }
    setSendingCode(true);
    setError('');
    try {
      await api.post('/auth/send-code', { phone: p });
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err?.response?.data?.message || '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSmsLogin = async () => {
    const p = phone.trim();
    if (!p) { setError('请输入手机号'); return; }
    if (!/^1[3-9]\d{9}$/.test(p)) { setError('手机号格式不正确'); return; }
    if (!code || code.length !== 6) { setError('请输入6位验证码'); return; }
    setLoading(true);
    setError('');
    try {
      const res: any = await api.post('/auth/login', { phone: p, code, role: 'referee' });
      localStorage.setItem('token', res.token);
      if (res.user) localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
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

  const handleLogin = () => {
    if (tab === 'sms') handleSmsLogin();
    else handlePasswordLogin();
  };

  const styles: Record<string, React.CSSProperties> = {
    input: {
      display: 'block', margin: '0 auto', width: '100%', maxWidth: 260,
      padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.06)',
      color: '#fff', fontSize: 16, border: '1px solid rgba(255,255,255,0.15)',
      outline: 'none', textAlign: 'center', boxSizing: 'border-box',
    },
    codeInput: {
      flex: 1, padding: '12px 16px', borderRadius: '8px 0 0 8px',
      background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 16,
      border: '1px solid rgba(255,255,255,0.15)', borderRight: 'none',
      outline: 'none', textAlign: 'center', boxSizing: 'border-box',
    },
    tabBtn: (active: boolean, hasBorder: boolean): React.CSSProperties => ({
      flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 600,
      background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
      color: active ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
      border: 'none', cursor: 'pointer',
      borderRight: hasBorder ? '1px solid rgba(255,255,255,0.12)' : 'none',
    }),
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

        <div style={{ display: 'flex', marginBottom: 24, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
          <button onClick={() => { setTab('sms'); setError(''); }} style={styles.tabBtn(tab === 'sms', true)}>📱 验证码登录</button>
          <button onClick={() => { setTab('password'); setError(''); }} style={styles.tabBtn(tab === 'password', false)}>🔑 密码登录</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={{ textAlign: 'center' }}>
          <input type="tel" placeholder="手机号" maxLength={11}
            value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }} autoFocus
            style={styles.input} />

          {tab === 'sms' ? (
            <div style={{ display: 'flex', margin: '10px auto 0', width: '100%', maxWidth: 260 }}>
              <input type="tel" placeholder="验证码" maxLength={6}
                value={code} onChange={(e) => { setCode(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSmsLogin(); }}
                style={styles.codeInput} />
              <button onClick={handleSendCode} disabled={sendingCode || countdown > 0}
                style={{
                  padding: '0 14px', borderRadius: '0 8px 8px 0', fontSize: 13,
                  whiteSpace: 'nowrap', fontWeight: 500,
                  background: (sendingCode || countdown > 0)
                    ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: (sendingCode || countdown > 0) ? 'rgba(255,255,255,0.3)' : '#fff',
                  border: '1px solid rgba(255,255,255,0.15)', borderLeft: 'none',
                  cursor: (sendingCode || countdown > 0) ? 'not-allowed' : 'pointer',
                }}
              >{sendingCode ? '发送中' : countdown > 0 ? `${countdown}s` : '获取验证码'}</button>
            </div>
          ) : (
            <input type="password" placeholder="密码"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordLogin(); }}
              style={{ ...styles.input, margin: '10px auto 0' }} />
          )}

          <button onClick={handleLogin} disabled={loading} style={styles.submitBtn}>
            {loading ? '登录中...' : '登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
