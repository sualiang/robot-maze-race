import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Steps, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function AdminFirstSetupPage() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const handleSetUsername = async (values: { username: string }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/admin/first-login-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ username: values.username }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setUsername(values.username);
        message.success('用户名设置成功');
        setStep(1);
      } else {
        message.error(data.message || '设置失败');
      }
    } catch {
      message.error('请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (values: { password: string }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/admin/first-login-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ password: values.password }),
      });
      const data = await res.json();
      if (data.code === 0) {
        message.success('密码修改成功');
        // 更新 localStorage 的 admin_user
        const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
        if (username) adminUser.username = username;
        adminUser.first_login = false;
        localStorage.setItem('admin_user', JSON.stringify(adminUser));
        setDone(true);
      } else {
        message.error(data.message || '设置失败');
      }
    } catch {
      message.error('请求失败');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <Card style={{ width: 480, textAlign: 'center', borderRadius: 8 }}>
          <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4}>设置完成</Title>
          <Text>您已成功完成首次设置，现在可以开始使用了。</Text>
          <div style={{ marginTop: 24 }}>
            <Button type="primary" size="large" onClick={() => navigate('/admin/operators', { replace: true })}>
              进入总部后台
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <Card style={{ width: 480, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3}>欢迎，首次登录</Title>
          <Text type="secondary">请完成以下设置后开始使用</Text>
        </div>

        <Steps current={step} size="small" style={{ marginBottom: 32 }}>
          <Steps.Step title="设置用户名" />
          <Steps.Step title="修改密码" />
        </Steps>

        {step === 0 && (
          <Form form={form} layout="vertical" onFinish={handleSetUsername} autoComplete="off">
            <Form.Item
              name="username"
              label="设置用户名"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 2, message: '用户名至少2个字符' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="设置一个便于记忆的用户名" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                下一步
              </Button>
            </Form.Item>
          </Form>
        )}

        {step === 1 && (
          <Form layout="vertical" onFinish={handleSetPassword} autoComplete="off">
            <Form.Item
              name="password"
              label="修改密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少6位' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="输入新密码" size="large" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认密码"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="再次输入新密码" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                完成设置
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
}
