import React, { useState } from 'react';
import { Card, Typography, Input, Button, message, Row, Col, Tabs, Modal, Descriptions, Space } from 'antd';
import { KeyOutlined, LogoutOutlined, UserOutlined, InfoCircleOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../../utils/api';

const { Text } = Typography;

/* ── Tab1: 修改登录密码 ── */
function ChangePasswordTab() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!oldPassword) {
      message.warning('请输入当前密码');
      return;
    }
    if (!newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      message.warning('新密码需至少8位，包含大小写字母和数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await api.post('/operator/change-password', {
        oldPassword,
        newPassword,
      });
      message.success('密码修改成功');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // 清除首次登录标记
      try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (userInfo.passwordChangeRequired) {
          delete userInfo.passwordChangeRequired;
          localStorage.setItem('userInfo', JSON.stringify(userInfo));
        }
      } catch { /* ignore */ }
    } catch (e: any) {
      message.error(e?.message || '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ maxWidth: 500, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Text strong type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
          当前密码
        </Text>
        <Input.Password
          placeholder="请输入当前密码"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          size="large"
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Text strong type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
          新密码
        </Text>
        <Input.Password
          placeholder="至少8位，含大小写字母和数字"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          size="large"
        />
      </div>
      <div style={{ marginBottom: 24 }}>
        <Text strong type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
          确认新密码
        </Text>
        <Input.Password
          placeholder="请再次输入新密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          size="large"
        />
      </div>
      <Button type="primary" block size="large" onClick={handleChangePassword} loading={loading}>
        确认修改
      </Button>
    </Card>
  );
}

/* ── Tab2: 登出 ── */
function LogoutTab() {
  const navigate = useNavigate();

  const handleLogout = () => {
    Modal.confirm({
      title: '退出登录',
      content: '确认退出当前账号？',
      onOk: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('venueId');
        localStorage.removeItem('venueName');
        message.success('已退出');
        navigate('/operator/venues');
        window.location.reload();
      },
    });
  };

  return (
    <Card style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ padding: '40px 0' }}>
        <LogoutOutlined style={{ fontSize: 64, color: '#ff4d4f', marginBottom: 16 }} />
        <p style={{ fontSize: 16, marginBottom: 24, color: '#666' }}>
          点击下方按钮退出当前账号
        </p>
        <Button type="primary" danger size="large" onClick={handleLogout}>
          安全退出
        </Button>
      </div>
    </Card>
  );
}

/* ── Tab0: 个人信息 ── */
function ProfileInfoTab() {
  const raw = localStorage.getItem('operator_user_info');
  let info: Record<string, any> = {};
  try { info = JSON.parse(raw || '{}'); } catch {}

  const operatorName = info.operator_name || info.nickname || info.username || '-';
  const companyName = info.company_name || '-';
  const phone = info.phone || '-';
  const roleName = info.role_name || info.admin_role_name || '-';

  return (
    <Card title={<span><InfoCircleOutlined /> 个人信息</span>} style={{ maxWidth: 600, margin: '0 auto' }}>
      <Descriptions column={1} size="middle">
        <Descriptions.Item label="运营商名称">
          <Space>
            <UserOutlined />
            {operatorName}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="运营商公司">
          <Space>
            <ShopOutlined />
            {companyName}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="登录账号">{phone}</Descriptions.Item>
        <Descriptions.Item label="当前角色">{roleName}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

/* ── 主组件 ── */
export default function OperatorProfile() {
  const tabItems = [
    {
      key: 'info',
      label: <span><InfoCircleOutlined /> 个人信息</span>,
      children: <ProfileInfoTab />,
    },
    {
      key: 'password',
      label: <span><KeyOutlined /> 修改登录密码</span>,
      children: <ChangePasswordTab />,
    },
    {
      key: 'logout',
      label: <span><LogoutOutlined /> 登出</span>,
      children: <LogoutTab />,
    },
  ];

  return (
    <div>
      <h3 style={{ marginBottom: 24 }}>个人中心</h3>
      <Tabs items={tabItems} />
    </div>
  );
}
