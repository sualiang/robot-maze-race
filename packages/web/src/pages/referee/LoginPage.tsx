import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 检查 URL 是否带有微信 OAuth 回调的 ?code=xxx
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      handleMpOAuth(code);
    }
  }, [searchParams]);

  /** 用微信 OAuth code 换取 token */
  const handleMpOAuth = async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res: any = await api.post('/auth/wx-mp-login', { code });
      localStorage.setItem('token', res.token);
      localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '微信授权登录失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /** 跳转微信服务号授权页面 */
  const handleWechatLogin = () => {
    handleDevLogin();
  };

  /** P0 fix: dev mode login via wx-mp-login, skip WeChat OAuth redirect */
  const handleDevLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res: any = await api.post('/auth/wx-mp-login', { code: 'dev-test-code' });
      localStorage.setItem('token', res.token);
      if (res.user) {
        localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      }
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '登录失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="referee-login-page">
      {/* 背景装饰 */}
      <div className="referee-login-glow-1" />
      <div className="referee-login-glow-2" />

      <div className="referee-login-box">
        {/* Logo */}
        <div className="referee-login-logo">
          <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 160, height: 160 }} />
        </div>

        {/* 裁判端标识 */}
        <div className="referee-login-role">
          <span className="referee-login-role-icon">⚡</span>
          裁判工作台
        </div>

        {/* 登录卡片 */}
        <div className="referee-login-card">
          {error && <div className="referee-login-error">{error}</div>}

          <button
            className="referee-login-btn"
            onClick={handleWechatLogin}
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #07c160, #06ad56)',
              boxShadow: '0 4px 20px rgba(7, 193, 96, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            {loading ? (
              <span className="referee-login-loading">
                登录中<span className="referee-login-dot-anim">...</span>
              </span>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.135 0 .243-.11.243-.245 0-.06-.024-.12-.04-.178l-.325-1.233a.492.492 0 0 1 .178-.554C23.028 18.48 24 16.82 24 14.98c0-3.21-2.931-5.952-7.062-6.122zM14.22 11.02c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm6.102 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982z" />
                </svg>
                微信授权登录
              </>
            )}
          </button>

          <div className="referee-login-hint">
            使用微信服务号授权快捷登录
            <br />
            仅限已授权的赛事裁判使用
          </div>
        </div>
      </div>
    </div>
  );
}
