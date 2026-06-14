import { useState, useEffect } from 'react';
import { Card, Table, Tag, message, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import api from '../../../utils/api';

const { Paragraph } = Typography;

interface RoleItem {
  key: string;
  name: string;
  permissions: string[];
}

const PERMISSION_LABELS: Record<string, string> = {
  '*': '全部权限',
  'venues:read': '赛场管理',
  'venues:create': '赛场创建',
  'venues:edit': '赛场编辑',
  'referees:read': '裁判管理',
  'referees:create': '裁判创建',
  'referees:edit': '裁判编辑',
  'packages:read': '参赛包管理',
  'packages:create': '参赛包创建',
  'packages:edit': '参赛包编辑',
  'marketing:read': '营销管理',
  'marketing:create': '营销创建',
  'marketing:edit': '营销配置',
  'finance:read': '财务中心',
  'finance:withdraw': '财务提现',
  'finance:history': '财务流水',
  'dashboard:read': '数据概览',
  'players:read': '玩家管理',
  'rbac:read': '角色与成员管理',
  'rbac:create': '成员创建',
  'rbac:edit': '成员编辑',
  'rbac:delete': '成员删除',
};

function getPermissionTags(permissions: string[]): { label: string; color: string }[] {
  if (permissions.includes('*')) {
    return [{ label: '全部权限', color: 'red' }];
  }

  const seen = new Set<string>();
  const tags: { label: string; color: string }[] = [];
  const colorMap: Record<string, string> = {
    '全部权限': 'red',
    '赛场管理': 'blue',
    '赛场创建': 'cyan',
    '赛场编辑': 'geekblue',
    '裁判管理': 'orange',
    '裁判创建': 'volcano',
    '裁判编辑': 'gold',
    '参赛包管理': 'green',
    '参赛包创建': 'lime',
    '参赛包编辑': 'green',
    '营销管理': 'purple',
    '营销创建': 'volcano',
    '营销配置': 'magenta',
    '财务中心': 'gold',
    '财务提现': 'orange',
    '财务流水': 'geekblue',
    '数据概览': 'blue',
    '玩家管理': 'cyan',
    '角色与成员管理': 'purple',
    '成员创建': 'volcano',
    '成员编辑': 'orange',
    '成员删除': 'red',
  };

  for (const perm of permissions) {
    const label = PERMISSION_LABELS[perm] || perm;
    if (!seen.has(label)) {
      seen.add(label);
      tags.push({ label, color: colorMap[label] || 'default' });
    }
  }
  return tags;
}

export default function OperatorRoleManage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/operator/rbac/roles')
      .then((data: any) => {
        setRoles(data ?? []);
      })
      .catch(() => {
        message.error('获取角色列表失败');
        setRoles([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnsType<RoleItem> = [
    { title: '角色名称', dataIndex: 'label', key: 'label', width: 120 },
    {
      title: '权限列表', dataIndex: 'permissions', key: 'permissions',
      render: (permissions: string[]) => (
        <>
          {getPermissionTags(permissions).map((tag) => (
            <Tag key={tag.label} color={tag.color}>{tag.label}</Tag>
          ))}
        </>
      ),
    },
  ];

  return (
    <Card title="角色权限说明">
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        以下为运营商后台预定义的三种角色，角色不可编辑或删除。
      </Paragraph>
      <Table
        columns={columns}
        dataSource={roles}
        rowKey="key"
        loading={loading}
        pagination={false}
      />
    </Card>
  );
}
