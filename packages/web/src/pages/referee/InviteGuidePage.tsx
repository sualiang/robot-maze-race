import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';

/**
 * 邀请引导页 v2
 * - 显示服务号二维码
 * - "我已关注，继续注册" -> OAuth
 */
export default function InviteGuidePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('缺少邀请令牌'); setLoading(false); return; }
    api.get('/referee/invite/' + token)
      .then((data: any) => {
        setInviteInfo(data);
        if (data?.status === 'expired') setError('邀请已过期');
        else if (data?.status === 'used') setError('邀请已被使用');
      })
      .catch((err: any) => setError(err?.response?.data?.message || err?.message || '获取邀请信息失败'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleFollowed = () => {
    window.location.href = '/api/v1/referee/invite/' + token + '/oauth';
  };

  if (loading) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>加载邀请信息...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 120, height: 120 }} /></div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
            <h2 style={{ color: '#e94560', margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>邀请链接无效</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div className="referee-login-box">
        <div className="referee-login-logo"><img src="/logo-avatar.png" alt="logo" style={{ width: 100, height: 100 }} /></div>
        <div className="referee-login-role" style={{ background: 'rgba(7,193,96,0.06)', border: '1px solid rgba(7,193,96,0.12)', color: '#07c160' }}>
          <span className="referee-login-role-icon">📋</span> 裁判注册邀请
        </div>
        <div className="referee-login-card" style={{ textAlign: 'center' }}>
          {inviteInfo && (
            <div style={{ background: 'rgba(7,193,96,0.05)', border: '1px solid rgba(7,193,96,0.1)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              {inviteInfo.operator_name && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 4px' }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>运营商：</span><strong style={{ color: '#fff' }}>{inviteInfo.operator_name}</strong></p>}
              {inviteInfo.venue_name && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: 0 }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>赛场：</span><strong style={{ color: '#fff' }}>{inviteInfo.venue_name}</strong></p>}
            </div>
          )}
          <div style={{ fontSize: 36, marginBottom: 12 }}>📱</div>
          <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>关注「安博天智」服务号</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>请使用微信扫一扫关注服务号<br />关注后将自动收到注册邀请</p>
          <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 16 }}>
            <img src="/wechat-mp-qrcode.png" alt="服务号二维码" style={{ width: 180, height: 180, display: 'block' }} />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>长按识别二维码关注</div>
          <button className="referee-login-btn" onClick={handleFollowed} style={{ background: 'linear-gradient(135deg, #07c160, #06ad56)', boxShadow: '0 4px 20px rgba(7,193,96,0.3)', letterSpacing: 2 }}>
            我已关注，继续注册
          </button>
          <div className="referee-login-hint" style={{ marginTop: 20 }}>关注安博天智服务号，获取赛事通知<br />仅限已收到邀请的赛事裁判使用</div>
        </div>
      </div>
    </div>
  );
}
