import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input,
  InputNumber, DatePicker, message, Popconfirm, Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EyeOutlined, PlayCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../utils/api';

interface SeasonItem {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  lock_time: string;
  max_participants: number;
  status: 'pending' | 'active' | 'finished';
  participant_count: number;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  pending: '未开启',
  active: '进行中',
  finished: '已结束',
};

const statusColors: Record<string, string> = {
  pending: 'default',
  active: 'green',
  finished: 'red',
};

export default function AdminSeasonList() {
  const [list, setList] = useState<SeasonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/admin/seasons');
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
    setModalOpen(true);
  };

  const handleEdit = (record: SeasonItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      start_time: record.start_time ? dayjs(record.start_time) : null,
      end_time: record.end_time ? dayjs(record.end_time) : null,
      lock_time: record.lock_time ? dayjs(record.lock_time) : null,
      max_participants: record.max_participants,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      start_time: values.start_time?.toISOString(),
      end_time: values.end_time?.toISOString(),
      lock_time: values.lock_time?.toISOString(),
      max_participants: values.max_participants,
    };
    try {
      if (editingId) {
        await api.put(`/admin/seasons/${editingId}`, payload);
        message.success('赛季已更新');
      } else {
        await api.post('/admin/seasons', payload);
        message.success('赛季已创建');
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      await api.post(`/admin/seasons/${id}/activate`);
      message.success('赛季已开启，选手数据已自动生成');
      fetchList();
    } catch {
      message.error('开启失败');
    } finally {
      setActivating(null);
    }
  };

  const columns: ColumnsType<SeasonItem> = [
    { title: '赛季名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '时间范围', key: 'time_range', width: 280,
      render: (_: unknown, r: SeasonItem) => {
        const start = r.start_time ? dayjs(r.start_time).format('YYYY-MM-DD HH:mm') : '-';
        const end = r.end_time ? dayjs(r.end_time).format('YYYY-MM-DD HH:mm') : '-';
        return `${start} ~ ${end}`;
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] || s}</Tag>,
    },
    {
      title: '入围人数', dataIndex: 'participant_count', key: 'participant_count', width: 100,
    },
    {
      title: '操作', key: 'action', width: 260, fixed: 'right',
      render: (_: unknown, record: SeasonItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleEdit(record)}>
            详情
          </Button>
          {record.status === 'pending' && (
            <Popconfirm
              title="确定开启该赛季？开启后将自动生成选手初始数据。"
              onConfirm={() => handleActivate(record.id)}
            >
              <Button
                type="link" size="small"
                icon={<PlayCircleOutlined />}
                loading={activating === record.id}
                style={{ color: '#52c41a' }}
              >
                开启赛季
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="赛季管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建赛季</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 个赛季` }}
        />
      </Card>

      <Modal
        title={editingId ? '赛季详情' : '新建赛季'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="赛季名称" rules={[{ required: true, message: '请输入赛季名称' }]}>
            <Input placeholder="例如：S1 春季赛" maxLength={50} />
          </Form.Item>

          <Space size={16} wrap>
            <Form.Item name="start_time" label="开始时间" rules={[{ required: true, message: '请选择开始时间' }]}>
              <DatePicker showTime style={{ width: 240 }} />
            </Form.Item>
            <Form.Item name="end_time" label="结束时间" rules={[{ required: true, message: '请选择结束时间' }]}>
              <DatePicker showTime style={{ width: 240 }} />
            </Form.Item>
          </Space>

          <Space size={16} wrap>
            <Form.Item name="lock_time" label="入围锁定时间" rules={[{ required: true, message: '请选择入围锁定时间' }]}>
              <DatePicker showTime style={{ width: 240 }} />
            </Form.Item>
            <Form.Item name="max_participants" label="入围人数" rules={[{ required: true, message: '请输入入围人数' }]}>
              <InputNumber min={1} max={10000} style={{ width: 240 }} addonAfter="人" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
