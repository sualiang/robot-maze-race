import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import merchantApi from '../../../utils/merchant-api';
import './styles.css';

export default function MerchantLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [firstLoginOpen, setFirstLoginOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

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
      // 登录接口使用原生 fetch 以避免 merchantApi interceptor 在无 token 时干扰
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
      if (res.firstLogin) {
        setFirstLoginOpen(true);
      } else {
        navigate('/merchant/coupon', { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '网络错误';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('新密码长度不能少于6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('两次密码输入不一致');
      return;
    }
    setChangingPwd(true);
    try {
      const resp = await fetch('/api/v1/merchant/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('merchant_token') },
        body: JSON.stringify({ oldPassword: password, newPassword }),
      });
      const json = await resp.json();
      if (json.code !== 0) {
        alert(json.message || '修改密码失败');
        return;
      }
      setFirstLoginOpen(false);
      alert('密码修改成功');
      navigate('/merchant/coupon', { replace: true });
    } catch {
      alert('网络错误，请重试');
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="merchant-login-page">
      {/* 背景装饰 */}
      <div className="merchant-login-glow-1" />
      <div className="merchant-login-glow-2" />

      <div className="merchant-login-box">
        {/* Logo */}
        <div className="merchant-login-logo">
          <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 160, height: 160 }} />
        </div>

        {/* 商家端标识 */}
        <div className="merchant-login-role">
          <span className="merchant-login-role-icon">🏪</span>
          商家工作台
        </div>

        {/* 登录卡片 */}
        <div className="merchant-login-card">
          <div className="merchant-login-field">
            <label className="merchant-login-label">手机号</label>
            <input
              className="merchant-login-input"
              type="tel"
              maxLength={11}
              placeholder="请输入11位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <div className="merchant-login-field">
            <label className="merchant-login-label">密码</label>
            <input
              className="merchant-login-input"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {error && <div className="merchant-login-error">{error}</div>}

          <button
            className="merchant-login-btn"
            onClick={handleLogin}
            disabled={loading || phone.length !== 11 || !password}
          >
            {loading ? (
              <span className="merchant-login-loading">登录中<span className="merchant-login-dot-anim">...</span></span>
            ) : (
              '登录'
            )}
          </button>

          <div className="merchant-login-hint">
            账号由运营商统一创建，如需开通请联系运营商
          </div>
        </div>
      </div>

      {/* 首次登录修改密码弹窗 */}
      {firstLoginOpen && (
        <div className="merchant-pwd-overlay">
          <div className="merchant-pwd-modal">
            <div className="merchant-pwd-title">首次登录，请修改密码</div>
            <div className="merchant-pwd-field">
              <label className="merchant-login-label">新密码</label>
              <input
                className="merchant-login-input"
                type="password"
                placeholder="至少6位"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="merchant-pwd-field">
              <label className="merchant-login-label">确认密码</label>
              <input
                className="merchant-login-input"
                type="password"
                placeholder="再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button
              className="merchant-login-btn"
              onClick={handleChangePassword}
              disabled={changingPwd || !newPassword || !confirmPassword}
            >
              {changingPwd ? '修改中...' : '确认修改'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
