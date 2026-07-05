import { useState } from 'react';
import { Card, Form, Input, Button, message, Descriptions, Space, Divider } from 'antd';
import { LockOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export default function AdminProfile() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 从 localStorage 读取当前用户信息
  const adminUserRaw = localStorage.getItem('admin_user');
  const adminUser = adminUserRaw ? JSON.parse(adminUserRaw) : {};
  const { nickname, username, phone } = adminUser;

  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入的新密码不一致');
        return;
      }
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/auth/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.code === 0) {
        message.success('密码修改成功');
        form.resetFields();
      } else {
        message.error(data.message || '修改失败');
      }
    } catch {
      // 表单校验失败
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin_user');
    message.success('已退出登录');
    window.location.reload();
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card title="个人信息" style={{ marginBottom: 24 }}>
        <Descriptions column={1} size="middle">
          <Descriptions.Item label="用户名">
            <Space>
              <UserOutlined />
              {username || nickname || '-'}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="昵称">{nickname || '-'}</Descriptions.Item>
          {/* 邮箱字段已移除 */}
          <Descriptions.Item label="手机号">{phone || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="修改密码">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleChangePassword}
          style={{ maxWidth: 400 }}
        >
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入当前密码"
            />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码长度不能少于6位' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
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
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入新密码"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Divider />

      <div style={{ textAlign: 'center' }}>
        <Button
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          size="large"
        >
          退出登录
        </Button>
      </div>
    </div>
  );
}
