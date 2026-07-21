import { useState, useEffect } from 'react';
import { Card, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import api from '../../../utils/api';

interface PermissionItem {
  name: string;
  permissions: string[];
}

const PERMISSION_LABELS: Record<string, string> = {
  '*': '全部权限',
  'operators:list': '运营商管理',
  'operators:read': '运营商管理',
  'operators:create': '运营商管理',
  'operators:edit': '运营商管理',
  'operators:delete': '运营商管理',
  'players:list': '玩家列表',
  'dashboard:read': '运营商数据看板',
  'dashboard:list': '运营商数据看板',
  'marketing:read': '营销配置',
  'marketing:edit': '营销配置',
  'finance:read': '财务中心',
  'finance:withdraw': '财务中心',
  'finance:history': '财务中心',
  'system:read': '系统设置',
};

function getPermissionTags(permissions: string[]): { label: string; color: string }[] {
  if (permissions.includes('*')) {
    return [{ label: '全部权限', color: 'red' }];
  }

  const seen = new Set<string>();
  const tags: { label: string; color: string }[] = [];
  const colorMap: Record<string, string> = {
    '运营商管理': 'blue',
    '运营商数据看板': 'cyan',
    '营销配置': 'purple',
    '财务中心': 'gold',
    '系统设置': 'geekblue',
    '个人中心': 'green',
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

export default function AdminRoleManage() {
  const [roles, setRoles] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/rbac/roles')
      .then((data: any) => {
        // 过滤掉超级管理员角色（不在角色管理页面显示）
        const list = (data?.list ?? data ?? []).filter((r: any) => r.id !== 'role-super-admin');
        setRoles(list);
      })
      .catch(() => {
        message.error('获取角色列表失败');
        setRoles([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnsType<PermissionItem> = [
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
      <Table
        columns={columns}
        dataSource={roles}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
    </Card>
  );
}
