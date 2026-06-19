import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input,
  InputNumber, message, Switch, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import api from '../../../utils/api';

interface PackageItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  race_count: number;
  valid_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 从 localStorage 获取当前用户角色
const operatorUserInfo = (() => {
  try {
    return JSON.parse(localStorage.getItem('operator_user_info') || '{}');
  } catch { return {}; }
})();
const operatorRoleName: string = operatorUserInfo.role_name || '';
const operatorRoleId: string = operatorUserInfo.role_id || '';
const operatorPermissions: string[] = operatorUserInfo.permissions || [];
// 运营商超管（op_super_admin）或拥有 '*' 权限 → 可删除
const isOperatorManager = operatorRoleId === 'op_super_admin' || operatorPermissions.includes('*');

export default function PackageList() {
  const [list, setList] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/packages?status=');
      setList(data?.list ?? data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      price: 9.90,
      race_count: 3,
      valid_days: 30,
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleEdit = (record: PackageItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      price: record.price,
      race_count: record.race_count,
      valid_days: record.valid_days,
      is_active: record.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingId) {
        await api.put(`/packages/${editingId}`, values);
        message.success('更新成功');
      } else {
        await api.post('/packages', values);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      console.error('[PackageList] save error:', err);
      // 尝试从错误中提取服务端提示
      const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
      message.error(serverMsg || '操作失败');
    }
  };

  const handleToggleStatus = async (record: PackageItem) => {
    try {
      await api.patch(`/packages/${record.id}`, { is_active: !record.is_active });
      message.success(record.is_active ? '已下架' : '已上架');
      fetchList();
    } catch (err: any) {
      console.error('[PackageList] toggle error:', err);
      const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
      message.error(serverMsg || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/packages/${id}`);
      message.success('已删除');
      fetchList();
    } catch (err: any) {
      console.error('[PackageList] delete error:', err);
      const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
      message.error(serverMsg || '删除失败');
    }
  };

  const columns: ColumnsType<PackageItem> = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: '描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '价格(¥)', dataIndex: 'price', key: 'price', width: 100,
      render: (v: number) => `¥${v.toFixed(2)}`,
      sorter: (a, b) => a.price - b.price,
    },
    { title: '参赛次数', dataIndex: 'race_count', key: 'race_count', width: 90 },
    {
      title: '有效期(天)', dataIndex: 'valid_days', key: 'valid_days', width: 100,
      render: (v: number) => `${v}天`,
    },
    {
      title: '状态', dataIndex: 'is_active', key: 'is_active', width: 90,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>
          {active ? '在售' : '已下架'}
        </Tag>
      ),
    },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right',
      render: (_: unknown, record: PackageItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title={record.is_active ? '确定下架该参赛包？' : '确定上架该参赛包？'}
            onConfirm={() => handleToggleStatus(record)}
          >
            <Button
              type="link"
              size="small"
              icon={record.is_active ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
              danger={record.is_active}
            >
              {record.is_active ? '下架' : '上架'}
            </Button>
          </Popconfirm>
          {isOperatorManager && (
            <Popconfirm title="确定删除？此操作不可恢复" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="参赛包管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增参赛包</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 个参赛包` }}
        />
      </Card>

      <Modal
        title={editingId ? '编辑参赛包' : '新增参赛包'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="参赛包名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：新手体验包" maxLength={30} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="描述信息（选填）" maxLength={200} showCount />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="price" label="价格（元）" rules={[{ required: true, message: '请输入价格' }]}>
              <InputNumber min={0.01} max={99999} step={0.01} precision={2} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="race_count" label="参赛次数" rules={[{ required: true, message: '请输入次数' }]}>
              <InputNumber min={1} max={100} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="valid_days" label="有效期（天）" rules={[{ required: true, message: '请输入有效期' }]}>
            <InputNumber min={1} max={365} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="is_active" label="立即上架" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
