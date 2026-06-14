import { Outlet } from 'react-router-dom';
import { Layout, Menu, Modal, Form, Input, Button, Space, message } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeOutlined, TeamOutlined, ShopOutlined, GiftOutlined, DollarOutlined, UserOutlined, SafetyCertificateOutlined, UserSwitchOutlined } from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const allMenuItems: { key: string; icon: React.ReactNode; label: string; perms?: string[] }[] = [
  { key: '/operator/venues', icon: <HomeOutlined />, label: '赛场管理', perms: ['venues:read'] },
  { key: '/operator/referees', icon: <TeamOutlined />, label: '裁判管理', perms: ['referees:read'] },
  { key: '/operator/packages', icon: <ShopOutlined />, label: '参赛包管理', perms: ['packages:read'] },
  { key: '/operator/marketing', icon: <GiftOutlined />, label: '营销管理', perms: ['marketing:read'] },
  { key: '/operator/finance', icon: <DollarOutlined />, label: '财务中心', perms: ['finance:read'] },
  { key: '/operator/rbac', icon: <SafetyCertificateOutlined />, label: '角色与成员管理', perms: ['rbac:read'] },
  { key: '/operator/players', icon: <UserSwitchOutlined />, label: '玩家管理', perms: ['players:read'] },

  { key: '/operator/profile', icon: <UserOutlined />, label: '个人中心' },
];

export default function OperatorLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // 获取用户权限
  const raw = localStorage.getItem('operator_user_info');
  console.log('[D] raw operator_user_info:', raw);
  const userInfo = JSON.parse(raw || '{}');
  const permissions: string[] = userInfo.permissions || [];
  console.log('[D] permissions:', permissions);
  console.log('[D] includes *:', permissions.includes('*'));

  // 根据权限过滤菜单
  const menuItems = React.useMemo(() => {
    const result = allMenuItems.filter(item => {
      if (!item.perms || item.perms.length === 0) return true;
      // 超级管理员显示全部
      if (permissions.includes('*')) return true;
      return item.perms.some(perm => permissions.includes(perm));
    });
    console.log('[D] allMenuItems keys:', allMenuItems.map(i => i.key));
    console.log('[D] filtered menuItems keys:', result.map(i => i.key));
    return result;
  }, [permissions]);

  // 路由守卫：如果当前页面需要权限但用户没有，跳转到个人中心
  const currentMenuItem = allMenuItems.find(item => item.key === location.pathname);
  const hasAccess = React.useMemo(() => {
    if (!currentMenuItem || !currentMenuItem.perms || currentMenuItem.perms.length === 0) return true;
    if (permissions.includes('*')) return true;
    return currentMenuItem.perms.some(perm => permissions.includes(perm));
  }, [location.pathname, permissions]);

  useEffect(() => {
    if (!hasAccess && location.pathname !== '/operator/profile') {
      navigate('/operator/profile', { replace: true });
    }
  }, [hasAccess, location.pathname]);

  // 登录拦截：没有 token 则重定向到登录页
  // 注意：只在首次加载时检测，避免登录成功后的 navigate 被拦截
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token && location.pathname !== '/operator/login') {
      navigate('/operator/login', { replace: true });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('operator_user_info');
    navigate('/operator/login', { replace: true });
  };

  return (
    <>
      <Layout style={{ minHeight: '100vh' }}>
      <Sider>
        <div style={{ color: 'white', padding: 16, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>
          🏟️ 运营商后台
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['venue-group']}
          items={menuItems}
          onClick={({ key }) => {
            if (key !== 'venue-group') {
              navigate(key);
            }
          }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16 }}>机器狗迷宫竞速赛事</span>
          <Space size="middle">
            <span style={{ color: '#666', fontSize: 13 }}>{userInfo.phone || userInfo.nickname || ''}</span>
            <span style={{ color: '#888', fontSize: 12 }}>{userInfo.role_name || ''}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
    </>
  );
}
