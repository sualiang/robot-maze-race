import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface InviteInfo {
  operator_name: string;
  venue_name: string;
  status: string;
  expires_at: string;
  note: string;
}

export default function InviteRegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const code = searchParams.get('code') || '';

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [showQrGuide, setShowQrGuide] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // 第一步：获取邀请信息
  useEffect(() => {
    if (!token) {
      setError('缺少邀请令牌，请检查链接是否完整');
      setLoading(false);
      return;
    }
    fetchInviteInfo();
  }, [token]);

  // 第二步：如果 URL 带有 OAuth code，处理微信登录回调
  useEffect(() => {
    if (code && token) {
      handleOAuthCallback(code);
    }
  }, [code, token]);

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

  // OAuth 回调处理
  const handleOAuthCallback = async (oauthCode: string) => {
    setOauthLoading(true);
    setError('');
    try {
      const res: any = await api.get('/auth/mp-oauth', { params: { code: oauthCode } });
      localStorage.setItem('token', res.token);
      localStorage.setItem('referee_user_info', JSON.stringify(res.user));

      // 检查是否已关注服务号
      await checkSubscribeStatus();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '微信授权登录失败';
      setError(msg);
      setOauthLoading(false);
    }
  };

  // 检查关注状态
  const checkSubscribeStatus = useCallback(async () => {
    try {
      const data: any = await api.get('/auth/mp-oauth/subscribe-status');
      if (data.subscribed) {
        // 已关注，跳转信息提交页
        navigate(`/referee/register?invite_token=${token}`, { replace: true });
        return;
      }
      // 未关注，显示二维码引导
      setShowQrGuide(true);
      setOauthLoading(false);
      // 开始轮询
      startPolling();
    } catch {
      // 查询失败，默认跳转注册页
      navigate(`/referee/register?invite_token=${token}`, { replace: true });
    }
  }, [token, navigate]);

  // 轮询关注状态
  const startPolling = useCallback(() => {
    setSubscribing(true);
    const interval = setInterval(async () => {
      try {
        const data: any = await api.get('/auth/mp-oauth/subscribe-status');
        setPollCount((c) => c + 1);
        if (data.subscribed) {
          clearInterval(interval);
          setSubscribing(false);
          navigate(`/referee/register?invite_token=${token}`, { replace: true });
        }
        // 最多轮询 60 次（3 分钟），超时后停止
        if (pollCount > 60) {
          clearInterval(interval);
          setSubscribing(false);
        }
      } catch {
        // 忽略轮询错误
      }
    }, 3000);

    // 5 分钟后自动停止轮询
    setTimeout(() => {
      clearInterval(interval);
      setSubscribing(false);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token, navigate, pollCount]);

  // 微信授权登录
  const handleWechatLogin = () => {
    const currentUrl = window.location.href.split('?')[0];
    const redirectParam = encodeURIComponent(`${currentUrl}?token=${token}`);
    window.location.href = `/api/v1/auth/mp-oauth/authorize?redirect=${redirectParam}`;
  };

  // 已关注，跳过引导
  const handleAlreadyFollowed = () => {
    navigate(`/referee/register?invite_token=${token}`, { replace: true });
  };

  // 加载中
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

  // 错误页面
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

  // OAuth 登录中
  if (oauthLoading) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" />
        <div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>
              <span className="referee-login-dot-anim">⏳</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: 15 }}>
              正在验证微信授权...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 关注引导页面（微信授权后未关注）
  if (showQrGuide) {
    return (
      <div className="referee-login-page">
        <div className="referee-login-glow-1" />
        <div className="referee-login-glow-2" />
        <div className="referee-login-box">
          <div className="referee-login-logo">
            <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 100, height: 100 }} />
          </div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📱</div>
            <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>
              请关注微信服务号
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
              请使用微信扫一扫关注服务号完成认证
              <br />
              关注后将自动跳转注册信息填写页面
            </p>

            {/* 服务号二维码 */}
            <div style={{
              background: '#fff',
              padding: 16,
              borderRadius: 12,
              display: 'inline-block',
              marginBottom: 16,
            }}>
              <img
                src="/wechat-mp-qrcode.png"
                alt="服务号二维码"
                style={{ width: 180, height: 180, display: 'block' }}
                onError={(e) => {
                  // 二维码图片加载失败时显示占位符
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div style={{
                width: 180,
                height: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: 13,
              }}>
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
              {subscribing ? (
                <span>正在等待您关注服务号<span className="referee-login-dot-anim">...</span></span>
              ) : (
                <span>关注后自动跳转</span>
              )}
            </div>

            <button
              className="referee-login-btn"
              onClick={handleAlreadyFollowed}
              style={{
                background: 'linear-gradient(135deg, #07c160, #06ad56)',
                boxShadow: '0 4px 20px rgba(7, 193, 96, 0.3)',
                letterSpacing: 2,
              }}
            >
              我已关注，继续注册
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 正常邀请页面
  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" />
      <div className="referee-login-glow-2" />

      <div className="referee-login-box">
        {/* Logo */}
        <div className="referee-login-logo">
          <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 120, height: 120 }} />
        </div>

        {/* 邀请标题 */}
        <div className="referee-login-role" style={{ background: 'rgba(7, 193, 96, 0.06)', border: '1px solid rgba(7, 193, 96, 0.12)', color: '#07c160' }}>
          <span className="referee-login-role-icon">📋</span>
          裁判注册邀请
        </div>

        {/* 邀请信息卡片 */}
        <div className="referee-login-card">
          {error && <div className="referee-login-error">{error}</div>}

          <div style={{
            background: 'rgba(7, 193, 96, 0.05)',
            border: '1px solid rgba(7, 193, 96, 0.1)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 20,
            textAlign: 'center',
          }}>
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
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, margin: '8px 0 0' }}>
              邀请有效期至 {inviteInfo?.expires_at ? new Date(inviteInfo.expires_at).toLocaleString('zh-CN') : '-'}
            </p>
          </div>

          {inviteInfo?.note && (
            <div style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: 12,
              textAlign: 'center',
              marginBottom: 16,
              lineHeight: 1.6,
            }}>
              💬 {inviteInfo.note}
            </div>
          )}

          {/* 微信授权登录按钮 */}
          <button
            className="referee-login-btn"
            onClick={handleWechatLogin}
            disabled={!!error}
            style={{
              background: 'linear-gradient(135deg, #07c160, #06ad56)',
              boxShadow: '0 4px 20px rgba(7, 193, 96, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" />
            </svg>
            微信授权登录
          </button>

          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>——————</span>
          </div>

          {/* 已关注，跳过引导 */}
          <button
            className="referee-login-btn"
            onClick={handleAlreadyFollowed}
            style={{
              background: 'transparent',
              border: '1px solid rgba(7, 193, 96, 0.3)',
              color: '#07c160',
              boxShadow: 'none',
              letterSpacing: 2,
            }}
          >
            我已关注服务号，直接注册
          </button>

          <div className="referee-login-hint" style={{ marginTop: 20 }}>
            仅限已收到邀请的赛事裁判使用
            <br />
            未关注服务号需先微信扫码关注
          </div>
        </div>
      </div>
    </div>
  );
}
