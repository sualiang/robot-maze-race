import { Outlet } from 'react-router-dom';
import { Layout, Menu, Modal, Form, Input, Button, Space, message } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeOutlined, TeamOutlined, ShopOutlined, GiftOutlined, DollarOutlined, UserOutlined, SafetyCertificateOutlined, UserSwitchOutlined, ShoppingOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Header, Sider, Content } = Layout;

const allMenuItems: { key: string; icon: React.ReactNode; label: string; perms?: string[] }[] = [
  { key: '/operator/venues', icon: <HomeOutlined />, label: '赛场管理', perms: ['venues:read'] },
  { key: '/operator/referees', icon: <TeamOutlined />, label: '裁判管理', perms: ['referees:read'] },
  { key: '/operator/packages', icon: <ShopOutlined />, label: '参赛包管理', perms: ['packages:read'] },
  { key: '/operator/marketing', icon: <GiftOutlined />, label: '营销管理', perms: ['marketing:read'] },
  { key: '/operator/finance', icon: <DollarOutlined />, label: '财务中心', perms: ['finance:read'] },
  { key: '/operator/rbac', icon: <SafetyCertificateOutlined />, label: '角色与成员管理', perms: ['rbac:read'] },
  { key: '/operator/merchant', icon: <ShoppingOutlined />, label: '商家管理', perms: ['merchant:read'] },
  { key: '/operator/players', icon: <UserSwitchOutlined />, label: '玩家管理', perms: ['players:read'] },

  { key: '/operator/profile', icon: <UserOutlined />, label: '个人中心' },
];

export default function OperatorLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // 获取用户权限（优先从 localStorage，同时保底从后端获取）
  const [permissions, setPermissions] = useState<string[]>(() => {
    const raw = localStorage.getItem('operator_user_info');
    console.log('[D] raw operator_user_info:', raw);
    if (raw) {
      try {
        const info = JSON.parse(raw);
        return info.permissions || [];
      } catch {}
    }
    return [];
  });
  const [userInfoLoaded, setUserInfoLoaded] = useState(() => !!localStorage.getItem('operator_user_info'));
  const rawUserInfo = localStorage.getItem('operator_user_info');
  const userInfo: any = (() => {
    try { return JSON.parse(rawUserInfo || '{}'); } catch { return {}; }
  })();

  // 如果 localStorage 没有用户信息但 token 存在，从后端拉取
  const token = localStorage.getItem('token');
  useEffect(() => {
    if (userInfoLoaded || !token) return;
    (async () => {
      try {
        const res: any = await api.get('/auth/me');
        if (res?.data) {
          localStorage.setItem('operator_user_info', JSON.stringify(res.data));
          setPermissions(res.data.permissions || []);
          setUserInfoLoaded(true);
        }
      } catch (e) {
        console.error('[OperatorLayout] 获取用户信息失败:', e);
      }
    })();
  }, [token, userInfoLoaded]);

  console.log('[D] permissions:', permissions);
  console.log('[D] includes *:', permissions.includes('*'));

  // 根据权限过滤菜单
  const menuItems = React.useMemo(() => {
    const result = allMenuItems.filter(item => {
      if (!item.perms || item.perms.length === 0) return true;
      if (permissions.includes('*')) return true;
      return item.perms.some(perm => permissions.includes(perm));
    });
    console.log('[D] allMenuItems keys:', allMenuItems.map(i => i.key));
    console.log('[D] filtered menuItems keys:', result.map(i => i.key));
    return result;
  }, [permissions]);

  // 路由守卫
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
        <div style={{ color: 'white', padding: '16px 16px 8px', textAlign: 'center' }}>
          {userInfo.operator_name ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '22px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userInfo.operator_name}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>运营商后台</div>
            </>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 700 }}>🏟️ 运营商后台</div>
          )}
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
            <span style={{ color: '#888', fontSize: 12 }}>{userInfo.role_name || userInfo.admin_role_name || ''}</span>
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
