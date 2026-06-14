import { useState } from 'react';
import { Form, Input, Button, message, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import api from '../../../utils/api';

export default function OperatorLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdModalLoading, setPwdModalLoading] = useState(false);
  const [tempToken, setTempToken] = useState<string>('');

  const handleLogin = async (values: { phone: string; password: string }) => {
    setLoading(true);
    try {
      // 先尝试运营商原帐号登录
      const res: any = await api.post('/auth/login', {
        username: values.phone,
        password: values.password,
        role: 'operator',
      });
      localStorage.setItem('token', res.token);
      if (res.user) {
        localStorage.setItem('operator_user_info', JSON.stringify(res.user));
      }

      // 检查是否需要首次修改密码
      if (res.user?.passwordChangeRequired) {
        setTempToken(res.token);
        setPwdModalOpen(true);
        setLoading(false);
        return;
      }

      message.success('登录成功');
      navigate('/operator/venues', { replace: true });
    } catch (err: any) {
      // 如果运营商原帐号登录失败（401），兜底尝试运营商角色成员登录
      try {
        const res2: any = await api.post('/auth/operator-member-login', {
          phone: values.phone,
          password: values.password,
        });
        localStorage.setItem('token', res2.token);
        if (res2.user) {
          localStorage.setItem('operator_user_info', JSON.stringify(res2.user));
        }

        // 检查是否需要首次修改密码
        if (res2.user?.firstLogin || res2.user?.passwordChangeRequired) {
          setTempToken(res2.token);
          setPwdModalOpen(true);
          setLoading(false);
          return;
        }

        message.success('登录成功');
        navigate('/operator/venues', { replace: true });
      } catch {
        const msg = err?.message || '登录失败，请检查手机号和密码';
        message.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await pwdForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入的密码不一致');
        return;
      }
      setPwdModalLoading(true);

      // 用临时 token 调 member change-password 接口（不经过 OperatorLayout 拦截）
      localStorage.setItem('token', tempToken);
      const res: any = await api.post('/auth/member/change-password', {
        oldPassword: pwdForm.getFieldValue('oldPassword'),
        newPassword: values.newPassword,
      });

      // 成功后更新 token 和用户信息
      if (res.token) {
        localStorage.setItem('token', res.token);
      }
      if (res.user) {
        localStorage.setItem('operator_user_info', JSON.stringify(res.user));
      }
      message.success('密码修改成功');
      setPwdModalOpen(false);
      navigate('/operator/venues', { replace: true });
    } catch (err: any) {
      message.error(err?.message || '修改密码失败');
    } finally {
      setPwdModalLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      <div style={styles.box}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={{ width: 160, height: 160, borderRadius: 12, background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60 }}>🐕</div>
        </div>

        {/* 角色标识 */}
        <div style={styles.role}>
          <span style={styles.roleIcon}>🏟️</span>
          运营商管理后台
        </div>

        {/* 登录卡片 */}
        <div style={styles.card}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleLogin}
            autoComplete="off"
          >
            <Form.Item
              label={<span style={styles.label}>手机号</span>}
              name="phone"
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1\d{10}$/, message: '请输入正确的11位手机号' },
              ]}
            >
              <Input
                prefix={<UserOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                placeholder="请输入手机号"
                maxLength={11}
                style={styles.input}
              />
            </Form.Item>

            <Form.Item
              label={<span style={styles.label}>密码</span>}
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                placeholder="请输入密码"
                style={styles.input}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={styles.button}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>

          <div style={styles.hint}>
            仅限已授权的运营商管理员使用
          </div>
        </div>
      </div>

      {/* 首次登录修改密码弹窗 */}
      <Modal
        title="首次登录，请修改密码"
        open={pwdModalOpen}
        onCancel={() => {
          setPwdModalOpen(false);
          message.warning('请修改密码后再使用系统');
          localStorage.removeItem('token');
          localStorage.removeItem('operator_user_info');
        }}
        footer={null}
        maskClosable={false}
        closable={false}
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item
            label="当前密码"
            name="oldPassword"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="请输入当前初始密码" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少8位' },
              { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, message: '密码需同时包含大小写英文字母和数字' },
            ]}
            extra="密码需同时包含大小写英文和数字，至少8位"
          >
            <Input.Password placeholder="如：Abc12345" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Button type="primary" block onClick={handleChangePassword} loading={pwdModalLoading}>
            确认修改
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0e1a',
    backgroundImage:
      'radial-gradient(ellipse at 30% 20%, rgba(255, 193, 7, 0.05) 0%, transparent 60%),' +
      'radial-gradient(ellipse at 70% 80%, rgba(245, 158, 11, 0.05) 0%, transparent 60%)',
    position: 'fixed',
    top: 0,
    left: 0,
    overflow: 'hidden',
    padding: 16,
  },
  glow1: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255, 193, 7, 0.06), transparent 70%)',
    top: -100,
    left: -100,
    pointerEvents: 'none',
  },
  glow2: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(245, 158, 11, 0.05), transparent 70%)',
    bottom: -150,
    right: -150,
    pointerEvents: 'none',
  },
  box: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 440,
    zIndex: 1,
  },
  logo: {
    marginBottom: 16,
  },
  role: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 16px',
    background: 'rgba(255, 193, 7, 0.06)',
    border: '1px solid rgba(255, 193, 7, 0.12)',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 500,
    color: '#f59e0b',
    marginBottom: 32,
  },
  roleIcon: {
    fontSize: 16,
  },
  card: {
    width: '100%',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    padding: '28px 24px',
    backdropFilter: 'blur(16px)',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: '0.5px',
  },
  input: {
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    fontSize: 15,
    color: '#e8e8f0',
  },
  button: {
    padding: 14,
    fontSize: 17,
    fontWeight: 700,
    borderRadius: 14,
    letterSpacing: 4,
    height: 'auto',
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    border: 'none',
    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.25)',
    marginTop: 24,
    lineHeight: '1.6',
  },
};
