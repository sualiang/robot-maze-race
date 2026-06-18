import { useState, useEffect, useMemo, type ReactNode, Component } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Result, Modal, Form, Input, Button, Space, message } from 'antd';
import {
  TeamOutlined, GiftOutlined, DollarOutlined, SettingOutlined,
  DashboardOutlined, SafetyCertificateOutlined, UserOutlined,
  LogoutOutlined, UserSwitchOutlined, ShoppingOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'monospace' }}>
          <h3>⚠️ 页面渲染出错</h3>
          <p style={{ color: '#e74c3c', fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 600, margin: '0 auto' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 24px', cursor: 'pointer', fontSize: 14 }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 侧边栏菜单定义
const ALL_MENU_ITEMS = [
  { key: '/admin/operators', icon: <TeamOutlined />, label: '运营商管理', permission: 'operators:list' },
  { key: '/admin/players', icon: <UserSwitchOutlined />, label: '玩家管理', superAdminOnly: true },
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '运营商数据看板', permission: 'dashboard:read' },
  { key: '/admin/marketing', icon: <GiftOutlined />, label: '营销配置', permission: 'marketing:read' },
  { key: '/admin/finance', icon: <DollarOutlined />, label: '财务中心', permission: 'finance:read' },
  { key: '/admin/merchant', icon: <ShoppingOutlined />, label: '商家管理', permission: 'merchant:read' },
  { key: '/admin/rbac', icon: <SafetyCertificateOutlined />, label: '角色和成员管理', superAdminOnly: true },
  { key: '/admin/settings', icon: <SettingOutlined />, label: '系统设置', superAdminOnly: true },
  { key: '/admin/profile', icon: <UserOutlined />, label: '个人中心' },
];

/**
 * 根据用户权限过滤菜单项
 */
function getFilteredMenuItems(permissions: string[], isSuperAdmin: boolean): typeof ALL_MENU_ITEMS {
  return ALL_MENU_ITEMS.filter(item => {
    // 个人中心所有人可见
    if (!item.permission && !item.superAdminOnly) return true;
    // 超管可见所有
    if (isSuperAdmin) return true;
    // 超管专属菜单
    if (item.superAdminOnly) return false;
    // 权限匹配
    if (item.permission) {
      return permissions.includes(item.permission);
    }
    return true;
  });
}

/**
 * 检查当前用户是否有页面访问权限
 */
function hasPagePermission(pathname: string): boolean {
  try {
    const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
    const permissions: string[] = adminUser.permissions || [];
    const isSuperAdmin = permissions.includes('*');

    // 超管可访问所有页面
    if (isSuperAdmin) return true;

    // 查找菜单定义
    const menuItem = ALL_MENU_ITEMS.find(m => m.key === pathname);
    if (!menuItem) return false;

    // 超管专属页面
    if (menuItem.superAdminOnly) return false;

    // 个人中心等无权限要求的页面
    if (!menuItem.permission) return true;

    // 检查权限
    return permissions.includes(menuItem.permission);
  } catch {
    return false;
  }
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // ===== 用户权限解析 =====
  const adminUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('admin_user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const userPermissions: string[] = adminUser.permissions || [];
  const isSuperAdmin = userPermissions.includes('*');
  const menuItems = useMemo(() => getFilteredMenuItems(userPermissions, isSuperAdmin), [userPermissions, isSuperAdmin]);

  // ===== 登录弹窗逻辑 =====
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm] = Form.useForm();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const adminUser = localStorage.getItem('admin_user');
    const isLoginRoute = location.pathname === '/admin/login';

    if (isLoginRoute) {
      // 进入登录页，主动清空旧 token 强制登录
      localStorage.removeItem('token');
      localStorage.removeItem('admin_user');
      setLoginVisible(true);
    } else if (!token || !adminUser) {
      // 只在尚未登录时弹窗，避免登录成功后重复弹
      if (location.pathname !== '/admin/login') {
        setLoginVisible(true);
      }
    } else {
      // 已有 token 确保弹窗关闭
      setLoginVisible(false);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    Modal.confirm({
      title: '退出登录',
      content: '确定要退出登录吗？',
      okText: '退出',
      cancelText: '取消',
      onOk: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('admin_user');
        window.location.href = '/admin/login';
      },
    });
  };

  const handleLogin = async () => {
    try {
      const values = await loginForm.validateFields();
      setLoginLoading(true);
      const res = await fetch('/api/v1/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const data = await res.json();
      if (data.code === 0) {
        localStorage.setItem('token', data.data.token);
        localStorage.setItem('admin_user', JSON.stringify(data.data.user));
        setLoginVisible(false);

        // 首次登录则跳转到首次设置页
        if (data.data.user?.first_login) {
          navigate('/admin/first-setup', { replace: true });
        } else {
          navigate('/admin/operators', { replace: true });
        }
      } else {
        message.error(data.message || '登录失败');
      }
    } catch (e) {
      // 表单验证失败或请求异常
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <>
      <Modal
        title="总部后台登录"
        open={loginVisible}
        closable={false}
        maskClosable={false}
        footer={null}
        destroyOnClose
      >
        <Form form={loginForm} layout="vertical" onFinish={handleLogin}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loginLoading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Modal>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider>
          <div style={{ color: 'white', padding: 16, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>
            🏢 总部后台
          </div>
          <Menu
            theme="dark"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Layout>
          <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16 }}>机器狗迷宫竞速赛事 - 总部管理系统</span>
            <Space size="middle">
              <span style={{ color: '#666', fontSize: 13 }}>
                管理员：{adminUser.username || 'admin'}
              </span>
              <span style={{ color: '#888', fontSize: 12 }}>
                {adminUser.role_name || '超级管理员'}
              </span>
              <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
                退出登录
              </Button>
            </Space>
          </Header>
          <Content style={{ margin: 24 }}>
            {loginVisible ? null : hasPagePermission(location.pathname) ? (
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            ) : (
              <Result
                status="403"
                title="403"
                subTitle="抱歉，您没有访问该页面的权限。"
              />
            )}
          </Content>
        </Layout>
      </Layout>
    </>
  );
}
