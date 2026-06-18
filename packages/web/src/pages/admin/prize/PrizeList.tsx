import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input,
  InputNumber, Select, Switch, message, Popconfirm, Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

interface PrizeItem {
  id: string;
  name: string;
  type: 'race_count' | 'points' | 'coupon' | 'physical' | 'final_race_count';
  value: number;
  probability: number;
  stock: number;
  sort_order: number;
  enabled: boolean;
  created_at: string;
}

const prizeTypeLabels: Record<string, string> = {
  race_count: '参赛次数',
  points: '积分',
  coupon: '优惠券',
  physical: '实物',
  final_race_count: '总决赛次数',
};

const prizeTypeColors: Record<string, string> = {
  race_count: 'blue',
  points: 'purple',
  coupon: 'orange',
  physical: 'green',
  final_race_count: 'gold',
};

const PRIZE_TYPE_OPTIONS = Object.entries(prizeTypeLabels).map(([value, label]) => ({
  value,
  label,
}));

export default function PrizeList() {
  const [list, setList] = useState<PrizeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/admin/prizes');
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
    form.setFieldsValue({ enabled: true, probability: 0, stock: 0, sort_order: 0 });
    setModalOpen(true);
  };

  const handleEdit = (record: PrizeItem) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/admin/prizes/${editingId}`, values);
        message.success('奖品已更新');
      } else {
        await api.post('/admin/prizes', values);
        message.success('奖品已创建');
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (record: PrizeItem) => {
    try {
      await api.patch(`/admin/prizes/${record.id}`, { enabled: !record.enabled });
      message.success(!record.enabled ? '已上架' : '已下架');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<PrizeItem> = [
    { title: '奖品名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 100,
      render: (t: string) => <Tag color={prizeTypeColors[t]}>{prizeTypeLabels[t] || t}</Tag>,
    },
    {
      title: '价值', dataIndex: 'value', key: 'value', width: 80,
      render: (v: number) => v ?? '-',
    },
    {
      title: '概率(%)', dataIndex: 'probability', key: 'probability', width: 90,
      render: (v: number) => (v != null ? `${v}%` : '-'),
    },
    { title: '库存', dataIndex: 'stock', key: 'stock', width: 70 },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 60 },
    {
      title: '状态', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (v: boolean) => v ? <Tag color="green">上架</Tag> : <Tag color="default">下架</Tag>,
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right',
      render: (_: unknown, record: PrizeItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title={record.enabled ? '确定下架该奖品？' : '确定上架该奖品？'}
            onConfirm={() => handleToggleEnabled(record)}
          >
            <Button type="link" size="small">
              {record.enabled ? '下架' : '上架'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="奖品管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增奖品</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 个奖品` }}
        />
      </Card>

      <Modal
        title={editingId ? '编辑奖品' : '新增奖品'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={560}
        destroyOnClose
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="奖品名称" rules={[{ required: true, message: '请输入奖品名称' }]}>
            <Input placeholder="奖品名称" maxLength={50} />
          </Form.Item>

          <Space size={16} wrap>
            <Form.Item name="type" label="奖品类型" rules={[{ required: true, message: '请选择奖品类型' }]}>
              <Select style={{ width: 200 }} options={PRIZE_TYPE_OPTIONS} placeholder="选择类型" />
            </Form.Item>
            <Form.Item name="value" label="价值">
              <InputNumber min={0} style={{ width: 180 }} placeholder="价值数值" />
            </Form.Item>
          </Space>

          <Space size={16} wrap>
            <Form.Item name="probability" label="概率(%)" rules={[{ required: true, message: '请输入概率' }]}>
              <InputNumber min={0} max={100} step={0.1} style={{ width: 160 }} addonAfter="%" />
            </Form.Item>
            <Form.Item name="stock" label="库存" rules={[{ required: true, message: '请输入库存' }]}>
              <InputNumber min={0} style={{ width: 160 }} addonAfter="个" />
            </Form.Item>
            <Form.Item name="sort_order" label="排序">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Form.Item name="enabled" label="上架" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
