import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useOperatorContext } from '../../hooks/useOperatorContext';
import NoContextBanner from '../../components/NoContextBanner';
import './styles.css';

interface UserInfo {
  nickname: string;
  avatar: string;
  phone: string;
  role: string;
}

interface VenueInfo {
  id: string;
  name: string;
  address: string;
  status: string;
}

interface AttendanceRecord {
  id: number;
  checkin_at: string;
  checkout_at: string | null;
  venue_id: string;
  venue_name?: string;
}

const BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api/v1', '') || '';

function getToken(): string {
  return localStorage.getItem('token') || '';
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const { hasContext, loading: contextLoading } = useOperatorContext();

  const fetchData = useCallback(async () => {
    const token = getToken();
    if (!token) { navigate('/referee/login'); return; }

    try {
      // 用户信息
      const userRes = await fetch(`${BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await userRes.json();
      if (userData.code === 0) {
        const u = userData.data;
        setUser({
          nickname: u.nickname || u.name || '裁判',
          avatar: u.avatar || '',
          phone: u.phone || '未绑定',
          role: '裁判员',
        });
      }

      // 签到记录
      const attendanceRes = await fetch(`${BASE}/api/v1/referees/attendance/records`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const attData = await attendanceRes.json();
      if (attData.code === 0) {
        setRecords(attData.data || []);
      }

      // 赛场信息（取最近一次签到关联的赛场）
      const statusRes = await fetch(`${BASE}/api/v1/referees/attendance/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statusData = await statusRes.json();
      if (statusData.code === 0 && statusData.data?.venueId) {
        setVenue({
          id: statusData.data.venueId,
          name: statusData.data.venueName || '默认赛场',
          address: statusData.data.venueInfo?.address || '',
          status: statusData.data.checkedIn ? '运营中' : '已关闭',
        });
      }

      setLoading(false);
    } catch (e) {
      console.error('[Profile] 加载数据失败', e);
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const queryHistory = useCallback(async (date: string) => {
    if (!date) { setHistoryError('请选择日期'); return; }
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res: any = await api.get('/referees/attendance/records', { params: { date } });
      setHistoryRecords(res || []);
    } catch (e) {
      setHistoryError('查询失败，请稍后重试');
      setHistoryRecords([]);
    }
    setHistoryLoading(false);
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatTimeOnly = (iso: string) => {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDateOnly = (iso: string) => {
    return new Date(iso).toLocaleDateString('zh-CN');
  };

  // 退出登录
  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/referee/login');
  };

  if (loading) {
    return (
      <div className="referee-page">
        <div className="referee-card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 16, color: 'var(--ref-text-dim)' }}>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="referee-page" style={{ paddingBottom: 80 }}>
      {/* 无运营商上下文时显示引导条 */}
      {!hasContext && !contextLoading && <NoContextBanner />}

      {/* 个人信息卡片 */}
      <div className="referee-card" style={{ padding: 24, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 30, background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fff', fontWeight: 700,
            overflow: 'hidden', flexShrink: 0,
          }}>
            {user?.avatar ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (user?.nickname?.charAt(0) || '裁')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ref-text)' }}>{user?.nickname || '裁判'}</div>
            <div style={{ fontSize: 14, color: 'var(--ref-text-dim)', marginTop: 4 }}>
              {user?.role || '裁判员'} · {user?.phone || '未绑定手机'}
            </div>
          </div>
        </div>
      </div>



      {/* 签到考勤记录 */}
      <div className="referee-card" style={{ padding: 20, marginTop: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ref-text)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 最近签到记录</span>
          <button className="referee-btn referee-btn-outline referee-btn-sm" onClick={() => { setShowHistoryModal(true); }} style={{ fontSize: 12, padding: '4px 10px' }}>查询签到/签退记录</button>
        </div>
        {records.length === 0 ? (
          <div style={{ fontSize: 14, color: 'var(--ref-text-dim)', textAlign: 'center', padding: 20 }}>暂无签到记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {records.slice(0, 5).map((r) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'flex-start',
                padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                fontSize: 13, color: 'var(--ref-text-dim)',
              }}>
                {/* 左侧：日期 + 赛场名称 靠左 */}
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ color: 'var(--ref-text)', fontWeight: 500 }}>{formatDateOnly(r.checkin_at)}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.venue_name || r.venue_id}</div>
                </div>
                {/* 右侧：签到时间 + 签退时间 靠右 */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#27ae60', fontSize: 13 }}>签到 {formatTimeOnly(r.checkin_at)}</div>
                  {r.checkout_at && <div style={{ color: '#e74c3c', fontSize: 13, marginTop: 2 }}>签退 {formatTimeOnly(r.checkout_at)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 功能按钮区 */}
      <div className="referee-card" style={{ padding: 16, marginTop: 16 }}>
        <button
          className="referee-btn"
          style={{ width: '100%', background: '#1890ff', color: '#fff', marginBottom: 12 }}
          onClick={() => { setShowPasswordModal(true); setPasswordError(''); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}
        >🔑 修改密码</button>
        <button
          className="referee-btn"
          style={{ width: '100%', background: '#e74c3c', color: '#fff' }}
          onClick={handleLogout}
        >🚪 退出登录</button>
      </div>

      {/* 历史签到/签退记录查询弹窗 */}
      {showHistoryModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }} onClick={() => setShowHistoryModal(false)}>
          <div style={{
            width: '85%', maxWidth: 380, padding: 24, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            background: '#fff', borderRadius: 12,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 16 }}>查询签到/签退记录</div>
            {/* 日期输入 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd',
                  background: '#f5f5f5', color: '#333', fontSize: 14, outline: 'none',
                }}
              />
              <button
                className="referee-btn referee-btn-primary"
                onClick={() => queryHistory(historyDate)}
                disabled={historyLoading}
                style={{ padding: '10px 16px' }}
              >{historyLoading ? '查询中...' : '查询'}</button>
            </div>
            {historyError && <div style={{ fontSize: 13, color: '#e74c3c', marginBottom: 12 }}>{historyError}</div>}
            {/* 查询结果 */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {historyRecords.length === 0 ? (
                <div style={{ fontSize: 14, color: '#999', textAlign: 'center', padding: 20 }}>该日暂无签到记录</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {historyRecords.map((r) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 8, background: '#f8f8f8',
                      fontSize: 13, color: '#999',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{ color: '#333', fontWeight: 500 }}>{formatDateOnly(r.checkin_at)}</div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.venue_name || r.venue_id}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: '#27ae60', fontSize: 13 }}>签到 {formatTimeOnly(r.checkin_at)}</div>
                        {r.checkout_at && <div style={{ color: '#e74c3c', fontSize: 13, marginTop: 2 }}>签退 {formatTimeOnly(r.checkout_at)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              style={{ width: '100%', marginTop: 12, padding: '10px 0', border: '1px solid #ddd', borderRadius: 8, background: '#f5f5f5', color: '#333', fontSize: 14, cursor: 'pointer' }}
              onClick={() => setShowHistoryModal(false)}
            >关闭</button>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }} onClick={() => setShowPasswordModal(false)}>
          <div style={{
            width: '85%', maxWidth: 380, padding: 24, background: '#fff', borderRadius: 12,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#333', marginBottom: 16 }}>🔑 修改密码</div>
            {passwordError && <div style={{ fontSize: 13, color: '#e74c3c', marginBottom: 12, background: '#fff5f5', padding: '8px 12px', borderRadius: 6 }}>{passwordError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="password"
                placeholder="请输入旧密码"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}
              />
              <input
                type="password"
                placeholder="请输入新密码（8位以上，含大小写字母+数字）"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}
              />
              <input
                type="password"
                placeholder="请再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                style={{ flex: 1, padding: '10px 0', border: '1px solid #ddd', borderRadius: 8, background: '#f5f5f5', color: '#333', fontSize: 14, cursor: 'pointer' }}
                onClick={() => setShowPasswordModal(false)}
              >取消</button>
              <button
                style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 8, background: '#1890ff', color: '#fff', fontSize: 14, cursor: 'pointer' }}
                onClick={async () => {
                  setPasswordError('');
                  if (!oldPassword) { setPasswordError('请输入旧密码'); return; }
                  if (!newPassword) { setPasswordError('请输入新密码'); return; }
                  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) { setPasswordError('密码需至少8位，包含大小写字母和数字'); return; }
                  if (newPassword !== confirmPassword) { setPasswordError('两次输入的新密码不一致'); return; }
                  setPasswordLoading(true);
                  try {
                    await api.post('/auth/member/change-password', { oldPassword, newPassword });
                    setShowPasswordModal(false);
                    alert('密码修改成功');
                  } catch (e: any) {
                    setPasswordError(e?.message || '修改失败，请检查旧密码是否正确');
                  } finally {
                    setPasswordLoading(false);
                  }
                }}
                disabled={passwordLoading}
              >{passwordLoading ? '修改中...' : '确认修改'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
