import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Switch,
  Tag, message, Popconfirm, Input as SearchInput,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined,
  KeyOutlined, SearchOutlined,
} from '@ant-design/icons';
import AccountInfoModal from '../../../components/AccountInfoModal';
import api from '../../../utils/api';

interface OperatorUserItem {
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

export default function OperatorUserManage() {
  const [roleOptions, setRoleOptions] = useState<Array<{ key: string; name: string }>>([]);
  const [list, setList] = useState<OperatorUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  
  // Reset password modal
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdLoading, setResetPwdLoading] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [resetPwdForm] = Form.useForm();

  const [accountInfo, setAccountInfo] = useState<{ account: string; password: string } | null>(null);

  const fetchList = useCallback(async (p: number, ps: number, s: string) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, page_size: ps };
      if (s) params.search = s;
      const data: any = await api.get('/operator/rbac/users', { params });
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
    fetchList(page, pageSize, search);
  }, [fetchList, page, pageSize, search]);

  // 从后端加载角色列表
  useEffect(() => {
    api.get('/operator/rbac/roles').then((data: any) => {
      if (Array.isArray(data)) {
        setRoleOptions(data.map((r: any) => ({ key: r.key, name: r.label || r.name })));
      }
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreateLoading(true);
    try {
      const res: any = await api.post('/operator/rbac/users', values);
      setAccountInfo({ account: res.account, password: res.password });
      setCreateOpen(false);
      createForm.resetFields();
      fetchList(page, pageSize, search);
    } catch (err: any) {
      console.error('[OperatorUser] create error:', err);
      const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
      message.error(serverMsg || '创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (record: OperatorUserItem) => {
    try {
      await api.delete(`/operator/rbac/users/${record.id}`);
      message.success('删除成功');
      fetchList(page, pageSize, search);
    } catch (err: any) {
      console.error('[OperatorUser] delete error:', err);
      const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
      message.error(serverMsg || '删除失败');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwdUserId) return;
    const values = await resetPwdForm.validateFields();
    setResetPwdLoading(true);
    try {
      await api.post(`/operator/rbac/users/${resetPwdUserId}/reset-password`, {
        password: values.password,
      });
      message.success('密码重置成功');
      setResetPwdOpen(false);
      setResetPwdUserId(null);
      resetPwdForm.resetFields();
    } catch {
      message.error('密码重置失败');
    } finally {
      setResetPwdLoading(false);
    }
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const columns: ColumnsType<OperatorUserItem> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '手机', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      title: '角色', dataIndex: 'role_name', key: 'role_name', width: 120,
      render: (roleName: string) => <Tag color="blue">{roleName || '-'}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string, record: OperatorUserItem) => (
        <Switch
          checked={s === 'active'}
          checkedChildren="正常"
          unCheckedChildren="禁用"
          size="small"
          onChange={async (checked) => {
            try {
              await api.put(`/operator/rbac/users/${record.id}`, {
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
      render: (_: unknown, record: OperatorUserItem) => (
        <Space size="small" wrap>
          <Button
            type="link" size="small" icon={<KeyOutlined />}
            onClick={() => {
              setResetPwdUserId(record.id);
              resetPwdForm.resetFields();
              setResetPwdOpen(true);
            }}
          >
            重置密码
          </Button>
          <Popconfirm
            title="确定删除该成员？"
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

  const [tabKey, setTabKey] = useState('members');

  const roleTable = (
    <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: '#666', fontWeight: 600 }}>角色名称</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: '#666', fontWeight: 600 }}>角色标识</th>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: '#666', fontWeight: 600 }}>权限列表</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={{ padding: '6px 8px' }}>总管理员</td>
            <td style={{ padding: '6px 8px', color: '#888', fontFamily: 'monospace' }}>op_super_admin</td>
            <td style={{ padding: '6px 8px' }}>全部权限</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
            <td style={{ padding: '6px 8px' }}>运营</td>
            <td style={{ padding: '6px 8px', color: '#888', fontFamily: 'monospace' }}>op_admin</td>
            <td style={{ padding: '6px 8px' }}>赛场管理 · 赛场创建 · 赛场编辑 · 裁判管理 · 裁判创建 · 裁判编辑 · 参赛包管理 · 参赛包创建 · 参赛包编辑 · 营销管理 · 营销配置</td>
          </tr>
          <tr>
            <td style={{ padding: '6px 8px' }}>财务</td>
            <td style={{ padding: '6px 8px', color: '#888', fontFamily: 'monospace' }}>op_finance</td>
            <td style={{ padding: '6px 8px' }}>财务中心 · 财务提现 · 财务流水</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderMembers = () => (
    <Card className="member-card-no-title"
      title={""}
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
            新建成员
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
          showTotal: (t) => `共 ${t} 个成员`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </Card>
  );

  return (
    <>
      {renderMembers()}

      {/* 创建成员 Modal */}
      <Modal
        title="新建成员"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createLoading}
        destroyOnClose
        width={520}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="说明" style={{ marginBottom: 16 }}>
            <span style={{ color: '#888', fontSize: 13 }}>创建后系统将自动生成随机密码，成员首次登录时可设置用户名和修改密码。</span>
          </Form.Item>
          <Form.Item name="phone" label="登录账号" rules={[{ required: true, message: '请输入手机号' }, { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' }]}>
            <Input placeholder="请用手机号码注册" />
          </Form.Item>
          <Form.Item name="role_key" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select placeholder="请选择角色" options={roleOptions.map((r) => ({ value: r.key, label: r.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      <AccountInfoModal
        open={!!accountInfo}
        account={accountInfo?.account || ''}
        password={accountInfo?.password || ''}
        role="operator"
        onClose={() => setAccountInfo(null)}
      />

      {/* 重置密码 Modal */}
      <Modal
        title="重置密码"
        open={resetPwdOpen}
        onOk={handleResetPassword}
        onCancel={() => { setResetPwdOpen(false); setResetPwdUserId(null); }}
        confirmLoading={resetPwdLoading}
        destroyOnClose
      >
        <Form form={resetPwdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
