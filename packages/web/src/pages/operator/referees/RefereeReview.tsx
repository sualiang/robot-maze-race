import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, Modal, Input, message } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../../utils/api';

interface RefereeApplication {
  id: string;
  name: string;
  phone: string;
  status: string;
  reject_reason?: string;
  operator_name?: string;
  created_at: string;
  reviewed_at?: string;
}

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待审核' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' },
};

export default function RefereeReview() {
  const [list, setList] = useState<RefereeApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RefereeApplication | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/referee/applications', { params: { pageSize: 1000 } });
      setList(res?.data?.list ?? res?.list ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleApprove = async (record: RefereeApplication) => {
    setSubmitting(true);
    try {
      await api.post('/referee/review', { refereeId: record.id, action: 'approve' });
      message.success(`裁判「${record.name}」已通过审核`);
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '审核失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = (record: RefereeApplication) => {
    setRejectTarget(record);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setSubmitting(true);
    try {
      await api.post('/referee/review', {
        refereeId: rejectTarget.id,
        action: 'reject',
        rejectReason: rejectReason || undefined,
      });
      message.success(`裁判「${rejectTarget.name}」已驳回`);
      setRejectModalOpen(false);
      setRejectTarget(null);
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '驳回失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<RefereeApplication> = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => {
        const cfg = STATUS_MAP[s] || { color: 'default', text: s };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    { title: '运营商', dataIndex: 'operator_name', key: 'operator_name', width: 140, render: (v: string) => v || '-' },
    {
      title: '申请时间', dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'actions', width: 180, fixed: 'right',
      render: (_, record) => (
        record.status === 'pending' ? (
          <Space>
            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)} loading={submitting}>
              通过
            </Button>
            <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleReject(record)} loading={submitting}>
              拒绝
            </Button>
          </Space>
        ) : (
          <span style={{ color: '#999' }}>
            {record.status === 'approved' ? '已通过' : record.reject_reason ? `驳回: ${record.reject_reason}` : '已驳回'}
          </span>
        )
      ),
    },
  ];

  return (
    <div>
      <Card
        title="裁判审核"
        extra={<Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={<span><ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />驳回申请</span>}
        open={rejectModalOpen}
        onOk={handleRejectConfirm}
        onCancel={() => { setRejectModalOpen(false); setRejectTarget(null); }}
        confirmLoading={submitting}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <p style={{ marginBottom: 8 }}>驳回裁判「<strong>{rejectTarget?.name}</strong>」</p>
        <Input.TextArea
          placeholder="驳回原因（选填）"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          maxLength={200}
          rows={3}
        />
      </Modal>
    </div>
  );
}
