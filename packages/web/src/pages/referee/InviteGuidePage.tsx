import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface InviteInfo {
  operator_name: string;
  venue_name: string;
  status: string;
  expires_at: string;
  note: string;
}

export default function InviteGuidePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const code = searchParams.get('code') || '';

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bindDone, setBindDone] = useState(false);

  // Step 1: Load invite info
  useEffect(() => {
    if (!token) {
      setError('缺少邀请令牌，请检查链接是否完整');
      setLoading(false);
      return;
    }
    fetchInviteInfo();
  }, [token]);

  // Step 2: Handle OAuth callback (snsapi_base silent auth)
  useEffect(() => {
    if (code && token && inviteInfo) {
      handleBindOpenid(code);
    }
  }, [code, token, inviteInfo]);

  // Step 3: If no code yet, redirect via server-side OAuth entrypoint
  useEffect(() => {
    if (inviteInfo && !code && !error) {
      window.location.href = `https://amberrobot.com.cn/api/v1/referee/invite/${token}/oauth`;
    }
  }, [inviteInfo, code, error, token]);

  const fetchInviteInfo = async () => {
    try {
      const data: any = await api.get(`/referee/invite/${token}`);
      setInviteInfo(data);
      if (data.status === 'expired') {
        setError('该邀请链接已过期');
      } else if (data.status === 'used') {
        setError('该邀请链接已被使用');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '获取邀请信息失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Bind openid to invite after silent OAuth
  const handleBindOpenid = async (oauthCode: string) => {
    try {
      await api.post('/referee/bind-openid', {
        invite_token: token,
        code: oauthCode,
      });
      setBindDone(true);
      const newUrl = window.location.href.split('?')[0] + '?token=' + token;
      window.history.replaceState({}, '', newUrl);

      // 微信内：bind 成功后直接跳转服务号主页
      if (/MicroMessenger/i.test(navigator.userAgent)) {
        window.location.replace(
          'https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=__PLACEHOLDER__'
        );
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '绑定失败';
      console.error('[InviteGuide] bind-openid error:', msg);
      setBindDone(true);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" />
        <div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>加载邀请信息...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error page
  if (error && !inviteInfo) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" />
        <div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo">
            <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 120, height: 120 }} />
          </div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
            <h2 style={{ color: '#e94560', margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
              邀请链接无效
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 微信内：bind-openid 成功后自动跳服务号主页，不会渲染到这里
  // 如果到达这里说明还在 bind 中
  if (/MicroMessenger/i.test(navigator.userAgent)) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" />
        <div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              {bindDone ? '已完成身份校验...' : '正在校验身份...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 微信外：Service account QR + follow button
  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" />
      <div className="referee-login-glow-2" />

      <div className="referee-login-box">
        {/* Logo */}
        <div className="referee-login-logo">
          <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 100, height: 100 }} />
        </div>

        {/* Title */}
        <div
          className="referee-login-role"
          style={{
            background: 'rgba(7, 193, 96, 0.06)',
            border: '1px solid rgba(7, 193, 96, 0.12)',
            color: '#07c160',
          }}
        >
          <span className="referee-login-role-icon">📋</span>
          裁判注册邀请
        </div>

        {/* Invite info card */}
        <div className="referee-login-card" style={{ textAlign: 'center' }}>
          {/* Invite details */}
          <div
            style={{
              background: 'rgba(7, 193, 96, 0.05)',
              border: '1px solid rgba(7, 193, 96, 0.1)',
              borderRadius: 10,
              padding: '14px 16px',
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            {inviteInfo?.operator_name && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 4px' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>运营商：</span>
                <strong style={{ color: '#fff' }}>{inviteInfo.operator_name}</strong>
              </p>
            )}
            {inviteInfo?.venue_name && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 4px' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>赛场：</span>
                <strong style={{ color: '#fff' }}>{inviteInfo.venue_name}</strong>
              </p>
            )}
            {inviteInfo?.note && (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.6 }}>
                💬 {inviteInfo.note}
              </p>
            )}
          </div>

          {/* Guide: Follow service account */}
          <div style={{ fontSize: 36, marginBottom: 12 }}>📱</div>
          <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>
            请关注「安博天智」服务号完成注册
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
            请使用微信扫一扫关注服务号
            <br />
            关注后将收到注册邀请链接
          </p>

          {/* Service account QR code */}
          <div
            style={{
              background: '#fff',
              padding: 16,
              borderRadius: 12,
              display: 'inline-block',
              marginBottom: 16,
            }}
          >
            <img
              src="/wechat-mp-qrcode.png"
              alt="服务号二维码"
              style={{ width: 180, height: 180, display: 'block' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div
              style={{
                width: 180,
                height: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: 13,
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                <div>服务号二维码</div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>
                  请将 qrcode.png 放入 public 目录
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
            {bindDone ? '已绑定，关注服务号后即可注册' : '正在绑定...'}
          </div>

          {/* Button: Already followed */}
          <button
            className="referee-login-btn"
            onClick={() => navigate(`/referee/register?token=${token}`, { replace: true })}
            style={{
              background: 'linear-gradient(135deg, #07c160, #06ad56)',
              boxShadow: '0 4px 20px rgba(7, 193, 96, 0.3)',
              letterSpacing: 2,
            }}
          >
            我已关注，继续注册
          </button>

          <div className="referee-login-hint" style={{ marginTop: 20 }}>
            关注安博天智服务号，获取赛事通知
            <br />
            仅限已收到邀请的赛事裁判使用
          </div>
        </div>
      </div>
    </div>
  );
}
