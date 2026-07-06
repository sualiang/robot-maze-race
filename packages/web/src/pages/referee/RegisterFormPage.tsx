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

  const inviteToken = searchParams.get('invite_token') || '';

  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [idCard, setIdCard] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [birthDate, setBirthDate] = useState<dayjs.Dayjs | null>(null);
  const [regionValues, setRegionValues] = useState<(string | number)[]>([]);
  const [address, setAddress] = useState('');
  const [experience, setExperience] = useState('');

  // 加载省市区数据
  useEffect(() => {
    fetchRegions();
  }, []);

  const fetchRegions = async () => {
    try {
      const data: any = await api.get('/operator/regions');
      setRegions(data || []);
    } catch {
      message.warning('省市区数据加载失败，请刷新重试');
    }
  };

  // 从 Cascader 选择值中提取省市区名称
  const getRegionNames = (): { province: string; city: string; district: string } => {
    if (regionValues.length < 3) {
      return { province: '', city: '', district: '' };
    }
    const provinceCode = String(regionValues[0]);
    const cityCode = String(regionValues[1]);
    const districtCode = String(regionValues[2]);

    let provinceName = '';
    let cityName = '';
    let districtName = '';

    for (const prov of regions) {
      if (prov.code === provinceCode) {
        provinceName = prov.name;
        if (prov.children) {
          for (const city of prov.children) {
            if (city.code === cityCode) {
              cityName = city.name;
              if (city.children) {
                for (const dist of city.children) {
                  if (dist.code === districtCode) {
                    districtName = dist.name;
                    break;
                  }
                }
              }
              break;
            }
          }
        }
        break;
      }
    }

    return { province: provinceName, city: cityName, district: districtName };
  };

  const handleSubmit = async () => {
    // 校验
    if (!name.trim()) {
      message.warning('请填写姓名');
      return;
    }
    if (!/^\d{11}$/.test(phone)) {
      message.warning('请填写正确的11位手机号');
      return;
    }
    if (!/^\d{17}[\dXx]$/.test(idCard)) {
      message.warning('请填写正确的18位身份证号');
      return;
    }
    if (!birthDate) {
      message.warning('请选择出生日期');
      return;
    }
    if (regionValues.length < 3) {
      message.warning('请选择完整的省市区');
      return;
    }
    if (!address.trim()) {
      message.warning('请填写详细地址');
      return;
    }

    const { province, city, district } = getRegionNames();

    setSubmitting(true);
    try {
      await api.post('/referee/register', {
        invite_token: inviteToken,
        name: name.trim(),
        phone,
        id_card: idCard,
        gender: gender === 'male' ? '男' : '女',
        birth_date: birthDate.format('YYYY-MM-DD'),
        province,
        city,
        district,
        address: address.trim(),
        experience: experience.trim(),
      });

      navigate('/referee/register-success', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '提交失败，请重试';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="referee-login-page" style={{ display: 'block', overflow: 'auto', padding: '16px 0' }}>
      <div className="referee-login-glow-1" />
      <div className="referee-login-glow-2" />

      <div style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '0 16px',
        paddingBottom: 40,
      }}>
        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 20 }}>
          <div className="referee-login-role" style={{
            background: 'rgba(7, 193, 96, 0.06)',
            border: '1px solid rgba(7, 193, 96, 0.12)',
            color: '#07c160',
            display: 'inline-flex',
            marginBottom: 12,
          }}>
            <span className="referee-login-role-icon">✍️</span>
            填写注册信息
          </div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
            请如实填写以下信息，以便运营商审核
          </p>
        </div>

        {/* 表单卡片 */}
        <div className="referee-login-card" style={{ padding: '24px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 姓名 */}
            <div className="referee-login-field">
              <label className="referee-login-label">姓名 *</label>
              <input
                className="referee-login-input"
                placeholder="请输入真实姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
              />
            </div>

            {/* 手机号 */}
            <div className="referee-login-field">
              <label className="referee-login-label">手机号 *</label>
              <input
                className="referee-login-input"
                placeholder="请输入11位手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                maxLength={11}
                type="tel"
              />
            </div>

            {/* 身份证号 */}
            <div className="referee-login-field">
              <label className="referee-login-label">身份证号 *</label>
              <input
                className="referee-login-input"
                placeholder="请输入18位身份证号"
                value={idCard}
                onChange={(e) => setIdCard(e.target.value.toUpperCase())}
                maxLength={18}
              />
            </div>

            {/* 性别 */}
            <div className="referee-login-field">
              <label className="referee-login-label">性别 *</label>
              <Radio.Group
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                style={{ width: '100%' }}
              >
                <Radio.Button
                  value="male"
                  style={{
                    width: '50%',
                    textAlign: 'center',
                    height: 44,
                    lineHeight: '44px',
                    background: gender === 'male' ? 'rgba(7, 193, 96, 0.15)' : 'rgba(255,255,255,0.04)',
                    border: gender === 'male' ? '1px solid rgba(7, 193, 96, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                    color: gender === 'male' ? '#07c160' : 'rgba(255,255,255,0.6)',
                    borderRadius: '10px 0 0 10px',
                  }}
                >
                  🙋‍♂️ 男
                </Radio.Button>
                <Radio.Button
                  value="female"
                  style={{
                    width: '50%',
                    textAlign: 'center',
                    height: 44,
                    lineHeight: '44px',
                    background: gender === 'female' ? 'rgba(7, 193, 96, 0.15)' : 'rgba(255,255,255,0.04)',
                    border: gender === 'female' ? '1px solid rgba(7, 193, 96, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                    color: gender === 'female' ? '#07c160' : 'rgba(255,255,255,0.6)',
                    borderRadius: '0 10px 10px 0',
                  }}
                >
                  🙋‍♀️ 女
                </Radio.Button>
              </Radio.Group>
            </div>

            {/* 出生日期 */}
            <div className="referee-login-field">
              <label className="referee-login-label">出生日期 *</label>
              <DatePicker
                value={birthDate}
                onChange={(date) => setBirthDate(date)}
                placeholder="请选择出生日期"
                style={{ width: '100%', height: 44 }}
                disabledDate={(current) => current && current > dayjs()}
                maxDate={dayjs()}
              />
            </div>

            {/* 省市区 */}
            <div className="referee-login-field">
              <label className="referee-login-label">省级地区 *</label>
              <Cascader
                options={regions}
                value={regionValues}
                onChange={(value) => setRegionValues(value || [])}
                placeholder="请选择省/市/区"
                style={{ width: '100%' }}
                fieldNames={{ label: 'name', value: 'code', children: 'children' }}
                changeOnSelect={false}
              />
            </div>

            {/* 详细地址 */}
            <div className="referee-login-field">
              <label className="referee-login-label">详细地址 *</label>
              <input
                className="referee-login-input"
                placeholder="请输入详细地址（街道/门牌号）"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* 运动经历/简介 */}
            <div className="referee-login-field">
              <label className="referee-login-label">运动经历/简介（选填）</label>
              <textarea
                className="referee-login-input"
                placeholder="请简要介绍您的运动经历或执裁经验"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                maxLength={500}
                rows={4}
                style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            className="referee-login-btn"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              marginTop: 24,
              background: 'linear-gradient(135deg, #07c160, #06ad56)',
              boxShadow: '0 4px 20px rgba(7, 193, 96, 0.3)',
              letterSpacing: 2,
            }}
          >
            {submitting ? (
              <span className="referee-login-loading">
                提交中<span className="referee-login-dot-anim">...</span>
              </span>
            ) : (
              '提交注册信息'
            )}
          </button>

          <div className="referee-login-hint">
            提交后请等待运营商审核，审核结果将通过微信服务号通知
          </div>
        </div>
      </div>
    </div>
  );
}
