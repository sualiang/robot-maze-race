import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Input, message } from 'antd';
import merchantApi from '../../../utils/merchant-api';
import './styles.css';

interface MerchantProfile {
  id: string;
  name: string;
  address: string;
  contactPhone: string;
  contactName: string;
  businessHours: string;
  logoUrl: string;
}

interface VerifyStats {
  today_count: number;
  month_count: number;
  total_count: number;
}

const TextArea = Input.TextArea;

export default function MerchantProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [stats, setStats] = useState<VerifyStats | null>(null);
  const [checkinCount, setCheckinCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
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
      setProfile({
        id: profileData?.merchant?.id || '',
        name: profileData?.merchant?.name || profileData?.username || '',
        address: profileData?.merchant?.address || '',
        contactPhone: profileData?.merchant?.contactPhone || '',
        contactName: profileData?.realName || '',
        businessHours: profileData?.merchant?.businessHours || '',
        logoUrl: profileData?.merchant?.logoUrl || '',
      });
      setStats(statsData);
      setCheckinCount(checkinData?.total_checkin ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = () => {
    if (!profile) return;
    setEditName(profile.name);
    setEditAddress(profile.address);
    setEditPhone(profile.contactPhone);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) { message.error('商家名称不能为空'); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('merchant_token');
      const resp = await fetch('/api/v1/merchant/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          merchantName: editName.trim(),
          merchantAddress: editAddress.trim(),
          contactPhone: editPhone.trim(),
        }),
      });
      const json = await resp.json();
      if (json.code === 0) {
        message.success('保存成功');
        setEditing(false);
        setProfile(prev => prev ? {
          ...prev,
          name: editName.trim(),
          address: editAddress.trim(),
          contactPhone: editPhone.trim(),
        } : prev);
      } else {
        message.error(json.message || '保存失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd) { message.error('请输入当前密码'); return; }
    if (!newPwd || newPwd.length < 6) { message.error('新密码至少6位'); return; }
    if (newPwd !== confirmPwd) { message.error('两次输入的密码不一致'); return; }

    setChangingPwd(true);
    try {
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
        <div className="mch-profile-logo-wrap">
          <div className="mch-profile-logo-placeholder">
            <span>🏪</span>
          </div>
        </div>
        <div className="mch-profile-info">
          <div className="mch-profile-name">{profile?.name || '商家名称'}</div>
          {profile?.address && (
            <div className="mch-profile-address">📍 {profile.address}</div>
          )}
          <div className="mch-profile-details">
            {profile?.contactPhone && <div>📞 {profile.contactPhone}</div>}
          </div>
        </div>
        <div className="mch-profile-edit-btn" onClick={startEdit}>编辑</div>
      </div>

      {/* 编辑弹窗 */}
      {editing && (
        <div className="mch-pwd-modal-overlay" onClick={() => setEditing(false)}>
          <div className="mch-pwd-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="mch-pwd-modal-title">编辑商家信息</div>

            <div className="mch-form-group">
              <label className="mch-form-label">商家名称</label>
              <Input
                className="mch-form-input"
                placeholder="请输入商家名称"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.04)', color: '#e8e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">地址</label>
              <TextArea
                className="mch-form-input"
                placeholder="请输入商家地址"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                rows={2}
                style={{ background: 'rgba(255,255,255,0.04)', color: '#e8e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">联系电话</label>
              <Input
                className="mch-form-input"
                placeholder="请输入联系电话"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.04)', color: '#e8e8f0', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>

            <div className="mch-modal-buttons">
              <button className="mch-modal-btn mch-modal-btn-cancel" onClick={() => setEditing(false)}>
                取消
              </button>
              <button
                className="mch-modal-btn mch-modal-btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

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
