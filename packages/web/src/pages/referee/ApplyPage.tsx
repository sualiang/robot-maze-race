import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

type ApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  none: '',
  pending: '审核中',
  approved: '已通过',
  rejected: '未通过',
};

export default function ApplyPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [appStatus, setAppStatus] = useState<ApplicationStatus>('none');
  const [statusMsg, setStatusMsg] = useState('');

  // 检查是否已登录
  const token = localStorage.getItem('token');
  const isLoggedIn = !!token;

  // 页面加载时检查申请状态
  useEffect(() => {
    if (!isLoggedIn) return;
    checkApplicationStatus();
  }, [isLoggedIn]);

  /** 查询已有申请状态 */
  const checkApplicationStatus = async () => {
    try {
      const res: any = await api.get('/referees/application-status');
      // 返回结构：{ has_application, application: { status, review_remark, ... } }
      if (res && res.has_application && res.application) {
        setAppStatus(res.application.status as ApplicationStatus);
        if (res.application.status === 'pending') {
          setStatusMsg('您的申请正在审核中，请耐心等待');
        } else if (res.application.status === 'approved') {
          setStatusMsg('您的申请已通过审核，可前往比赛页面');
        } else if (res.application.status === 'rejected') {
          setStatusMsg(res.application.review_remark || '您的申请未通过审核，请重新提交');
        }
      }
    } catch {
      // 没有申请记录或接口报错，允许提交
      setAppStatus('none');
    } finally {
      setChecking(false);
    }
  };

  /** 提交注册申请 */
  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('请输入姓名');
      return;
    }
    if (!phone.trim() || phone.length !== 11) {
      setError('请输入正确的11位手机号');
      return;
    }

    setLoading(true);
    try {
      await api.post('/referees/apply', {
        name: name.trim(),
        phone: phone.trim(),
      });
      setSuccess('申请已提交，请等待审核');
      setAppStatus('pending');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '提交失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 未登录状态
  if (!isLoggedIn) {
    return (
      <div className="referee-page">
        <div className="referee-empty">
          <span className="referee-empty-icon">🔒</span>
          <span className="referee-empty-text">请先登录后再申请</span>
          <button
            className="referee-btn referee-btn-primary"
            style={{ marginTop: 20, width: 'auto', padding: '12px 32px' }}
            onClick={() => navigate('/referee/login', { replace: true })}
          >
            去登录
          </button>
        </div>
      </div>
    );
  }

  // 加载中
  if (checking) {
    return (
      <div className="referee-page">
        <div className="referee-loading-mask" style={{ position: 'relative' }}>
          <span className="referee-loading-spinner">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="referee-page">
      {/* 页面标题 */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ref-text)', marginBottom: 6 }}>
          裁判注册申请
        </div>
        <div style={{ fontSize: 13, color: 'var(--ref-text-dim)' }}>
          提交信息申请成为赛事裁判
        </div>
      </div>

      {/* 状态展示：已提交申请 */}
      {appStatus === 'pending' && (
        <div className="referee-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ref-warning)', marginBottom: 8 }}>
            审核中
          </div>
          <div style={{ fontSize: 13, color: 'var(--ref-text-dim)', lineHeight: 1.6 }}>
            {statusMsg}
          </div>
        </div>
      )}

      {/* 状态展示：已通过 */}
      {appStatus === 'approved' && (
        <div className="referee-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ref-success)', marginBottom: 8 }}>
            已通过
          </div>
          <div style={{ fontSize: 13, color: 'var(--ref-text-dim)', lineHeight: 1.6, marginBottom: 16 }}>
            {statusMsg}
          </div>
          <button
            className="referee-btn referee-btn-success"
            style={{ width: 'auto', padding: '12px 40px', margin: '0 auto' }}
            onClick={() => navigate('/referee/match', { replace: true })}
          >
            前往比赛页面
          </button>
        </div>
      )}

      {/* 状态展示：未通过 */}
      {appStatus === 'rejected' && (
        <div className="referee-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ref-danger)', marginBottom: 8 }}>
            未通过
          </div>
          <div style={{ fontSize: 13, color: 'var(--ref-text-dim)', lineHeight: 1.6, marginBottom: 16 }}>
            {statusMsg}
          </div>
          <button
            className="referee-btn referee-btn-primary"
            style={{ width: 'auto', padding: '12px 40px', margin: '0 auto' }}
            onClick={() => {
              setAppStatus('none');
              setError('');
              setSuccess('');
            }}
          >
            重新申请
          </button>
        </div>
      )}

      {/* 申请表单（无申请或拒绝后重新填写） */}
      {appStatus === 'none' && (
        <div className="referee-card">
          <div className="referee-login-field">
            <label className="referee-login-label">姓名</label>
            <input
              className="referee-login-input"
              type="text"
              placeholder="请输入您的真实姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
            />
          </div>

          <div className="referee-login-field">
            <label className="referee-login-label">手机号</label>
            <input
              className="referee-login-input"
              type="tel"
              maxLength={11}
              placeholder="请输入11位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {error && <div className="referee-login-error">{error}</div>}
          {success && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--ref-success)',
                fontSize: 14,
                marginBottom: 12,
                padding: '8px',
                background: 'rgba(16, 185, 129, 0.06)',
                borderRadius: 8,
              }}
            >
              {success}
            </div>
          )}

          <button
            className="referee-login-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <span className="referee-login-loading">
                提交中<span className="referee-login-dot-anim">...</span>
              </span>
            ) : (
              '提交申请'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
