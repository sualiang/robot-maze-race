import { Tabs, Typography } from 'antd';
import { TeamOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import OperatorUserManage from './OperatorUserManage';
import OperatorRoleManage from './OperatorRoleManage';

const { Title } = Typography;

const tabItems = [
  {
    key: 'users',
    label: <span><TeamOutlined /> 成员管理</span>,
    children: <OperatorUserManage />,
  },
  {
    key: 'roles',
    label: <span><SafetyCertificateOutlined /> 角色权限说明</span>,
    children: <OperatorRoleManage />,
  },
];

export default function OperatorRBAC() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>角色与成员管理</Title>
      <Tabs items={tabItems} />
    </div>
  );
}
