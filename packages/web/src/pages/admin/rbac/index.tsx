import { Tabs, Typography } from 'antd';
import { TeamOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import AdminUserManage from './AdminUserManage';
import AdminRoleManage from './AdminRoleManage';

const { Title } = Typography;

const tabItems = [
  {
    key: 'users',
    label: <span><TeamOutlined /> 成员管理</span>,
    children: <AdminUserManage />,
  },
  {
    key: 'roles',
    label: <span><SafetyCertificateOutlined /> 角色权限说明</span>,
    children: <AdminRoleManage />,
  },
];

export default function AdminRBAC() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>角色和成员管理</Title>
      <Tabs items={tabItems} />
    </div>
  );
}
