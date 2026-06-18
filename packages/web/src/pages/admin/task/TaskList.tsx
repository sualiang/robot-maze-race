import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input,
  InputNumber, Select, message, Spin, Divider, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

const { Text } = Typography;

interface TaskItem {
  id: string;
  name: string;
  type: 1 | 2;
  condition_desc: string;
  target_progress: number;
  reward_exp: number;
  reward_points: number;
  reward_race_count: number;
  sort_order: number;
  created_at: string;
}

const taskTypeLabels: Record<number, string> = {
  1: '每日任务',
  2: '成长任务',
};

const taskTypeColors: Record<number, string> = {
  1: 'blue',
  2: 'purple',
};

export default function TaskList() {
  const [list, setList] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/admin/tasks');
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
      type: 1,
      target_progress: 1,
      reward_exp: 0,
      reward_points: 0,
      reward_race_count: 0,
      sort_order: 0,
    });
    setModalOpen(true);
  };

  const handleEdit = (record: TaskItem) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/admin/tasks/${editingId}`, values);
        message.success('任务已更新');
      } else {
        await api.post('/admin/tasks', values);
        message.success('任务已创建');
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<TaskItem> = [
    { title: '任务名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 100,
      render: (t: number) => (
        <Tag color={taskTypeColors[t]}>
          {taskTypeLabels[t] || t}
        </Tag>
      ),
    },
    {
      title: '完成条件', dataIndex: 'condition_desc', key: 'condition_desc', width: 220,
      ellipsis: true,
    },
    {
      title: '目标进度', dataIndex: 'target_progress', key: 'target_progress', width: 80,
    },
    {
      title: '奖励预览', key: 'reward', width: 200,
      render: (_: unknown, r: TaskItem) => (
        <Space size={4} wrap>
          {r.reward_exp > 0 && <Tag color="orange">{r.reward_exp}经验</Tag>}
          {r.reward_points > 0 && <Tag color="purple">{r.reward_points}积分</Tag>}
          {r.reward_race_count > 0 && <Tag color="blue">{r.reward_race_count}参赛次数</Tag>}
          {r.reward_exp === 0 && r.reward_points === 0 && r.reward_race_count === 0 && <Text type="secondary">无</Text>}
        </Space>
      ),
    },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 60 },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right',
      render: (_: unknown, record: TaskItem) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card
        title="任务模板管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增任务</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 个任务` }}
        />
      </Card>

      <Modal
        title={editingId ? '编辑任务' : '新增任务'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={600}
        destroyOnClose
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="任务名称" maxLength={50} />
          </Form.Item>

          <Space size={16} wrap>
            <Form.Item name="type" label="任务类型" rules={[{ required: true, message: '请选择任务类型' }]}>
              <Select style={{ width: 200 }} placeholder="选择类型">
                <Select.Option value={1}>每日任务（每日0点重置）</Select.Option>
                <Select.Option value={2}>成长任务（赛季内单次）</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="sort_order" label="排序">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Form.Item name="condition_desc" label="完成条件描述" rules={[{ required: true, message: '请输入完成条件描述' }]}>
            <Input.TextArea rows={2} placeholder="例如：完成3场比赛" maxLength={200} />
          </Form.Item>

          <Form.Item name="target_progress" label="目标进度" rules={[{ required: true, message: '请输入目标进度' }]}>
            <InputNumber min={1} max={9999} style={{ width: 200 }} addonAfter="次" />
          </Form.Item>

          <Divider>奖励配置</Divider>

          <Space size={16} wrap>
            <Form.Item name="reward_exp" label="奖励经验">
              <InputNumber min={0} style={{ width: 160 }} addonAfter="经验" />
            </Form.Item>
            <Form.Item name="reward_points" label="奖励积分">
              <InputNumber min={0} style={{ width: 160 }} addonAfter="积分" />
            </Form.Item>
            <Form.Item name="reward_race_count" label="奖励参赛次数">
              <InputNumber min={0} style={{ width: 160 }} addonAfter="次" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
