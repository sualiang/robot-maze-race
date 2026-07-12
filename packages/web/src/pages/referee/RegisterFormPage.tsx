import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Cascader, DatePicker, Input, Radio, message } from 'antd';
import dayjs from 'dayjs';
import api from '../../utils/api';

interface RegionOption {
  code: string;
  name: string;
  children?: RegionOption[];
}

export default function RegisterFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const oauthCode = searchParams.get('code') || '';

  // OAuth state
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthDone, setOauthDone] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [refereeId, setRefereeId] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState('');

  // Profile popup
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  // Full form (manual)
  const [showFullForm, setShowFullForm] = useState(false);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [idCard, setIdCard] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [birthDate, setBirthDate] = useState<dayjs.Dayjs | null>(null);
  const [regionValues, setRegionValues] = useState<(string | number)[]>([]);
  const [address, setAddress] = useState('');
  const [experience, setExperience] = useState('');

  // OAuth callback
  useEffect(() => {
    if (oauthCode) handleMpOAuth(oauthCode);
  }, [oauthCode]);

  useEffect(() => { fetchRegions(); }, []);

  const fetchRegions = async () => {
    try { const data: any = await api.get('/operator/regions'); setRegions(data || []); } catch { /* ignore */ }
  };

  const handleMpOAuth = async (code: string) => {
    setOauthLoading(true); setOauthError('');
    try {
      const res: any = await api.post('/auth/wx-mp-login', { code });
      const { token: jwtToken, user, is_new_user, referee_id } = res;
      localStorage.setItem('token', jwtToken);
      localStorage.setItem('referee_user_info', JSON.stringify(user));
      if (is_new_user) {
        setIsNewUser(true);
        setRefereeId(referee_id || user.id);
        setShowProfilePopup(true);
        setOauthDone(true);
      } else {
        navigate('/referee/match', { replace: true });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '微信授权登录失败';
      setOauthError(msg);
    } finally { setOauthLoading(false); }
  };

  const handleWechatLogin = () => {
    const currentUrl = window.location.href.split('?')[0];
    window.location.href = `/api/v1/referee/invite/${token}/oauth?redirect=${encodeURIComponent(`${currentUrl}?token=${token}`)}`;
  };

  const handleProfileSubmit = async () => {
    if (!profileName.trim()) { message.warning('请填写姓名'); return; }
    if (!/^\d{11}$/.test(profilePhone)) { message.warning('请填写正确的11位手机号'); return; }
    setProfileSubmitting(true);
    try {
      await api.patch(`/referees/${refereeId}/profile`, { name: profileName.trim(), phone: profilePhone });
      message.success('资料已保存');
      setShowProfilePopup(false);
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '保存失败');
    } finally { setProfileSubmitting(false); }
  };

  const getRegionNames = (): { province: string; city: string; district: string } => {
    if (regionValues.length < 3) return { province: '', city: '', district: '' };
    let provinceName = '', cityName = '', districtName = '';
    for (const prov of regions) {
      if (prov.code === String(regionValues[0])) {
        provinceName = prov.name;
        if (prov.children) for (const ct of prov.children) {
          if (ct.code === String(regionValues[1])) {
            cityName = ct.name;
            if (ct.children) for (const dt of ct.children) {
              if (dt.code === String(regionValues[2])) { districtName = dt.name; break; }
            }
            break;
          }
        }
        break;
      }
    }
    return { province: provinceName, city: cityName, district: districtName };
  };

  const handleSubmit = async () => {
    if (!name.trim()) { message.warning('请填写姓名'); return; }
    if (!/^\d{11}$/.test(phone)) { message.warning('请填写正确的11位手机号'); return; }
    if (!/^\d{17}[\dXx]$/.test(idCard)) { message.warning('请填写正确的18位身份证号'); return; }
    if (!birthDate) { message.warning('请选择出生日期'); return; }
    if (regionValues.length < 3) { message.warning('请选择完整的省市区'); return; }
    if (!address.trim()) { message.warning('请填写详细地址'); return; }
    const { province, city, district } = getRegionNames();
    setSubmitting(true);
    try {
      await api.post('/referee/register', {
        invite_token: token, name: name.trim(), phone, id_card: idCard,
        gender: gender === 'male' ? '男' : '女', birth_date: birthDate!.format('YYYY-MM-DD'),
        province, city, district, address: address.trim(), experience: experience.trim(),
      });
      navigate('/referee/register-success', { replace: true });
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '提交失败，请重试');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="referee-login-page" style={{ display: 'block', overflow: 'auto', padding: '16px 0' }}>
      <div className="referee-login-glow-1" /><div className="referee-login-glow-2" />

      {/* Profile Popup for new users */}
      {showProfilePopup && (
        <div className="referee-overlay">
          <div className="referee-detail-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 18, fontWeight: 600, textAlign: 'center' }}>完善个人资料</h3>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>请填写您的姓名和手机号以完成注册</p>
            <div className="referee-login-field">
              <label className="referee-login-label">姓名 *</label>
              <input className="referee-login-input" placeholder="请输入真实姓名" value={profileName} onChange={(e) => setProfileName(e.target.value)} maxLength={20} />
            </div>
            <div className="referee-login-field">
              <label className="referee-login-label">手机号 *</label>
              <input className="referee-login-input" placeholder="请输入11位手机号" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value.replace(/\D/g, ''))} maxLength={11} type="tel" />
            </div>
            <button className="referee-login-btn" onClick={handleProfileSubmit} disabled={profileSubmitting} style={{ marginTop: 16, background: 'linear-gradient(135deg, #07c160, #06ad56)', boxShadow: '0 4px 20px rgba(7, 193, 96, 0.3)', letterSpacing: 2 }}>
              {profileSubmitting ? '保存中...' : '确认并完成注册'}
            </button>
          </div>
        </div>
      )}

      {oauthLoading && (
        <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 16px 40px', textAlign: 'center', paddingTop: 60 }}>
          <div className="referee-login-role" style={{ background: 'rgba(7,193,96,0.06)', border: '1px solid rgba(7,193,96,0.12)', color: '#07c160', display: 'inline-flex', marginBottom: 12 }}>
            <span className="referee-login-role-icon">⏳</span> 正在验证微信授权...
          </div>
        </div>
      )}

      {!oauthLoading && !showFullForm && (
        <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 16px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 20 }}>
            <div className="referee-login-role" style={{ background: 'rgba(7,193,96,0.06)', border: '1px solid rgba(7,193,96,0.12)', color: '#07c160', display: 'inline-flex', marginBottom: 12 }}>
              <span className="referee-login-role-icon">📋</span> 裁判注册
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
              {oauthDone ? '授权完成，请完善个人资料' : '请使用微信授权完成注册'}
            </p>
          </div>
          <div className="referee-login-card" style={{ padding: '24px 20px', textAlign: 'center' }}>
            {oauthError && <div className="referee-login-error">{oauthError}</div>}
            {!oauthDone && (
              <>
                <button className="referee-login-btn" onClick={handleWechatLogin} style={{ background: 'linear-gradient(135deg, #07c160, #06ad56)', boxShadow: '0 4px 20px rgba(7,193,96,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z"/></svg>
                  微信授权登录
                </button>
                <div style={{ textAlign: 'center', margin: '20px 0' }}><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>—————— 或 ——————</span></div>
                <button className="referee-login-btn" onClick={() => setShowFullForm(true)} style={{ background: 'transparent', border: '1px solid rgba(7,193,96,0.3)', color: '#07c160', boxShadow: 'none', letterSpacing: 2 }}>
                  手动填写注册信息
                </button>
              </>
            )}
            <div className="referee-login-hint">{oauthDone ? '请在弹窗中填写姓名和手机号完成注册' : '使用微信服务号授权快捷登录，仅限已获邀请的赛事裁判'}</div>
          </div>
        </div>
      )}

      {/* Full form (manual registration) */}
      {showFullForm && (
        <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 16px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 20 }}>
            <div className="referee-login-role" style={{ background: 'rgba(7,193,96,0.06)', border: '1px solid rgba(7,193,96,0.12)', color: '#07c160', display: 'inline-flex', marginBottom: 12 }}>
              <span className="referee-login-role-icon">✍️</span> 填写注册信息
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>请如实填写以下信息，以便运营商审核</p>
          </div>
          <div className="referee-login-card" style={{ padding: '24px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="referee-login-field"><label className="referee-login-label">姓名 *</label><input className="referee-login-input" placeholder="请输入真实姓名" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} /></div>
              <div className="referee-login-field"><label className="referee-login-label">手机号 *</label><input className="referee-login-input" placeholder="请输入11位手机号" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} maxLength={11} type="tel" /></div>
              <div className="referee-login-field"><label className="referee-login-label">身份证号 *</label><input className="referee-login-input" placeholder="请输入18位身份证号" value={idCard} onChange={(e) => setIdCard(e.target.value.toUpperCase())} maxLength={18} /></div>
              <div className="referee-login-field">
                <label className="referee-login-label">性别 *</label>
                <Radio.Group value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: '100%' }}>
                  <Radio.Button value="male" style={{ width: '50%', textAlign: 'center', height: 44, lineHeight: '44px', background: gender === 'male' ? 'rgba(7,193,96,0.15)' : 'rgba(255,255,255,0.04)', border: gender === 'male' ? '1px solid rgba(7,193,96,0.3)' : '1px solid rgba(255,255,255,0.08)', color: gender === 'male' ? '#07c160' : 'rgba(255,255,255,0.6)', borderRadius: '10px 0 0 10px' }}>🙋‍♂️ 男</Radio.Button>
                  <Radio.Button value="female" style={{ width: '50%', textAlign: 'center', height: 44, lineHeight: '44px', background: gender === 'female' ? 'rgba(7,193,96,0.15)' : 'rgba(255,255,255,0.04)', border: gender === 'female' ? '1px solid rgba(7,193,96,0.3)' : '1px solid rgba(255,255,255,0.08)', color: gender === 'female' ? '#07c160' : 'rgba(255,255,255,0.6)', borderRadius: '0 10px 10px 0' }}>🙋‍♀️ 女</Radio.Button>
                </Radio.Group>
              </div>
              <div className="referee-login-field"><label className="referee-login-label">出生日期 *</label><DatePicker value={birthDate} onChange={(date) => setBirthDate(date)} placeholder="请选择出生日期" style={{ width: '100%', height: 44 }} disabledDate={(current) => current && current > dayjs()} /></div>
              <div className="referee-login-field"><label className="referee-login-label">省级地区 *</label><Cascader options={regions} value={regionValues} onChange={(value) => setRegionValues(value || [])} placeholder="请选择省/市/区" style={{ width: '100%' }} fieldNames={{ label: 'name', value: 'code', children: 'children' }} /></div>
              <div className="referee-login-field"><label className="referee-login-label">详细地址 *</label><input className="referee-login-input" placeholder="请输入详细地址（街道/门牌号）" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} /></div>
              <div className="referee-login-field"><label className="referee-login-label">运动经历/简介（选填）</label><textarea className="referee-login-input" placeholder="请简要介绍您的运动经历或执裁经验" value={experience} onChange={(e) => setExperience(e.target.value)} maxLength={500} rows={4} style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }} /></div>
            </div>
            <button className="referee-login-btn" onClick={handleSubmit} disabled={submitting} style={{ marginTop: 24, background: 'linear-gradient(135deg, #07c160, #06ad56)', boxShadow: '0 4px 20px rgba(7,193,96,0.3)', letterSpacing: 2 }}>
              {submitting ? <span className="referee-login-loading">提交中<span className="referee-login-dot-anim">...</span></span> : '提交注册信息'}
            </button>
            <button className="referee-login-btn" onClick={() => setShowFullForm(false)} style={{ marginTop: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)', boxShadow: 'none', letterSpacing: 1 }}>
              返回微信授权登录
            </button>
            <div className="referee-login-hint">提交后请等待运营商审核，审核结果将通过微信服务号通知</div>
          </div>
        </div>
      )}
    </div>
  );
}
