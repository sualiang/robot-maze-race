import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { message } from 'antd';
import api from '../../utils/api';

/**
 * 裁判注册表单 v3 — 扫码→客服消息链接→此页→自动OAuth→填写姓名手机号
 * 参数: invite_id + operator_id
 *
 * 流程:
 *  1. 首次进入（无 code）→ 自动跳转微信 OAuth 授权
 *  2. OAuth 回调（有 code）→ code 换登录态 → 展示表单
 */
export default function RegisterFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteId = searchParams.get('invite_id') || '';
  const operatorId = searchParams.get('operator_id') || '';
  const code = searchParams.get('code') || '';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Step 1: 首次进入无 code → 自动触发 OAuth
  useEffect(() => {
    if (inviteId && !code) {
      const redirectPath = `/referee/register?invite_id=${encodeURIComponent(inviteId)}&operator_id=${encodeURIComponent(operatorId)}`;
      const oauthUrl = `/api/v1/auth/mp-oauth/authorize?redirect=${encodeURIComponent(redirectPath)}&scope=snsapi_userinfo`;
      window.location.href = oauthUrl;
      return;
    }
  }, [inviteId, operatorId, code]);

  // Step 2: OAuth 回调 → 用 code 调用 GET /auth/mp-oauth 换 JWT
  useEffect(() => {
    if (!code) return;
    setLoading(true);
    api.get('/auth/mp-oauth?code=' + encodeURIComponent(code))
      .then((res: any) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('referee_user_info', JSON.stringify(res.user));
        // 清除 URL 中的 code/state 参数
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        window.history.replaceState({}, '', url.toString());

        // 已有裁判记录 → 直接跳转裁判页，不展示注册表单
        if (!res.is_new_user) {
          navigate('/referee/match', { replace: true });
          return;
        }
        setLoading(false);
      })
      .catch((err: any) => {
        setError('微信授权登录失败，请重新打开链接');
        setLoading(false);
      });
  }, [code]);

  // Step 3: 已登录 → 加载邀请信息
  useEffect(() => {
    if (!inviteId || !!code || loading) return;
    api.get('/referee/invite/' + inviteId)
      .then((data: any) => {
        setInviteInfo(data);
        if (data?.status === 'expired') setError('该邀请链接已过期');
        else if (data?.status === 'used') setError('该邀请链接已被使用');
      })
      .catch((err: any) => setError(err?.response?.data?.message || err?.message || '获取邀请信息失败'))
      .finally(() => setLoading(false));
  }, [inviteId, code, loading]);

  const handleSubmit = async () => {
    if (!name.trim()) { message.warning('请填写姓名'); return; }
    if (!/^\d{11}$/.test(phone)) { message.warning('请填写正确的11位手机号'); return; }
    setSubmitting(true);
    try {
      const res: any = await api.post('/referee/register', {
        invite_id: inviteId,
        operator_id: operatorId,
        name: name.trim(),
        phone,
      });
      if (res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      }
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '提交失败');
    } finally { setSubmitting(false); }
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
          <div className="referee-login-logo">
            <img src="/logo-avatar.png" alt="铁甲快狗" style={{ width: 120, height: 120 }} />
          </div>
          <div className="referee-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
            <h2 style={{ color: '#e94560', margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>邀请链接无效</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="referee-login-page" style={{ display: 'block', overflowY: 'auto', padding: '24px 16px 48px' }}>
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '0 12px 48px', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 20 }}>
          <div className="referee-login-role" style={{ background: 'rgba(7,193,96,0.06)', border: '1px solid rgba(7,193,96,0.12)', color: '#07c160', display: 'inline-flex', marginBottom: 12 }}>
            <span className="referee-login-role-icon">📋</span> 裁判注册
          </div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>请填写您的姓名和手机号完成注册</p>
        </div>
        <div className="referee-login-card" style={{ padding: '24px 20px' }}>
          {inviteInfo && (
            <div style={{ background: 'rgba(7,193,96,0.05)', border: '1px solid rgba(7,193,96,0.1)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, textAlign: 'center', wordBreak: 'break-all', overflowWrap: 'break-word' }}>
              {inviteInfo.operator_name && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 4px' }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>运营商：</span><strong style={{ color: '#fff' }}>{inviteInfo.operator_name}</strong></p>}
              {inviteInfo.venue_name && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: 0 }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>赛场：</span><strong style={{ color: '#fff' }}>{inviteInfo.venue_name}</strong></p>}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="referee-login-field">
              <label className="referee-login-label">姓名 *</label>
              <input className="referee-login-input" placeholder="请输入真实姓名" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
            </div>
            <div className="referee-login-field">
              <label className="referee-login-label">手机号 *</label>
              <input className="referee-login-input" placeholder="请输入11位手机号" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} maxLength={11} type="tel" />
            </div>
          </div>
          <button className="referee-login-btn" onClick={handleSubmit} disabled={submitting} style={{ marginTop: 24, background: 'linear-gradient(135deg, #07c160, #06ad56)', boxShadow: '0 4px 20px rgba(7,193,96,0.3)', letterSpacing: 2 }}>
            {submitting ? '提交中...' : '提交注册信息'}
          </button>
          <div className="referee-login-hint" style={{ marginTop: 20 }}>注册信息仅用于赛事裁判身份认证</div>
        </div>
      </div>
    </div>
  );
}
