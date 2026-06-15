import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
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
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

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

  // 修改密码
  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) { setPwdMsg('请填写旧密码和新密码'); return; }
    setPwdLoading(true);
    setPwdMsg('');
    try {
      const res = await fetch(`${BASE}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setPwdMsg('✅ 密码修改成功');
        setOldPwd('');
        setNewPwd('');
      } else {
        setPwdMsg(`❌ ${data.message || '修改失败'}`);
      }
    } catch (e) {
      setPwdMsg('❌ 网络错误');
    }
    setPwdLoading(false);
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
            {records.slice(0, 10).map((r) => (
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
          className="referee-btn referee-btn-outline"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => setShowPwdModal(true)}
        >🔑 修改登录密码</button>
        <button
          className="referee-btn referee-btn-outline"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => alert('NFC 硬件绑定功能开发中...')}
        >📡 绑定 NFC 硬件</button>
        <button
          className="referee-btn"
          style={{ width: '100%', marginTop: 8, background: '#e74c3c', color: '#fff' }}
          onClick={handleLogout}
        >🚪 退出登录</button>
      </div>

      {/* 历史签到/签退记录查询弹窗 */}
      {showHistoryModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }} onClick={() => setShowHistoryModal(false)}>
          <div className="referee-card" style={{ width: '85%', maxWidth: 380, padding: 24, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ref-text)', marginBottom: 16 }}>查询签到/签退记录</div>
            {/* 日期输入 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14, outline: 'none',
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
                <div style={{ fontSize: 14, color: 'var(--ref-text-dim)', textAlign: 'center', padding: 20 }}>该日暂无签到记录</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {historyRecords.map((r) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                      fontSize: 13, color: 'var(--ref-text-dim)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{ color: 'var(--ref-text)', fontWeight: 500 }}>{formatDateOnly(r.checkin_at)}</div>
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
              className="referee-btn"
              style={{ width: '100%', marginTop: 12, background: 'rgba(255,255,255,0.1)', color: 'var(--ref-text)' }}
              onClick={() => setShowHistoryModal(false)}
            >关闭</button>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showPwdModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }} onClick={() => setShowPwdModal(false)}>
          <div className="referee-card" style={{ width: '85%', maxWidth: 340, padding: 24 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ref-text)', marginBottom: 20 }}>修改密码</div>
            <input
              className="referee-input"
              type="password" placeholder="旧密码" value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              style={{ width: '100%', marginBottom: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 15, outline: 'none' }}
            />
            <input
              className="referee-input"
              type="password" placeholder="新密码" value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              style={{ width: '100%', marginBottom: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 15, outline: 'none' }}
            />
            {pwdMsg && <div style={{ fontSize: 13, marginBottom: 12, color: pwdMsg.includes('✅') ? '#27ae60' : '#e74c3c' }}>{pwdMsg}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="referee-btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: 'var(--ref-text)' }} onClick={() => setShowPwdModal(false)}>取消</button>
              <button className="referee-btn referee-btn-primary" style={{ flex: 1 }} onClick={handleChangePwd} disabled={pwdLoading}>{pwdLoading ? '修改中...' : '确认修改'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
