import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, message, Typography, Modal } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [loginUserData, setLoginUserData] = useState<any>(null);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdModalLoading, setPwdModalLoading] = useState(false);
  const [pwdForm] = Form.useForm();
  const navigate = useNavigate();

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.code === 0) {
        if (data.data.first_login) {
          // 首次登录：存 token 到 tempToken，弹出改密弹窗
          setTempToken(data.data.token);
          setLoginUserData(data.data.user);
          setPwdModalOpen(true);
        } else {
          localStorage.setItem('token', data.data.token);
          localStorage.setItem('admin_user', JSON.stringify(data.data.user));
          message.success('登录成功');
          navigate('/admin/operators', { replace: true });
        }
      } else {
        message.error(data.message || '登录失败');
      }
    } catch {
      message.error('请求失败，请检查网络');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values: {
    currentPassword: string;
    newPassword: string;
  }) => {
    setPwdModalLoading(true);
    try {
      const res = await fetch('/api/v1/auth/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
        },
        body: JSON.stringify({
          oldPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        // 使用改密接口返回的新 token（如有），否则使用 tempToken
        const finalToken = data.data?.token || tempToken;
        localStorage.setItem('token', finalToken);

        // 使用登录时已有的用户信息，标记 first_login 为 false 防止跳转 first-setup
        const adminUser = { ...loginUserData, first_login: false };
        localStorage.setItem('admin_user', JSON.stringify(adminUser));

        setPwdModalOpen(false);
        message.success('密码修改成功');
        navigate('/admin/operators', { replace: true });
      } else {
        message.error(data.message || '密码修改失败');
      }
    } catch {
      message.error('请求失败，请检查网络');
    } finally {
      setPwdModalLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <div style={{ textAlign: 'center', width: '100%', position: 'absolute', top: '8%', left: 0 }}>
        <img
          src="/logo-operator.png"
          alt="铁甲快狗"
          style={{ width: 400, height: 'auto' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <Card style={{ width: 420, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Text type="secondary">机器狗迷宫竞速赛事 · 总部管理系统</Text>
        </div>
        <Form onFinish={handleLogin} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入手机号或用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="手机号/用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title="首次登录，请修改密码"
        open={pwdModalOpen}
        onCancel={() => {
          setPwdModalOpen(false);
          message.warning('请修改密码后再使用系统');
          localStorage.removeItem('token');
          localStorage.removeItem('admin_user');
        }}
        footer={null}
        closable={false}
        maskClosable={false}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            label="当前密码"
            name="currentPassword"
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
          <Button type="primary" htmlType="submit" block loading={pwdModalLoading}>
            确认修改
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
