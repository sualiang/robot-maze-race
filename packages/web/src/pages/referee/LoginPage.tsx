import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Modal, message } from 'antd';
import api from '../../utils/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [pwdForm] = Form.useForm();

  // 不再自动跳转，用户必须手动登录

  const handleLogin = async () => {
    setError('');
    if (!phone || phone.length !== 11) {
      setError('请输入正确的11位手机号');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    setLoading(true);
    try {
      const res: any = await api.post('/auth/login', { phone, password });
      // 首次登录需改密
      if (res.user?.firstLogin) {
        setTempToken(res.token);
        setShowPwdModal(true);
        return;
      }
      localStorage.setItem('token', res.token);
      localStorage.setItem('referee_user_info', JSON.stringify(res.user));
      navigate('/referee/match', { replace: true });
    } catch (err: any) {
      const msg = err?.message || '登录失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    try {
      const resp = await fetch('/api/v1/auth/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempToken}` },
        body: JSON.stringify({
          oldPassword: values.currentPassword,
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword
        })
      });
      const data = await resp.json();
      if (data.code === 0) {
        message.success('密码修改成功，请重新登录');
        setShowPwdModal(false);
        pwdForm.resetFields();
        // 清除旧 token 和 user info
        localStorage.removeItem('token');
        localStorage.removeItem('referee_user_info');
        // 全页面跳回登录页（避免 React Router 路由状态混乱）
        window.location.href = '/referee/login';
      } else {
        message.error(data.message || '密码修改失败');
      }
    } catch {
      message.error('网络错误');
    }
  };

  return (
    <div className="referee-login-page">
      {/* 背景装饰 */}
      <div className="referee-login-glow-1" />
      <div className="referee-login-glow-2" />

      <div className="referee-login-box">
        {/* Logo */}
        <div className="referee-login-logo">
          <div style={{ width: 160, height: 160, borderRadius: 12, background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60 }}>🐕</div>
        </div>

        {/* 品牌标题 — 已集成在 logo 中，文案删掉 */}

        {/* 裁判端标识 */}
        <div className="referee-login-role">
          <span className="referee-login-role-icon">⚡</span>
          裁判工作台
        </div>

        {/* 登录卡片 */}
        <div className="referee-login-card">
          <div className="referee-login-field">
            <label className="referee-login-label">手机号</label>
            <input
              className="referee-login-input"
              type="tel"
              maxLength={11}
              placeholder="请输入11位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <div className="referee-login-field">
            <label className="referee-login-label">密码</label>
            <input
              className="referee-login-input"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          {error && <div className="referee-login-error">{error}</div>}

          <button
            className="referee-login-btn"
            onClick={handleLogin}
            disabled={loading || phone.length !== 11 || !password}
          >
            {loading ? (
              <span className="referee-login-loading">登录中<span className="referee-login-dot-anim">...</span></span>
            ) : (
              '登录'
            )}
          </button>

          <div className="referee-login-hint">
            仅限已授权的赛事裁判使用
          </div>
        </div>
      </div>
      {/* 首次登录改密弹窗 */}
      <Modal
        title="首次登录，请修改密码"
        open={showPwdModal}
        closable={false}
        maskClosable={false}
        footer={null}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item label="当前密码" name="currentPassword" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password placeholder="请输入当前初始密码" />
          </Form.Item>
          <Form.Item label="新密码" name="newPassword" rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '密码至少8位' },
            { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, message: '密码需同时包含大小写英文字母和数字' },
          ]} extra="密码需同时包含大小写英文和数字，至少8位">
            <Input.Password placeholder="如：Abc12345" />
          </Form.Item>
          <Form.Item label="确认新密码" name="confirmPassword" dependencies={['newPassword']} rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的密码不一致'));
              }
            })
          ]}>
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>确认修改</Button>
        </Form>
      </Modal>
    </div>
  );
}
