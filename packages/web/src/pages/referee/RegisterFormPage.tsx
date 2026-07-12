import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { message } from 'antd';
import api from '../../utils/api';

/**
 * 裁判注册表单 v3 — 扫码→客服消息推送→点链接到此页
 * 参数: invite_id, operator_id
 */
export default function RegisterFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteId = searchParams.get('invite_id') || '';
  const operatorId = searchParams.get('operator_id') || '';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!inviteId) { setError('缺少邀请信息'); setLoading(false); return; }
    api.get('/referee/invite/' + inviteId)
      .then((data: any) => {
        setInviteInfo(data);
        if (data?.status === 'expired') setError('该邀请链接已过期');
        else if (data?.status === 'used') setError('该邀请链接已被使用');
      })
      .catch((err: any) => setError(err?.response?.data?.message || err?.message || '获取邀请信息失败'))
      .finally(() => setLoading(false));
  }, [inviteId]);

  const handleSubmit = async () => {
    if (!name.trim()) { message.warning('请填写姓名'); return; }
    if (!/^\d{11}$/.test(phone)) { message.warning('请填写正确的11位手机号'); return; }
    setSubmitting(true);
    try {
      await api.post('/referee/register', { invite_id: inviteId, operator_id: operatorId, name: name.trim(), phone });
      navigate('/referee/register-success', { replace: true });
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
    <div className="referee-login-page" style={{ display: 'block', overflow: 'auto', padding: '16px 0' }}>
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 16px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 20 }}>
          <div className="referee-login-role" style={{ background: 'rgba(7,193,96,0.06)', border: '1px solid rgba(7,193,96,0.12)', color: '#07c160', display: 'inline-flex', marginBottom: 12 }}>
            <span className="referee-login-role-icon">📋</span> 裁判注册
          </div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>请填写您的姓名和手机号完成注册</p>
        </div>
        <div className="referee-login-card" style={{ padding: '24px 20px' }}>
          {inviteInfo && (
            <div style={{ background: 'rgba(7,193,96,0.05)', border: '1px solid rgba(7,193,96,0.1)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, textAlign: 'center' }}>
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
