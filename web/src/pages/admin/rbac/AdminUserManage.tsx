import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Switch,
  Tag, message, Popconfirm, Input as SearchInput,
} from 'antd';
import AccountInfoModal from '../../../components/AccountInfoModal';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  KeyOutlined, SearchOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

interface AdminUserItem {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  role_key: string;
  role_name: string;
  status: 'active' | 'disabled';
  created_at: string;
}

interface RoleOption {
  id: string;
  name: string;
  label: string;
}

export default function AdminUserManage() {
  const [list, setList] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [roles, setRoles] = useState<RoleOption[]>([]);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

    const [accountInfo, setAccountInfo] = useState<{ account: string; password: string } | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      const data: any = await api.get('/admin/rbac/roles');
      const roleList = data?.list ?? data ?? [];
      setRoles(roleList.map((r: any) => ({ id: r.id, name: r.name, label: r.label })));
    } catch {
      setRoles([]);
    }
  }, []);

  const fetchList = useCallback(async (p: number, ps: number, s: string) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, page_size: ps };
      if (s) params.search = s;
      const data: any = await api.get('/admin/rbac/users', { params });
      const resultList = data?.list ?? data?.data ?? data ?? [];
      setList(Array.isArray(resultList) ? resultList : []);
      setTotal(data?.total ?? data?.count ?? resultList.length ?? 0);
    } catch {
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    fetchList(page, pageSize, search);
  }, [fetchList, page, pageSize, search]);

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreateLoading(true);
    try {
      const res: any = await api.post('/admin/rbac/users', { phone: values.phone, role_id: values.role_key });
      setAccountInfo({ account: res.account, password: res.password });
      setCreateOpen(false);
      createForm.resetFields();
      fetchList(page, pageSize, search);
    } catch {
      message.error('创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (record: AdminUserItem) => {
    try {
      await api.delete(`/admin/rbac/users/${record.id}`);
      message.success('删除成功');
      fetchList(page, pageSize, search);
    } catch {
      message.error('删除失败');
    }
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const columns: ColumnsType<AdminUserItem> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '手机', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      title: '角色', dataIndex: 'role_name', key: 'role_name', width: 120,
      render: (roleName: string) => <Tag color="blue">{roleName || '-'}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string, record: AdminUserItem) => (
        <Switch
          checked={s === 'active'}
          checkedChildren="正常"
          unCheckedChildren="禁用"
          size="small"
          onChange={async (checked) => {
            try {
              await api.put(`/admin/rbac/users/${record.id}`, {
                status: checked ? 'active' : 'disabled',
              });
              message.success(checked ? '已启用' : '已禁用');
              fetchList(page, pageSize, search);
            } catch {
              message.error('操作失败');
            }
          }}
        />
      ),
    },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right',
      render: (_: unknown, record: AdminUserItem) => (
        <Space size="small" wrap>
          <Button
            type="link" size="small" icon={<KeyOutlined />}
            onClick={async () => {
              try {
                const res: any = await api.post(`/admin/rbac/users/${record.id}/reset-password`);
                setAccountInfo({ account: res.account, password: res.password });
              } catch { message.error('密码重置失败'); }
            }}
          >
            重置密码
          </Button>
          <Popconfirm
            title="确定删除该管理员账号？"
            description="删除后不可恢复"
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="成员管理"
        extra={
          <Space>
            <Space.Compact>
              <SearchInput
                placeholder="搜索用户名/昵称"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 200 }}
              />
              <Button icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
            </Space.Compact>
            <Button icon={<ReloadOutlined />} onClick={() => fetchList(page, pageSize, search)}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.resetFields();
                setCreateOpen(true);
              }}
            >
              新建管理员
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 位管理员`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* 创建管理员 Modal */}
      <Modal
        title="新建管理员"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createLoading}
        destroyOnClose
        width={520}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="说明" style={{ marginBottom: 16 }}>
            <span style={{ color: '#888', fontSize: 13 }}>创建后系统将自动生成随机密码，管理员首次登录时可设置用户名和修改密码</span>
          </Form.Item>
          <Form.Item name="phone" label="登录账号" rules={[{ required: true, message: '请输入手机号' }, { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' }]}>
            <Input placeholder="请用手机号码注册" />
          </Form.Item>
          <Form.Item name="role_key" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select placeholder="请选择角色" options={roles.map((r) => ({ value: r.id, label: r.label || r.name }))} />
          </Form.Item>
        </Form>
      </Modal>



      <AccountInfoModal
        open={!!accountInfo}
        account={accountInfo?.account || ''}
        password={accountInfo?.password || ''}
        role="admin"
        onClose={() => setAccountInfo(null)}
      />
    </>
  );
}
