import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getCurrentContext } from '../../utils/api';
import NoContextBanner from '../../components/NoContextBanner';

/**
 * 裁判首页（公众号菜单"裁判入口"跳转页）
 *
 * 流程：
 * 1. 检查 localStorage 是否有 token
 * 2. 有 token → 检测裁判身份 → 进 /referee/match
 * 3. 无 token → 跳 /referee/login（触发静默授权）
 */
export default function HomePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [noContext, setNoContext] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      // 无登录态 → 去登录页触发静默 OAuth
      navigate('/referee/login', { replace: true });
      return;
    }

    // 检查运营商上下文
    getCurrentContext().then((ctx) => {
      if (!ctx?.operatorId) {
        setNoContext(true);
      }
    }).catch(() => {});

    // 有 token → 校验是否裁判，直接进主页
    api.get('/auth/me')
      .then((user: any) => {
        if (user?.role === 'referee') {
          navigate('/referee/match', { replace: true });
        } else {
          navigate('/referee/login', { replace: true });
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/referee/login', { replace: true });
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  // 无运营商上下文时展示引导页（不自动跳转）
  if (noContext && !checking) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 160, height: 160 }} /></div>
          <div className="referee-login-role"><span className="referee-login-role-icon">📋</span> 裁判工作台</div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📍</div>
            <NoContextBanner />
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
        <div className="referee-login-role"><span className="referee-login-role-icon">📋</span> 裁判工作台</div>
        <div className="referee-login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>正在进入裁判工作台...</p>
        </div>
      </div>
    </div>
  );
}
