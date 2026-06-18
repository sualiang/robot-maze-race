import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input,
  InputNumber, message, Badge, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, ReloadOutlined,
  StopOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

interface MerchantItem {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact_name: string;
  contact_phone: string;
  logo_url: string;
  status: 'enabled' | 'disabled';
  created_at: string;
}

export default function MerchantManage() {
  const [list, setList] = useState<MerchantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/admin/merchant');
      setList(data?.list ?? []);
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
    setModalOpen(true);
  };

  const handleEdit = (record: MerchantItem) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/admin/merchant/${editingId}`, values);
        message.success('商家信息已更新');
      } else {
        const res = await api.post('/admin/merchant', values);
        const d = res?.data;
        if (d?.adminCreated) {
          Modal.info({
            title: '商家创建成功',
            content: (
              <div>
                <p>商家名称：<strong>{values.merchantName}</strong></p>
                <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, marginTop: 12 }}>
                  <p>登录地址：<br/><code style={{ wordBreak: 'break-all', fontSize: 12, color: '#1890ff' }}>http://175.24.200.63/merchant/login</code></p>
                  <p style={{ marginTop: 12 }}>账号：<strong style={{ color: '#1890ff', fontSize: 16 }}>{d.adminPhone}</strong></p>
                  <p style={{ marginTop: 8 }}>初始密码：<strong style={{ color: '#f5222d', fontSize: 16 }}>{d.adminPassword}</strong></p>
                </div>
                <p style={{ color: '#999', marginTop: 12, fontSize: 13 }}>请将以上信息提供给商家，商家首次登录后请及时修改密码。</p>
              </div>
            ),
            okText: '知道了',
            width: 480,
          });
        } else {
          message.success('商家已创建');
        }
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (record: MerchantItem) => {
    const newStatus = record.status === 'enabled' ? 'disabled' : 'enabled';
    try {
      await api.put(`/admin/merchant/${record.id}`, { status: newStatus === 'enabled' ? 1 : 0 });
      message.success(newStatus === 'enabled' ? '已启用' : '已禁用');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const merchantColumns: ColumnsType<MerchantItem> = [
    { title: '商家名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: '地址', dataIndex: 'address', key: 'address', width: 200,
      ellipsis: true,
    },
    // 经纬度列已移除（用户不需要手动输入）
    { title: '联系人', dataIndex: 'contact_name', key: 'contact_name', width: 100 },
    { title: '联系人手机', dataIndex: 'contact_phone', key: 'contact_phone', width: 120 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => (
        <Badge status={s === 'enabled' ? 'success' : 'error'} text={s === 'enabled' ? '启用' : '禁用'} />
      ),
    },
    {
      title: '操作', key: 'action', width: 180, fixed: 'right',
      render: (_: unknown, record: MerchantItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title={record.status === 'enabled' ? '确定禁用该商家？' : '确定启用该商家？'}
            onConfirm={() => handleToggleStatus(record)}
          >
            <Button
              type="link" size="small"
              danger={record.status === 'enabled'}
              icon={record.status === 'enabled' ? <StopOutlined /> : <CheckCircleOutlined />}
            >
              {record.status === 'enabled' ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="商家管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增商家</Button>
          </Space>
        }
      >
        <Table
          columns={merchantColumns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 家商家` }}
        />
      </Card>

      {/* 商家编辑弹窗 */}
      <Modal
        title={editingId ? '编辑商家' : '新增商家'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={600}
        destroyOnClose
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="merchantName" label="商家名称" rules={[{ required: true, message: '请输入商家名称' }]}>
            <Input placeholder="商家名称" maxLength={50} />
          </Form.Item>

          <Form.Item name="merchantAddress" label="地址" rules={[{ required: true, message: '请输入地址' }]}>
            <Input.TextArea rows={2} placeholder="详细地址" maxLength={200} />
          </Form.Item>

          <input type="hidden" name="latitude" value={0} />
          <input type="hidden" name="longitude" value={0} />

          <Space size={16} wrap>
            <Form.Item name="contactPhone" label="联系人手机" rules={[{ required: true, message: '请输入联系人手机' }]}>
              <Input placeholder="手机号码" style={{ width: 200 }} />
            </Form.Item>
          </Space>

          {!editingId && (
            <>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#999' }}>以下为商家登录账号信息（创建后不可修改）</div>
              <Space size={16} wrap>
                <Form.Item name="accountPhone" label="登录手机号" rules={[{ required: true, message: '请输入登录手机号' }]}>
                  <Input placeholder="商家登录用的手机号" maxLength={11} style={{ width: 220 }} />
                </Form.Item>
                <Form.Item name="accountPassword" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }]}>
                  <Input.Password placeholder="至少6位" minLength={6} style={{ width: 220 }} />
                </Form.Item>
              </Space>
            </>
          )}


        </Form>
      </Modal>
    </>
  );
}
