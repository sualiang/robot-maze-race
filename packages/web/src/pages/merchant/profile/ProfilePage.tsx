import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Input, message } from 'antd';
import merchantApi from '../../../utils/merchant-api';
import './styles.css';

interface MerchantProfile {
  id: string;
  name: string;
  address: string;
  contact_phone: string;
  contact_name: string;
  business_hours: string;
  logo_url: string;
}

interface VerifyStats {
  today_count: number;
  month_count: number;
  total_count: number;
}

export default function MerchantProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [stats, setStats] = useState<VerifyStats | null>(null);
  const [checkinCount, setCheckinCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [profileData, statsData, checkinData]: any[] = await Promise.all([
        merchantApi.get('/merchant/auth/profile'),
        merchantApi.get('/merchant/verify/stats'),
        merchantApi.get('/merchant/verify/stats').catch(() => ({ total_checkin: 0 })),
      ]);
      setProfile(profileData);
      setStats(statsData);
      setCheckinCount(checkinData?.total_checkin ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChangePassword = async () => {
    if (!oldPwd) { message.error('请输入当前密码'); return; }
    if (!newPwd || newPwd.length < 6) { message.error('新密码至少6位'); return; }
    if (newPwd !== confirmPwd) { message.error('两次输入的密码不一致'); return; }

    setChangingPwd(true);
    try {
      // 用 fetch 以避免 merchant_api 的 401 处理干扰
      const token = localStorage.getItem('merchant_token');
      const resp = await fetch('/api/v1/merchant/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          oldPassword: oldPwd,
          newPassword: newPwd,
          confirmPassword: confirmPwd,
        }),
      });
      const json = await resp.json();
      if (json.code === 0) {
        message.success('密码修改成功');
        setChangePwdOpen(false);
        setOldPwd('');
        setNewPwd('');
        setConfirmPwd('');
      } else {
        message.error(json.message || '密码修改失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setChangingPwd(false);
    }
  };

  const handleLogout = () => {
    Modal.confirm({
      title: '退出登录',
      content: '确定退出当前账号？',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        localStorage.removeItem('merchant_token');
        localStorage.removeItem('merchant_user');
        navigate('/merchant/login', { replace: true });
      },
    });
  };

  if (loading) {
    return (
      <div className="mch-profile-page">
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div className="mch-profile-page">
      {/* 商家基本信息 */}
      <div className="mch-profile-header">
        <div className="mch-profile-avatar">
          {profile?.name?.charAt(0) || '🏪'}
        </div>
        <div className="mch-profile-info">
          <div className="mch-profile-name">{profile?.name || '商家名称'}</div>
          <div className="mch-profile-details">
            {profile?.address && <div>📍 {profile.address}</div>}
            {profile?.contact_phone && <div>📞 {profile.contact_phone}</div>}
            {profile?.business_hours && <div>🕐 {profile.business_hours}</div>}
          </div>
        </div>
      </div>

      {/* 核销统计 */}
      {stats && (
        <div className="mch-stats-grid">
          <div className="mch-stat-card">
            <div className="mch-stat-value mch-stat-today">{stats.today_count}</div>
            <div className="mch-stat-label">今日核销</div>
          </div>
          <div className="mch-stat-card">
            <div className="mch-stat-value mch-stat-month">{stats.month_count}</div>
            <div className="mch-stat-label">本月核销</div>
          </div>
          <div className="mch-stat-card">
            <div className="mch-stat-value mch-stat-total">{stats.total_count}</div>
            <div className="mch-stat-label">累计核销</div>
          </div>
        </div>
      )}

      {/* 累计签到人数 */}
      <div className="mch-checkin-card">
        <span className="mch-checkin-label">📊 累计签到人数</span>
        <span className="mch-checkin-value">{checkinCount}</span>
      </div>

      {/* 操作列表 */}
      <div className="mch-action-list">
        <div className="mch-action-item" onClick={() => setChangePwdOpen(true)}>
          <div className="mch-action-left">
            <span className="mch-action-icon">🔑</span>
            <span className="mch-action-label">修改密码</span>
          </div>
          <span className="mch-action-arrow">&gt;</span>
        </div>
      </div>

      {/* 退出登录 */}
      <button className="mch-logout-btn" onClick={handleLogout}>
        退出登录
      </button>

      {/* 修改密码弹窗 */}
      {changePwdOpen && (
        <div className="mch-pwd-modal-overlay" onClick={() => setChangePwdOpen(false)}>
          <div className="mch-pwd-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="mch-pwd-modal-title">修改密码</div>

            <div className="mch-form-group">
              <label className="mch-form-label">当前密码</label>
              <Input.Password
                className="mch-form-input"
                placeholder="请输入当前密码"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.04)', color: '#e8e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">新密码</label>
              <Input.Password
                className="mch-form-input"
                placeholder="请输入新密码（至少6位）"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.04)', color: '#e8e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">确认新密码</label>
              <Input.Password
                className="mch-form-input"
                placeholder="请再次输入新密码"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.04)', color: '#e8e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>

            <div className="mch-modal-buttons">
              <button className="mch-modal-btn mch-modal-btn-cancel" onClick={() => setChangePwdOpen(false)}>
                取消
              </button>
              <button
                className="mch-modal-btn mch-modal-btn-primary"
                onClick={handleChangePassword}
                disabled={changingPwd}
              >
                {changingPwd ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
