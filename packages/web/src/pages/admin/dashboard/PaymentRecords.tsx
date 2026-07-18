import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Select, DatePicker, Tag, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import api from '../../../utils/api';

const { RangePicker } = DatePicker;

/* ── Types ── */
interface PaymentRecord {
  id: string;
  order_id: string;
  operator_id: string;
  operator_name: string;
  user_id: string;
  transaction_id: string;
  amount_cents: number;
  status: string;
  pay_time: string;
  created_at: string;
}

const statusLabels: Record<string, string> = { paid: '已支付', refunded: '已退款' };
const statusColors: Record<string, string> = { paid: 'green', refunded: 'red' };

const columns: ColumnsType<PaymentRecord> = [
  { title: '运营商', dataIndex: 'operator_name', key: 'operator_name', width: 140, fixed: 'left' },
  { title: '订单ID', dataIndex: 'order_id', key: 'order_id', width: 120, ellipsis: true,
    render: (v: string) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v?.substring(0, 8)}...</span> },
  { title: '微信交易号', dataIndex: 'transaction_id', key: 'transaction_id', width: 200, ellipsis: true,
    render: (v: string) => v ? <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v.substring(0, 16)}...</span> : '-' },
  { title: '金额', dataIndex: 'amount_cents', key: 'amount_cents', width: 100,
    render: (v: number) => `¥${(v / 100).toFixed(2)}` },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80,
    render: (s: string) => <Tag color={statusColors[s] || 'default'}>{statusLabels[s] || s}</Tag> },
  { title: '支付时间', dataIndex: 'pay_time', key: 'pay_time', width: 160,
    render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
  { title: '用户ID', dataIndex: 'user_id', key: 'user_id', width: 120, ellipsis: true,
    render: (v: string) => v ? <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v.substring(0, 8)}...</span> : '-' },
];

export default function PaymentRecords() {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize };
      if (filterStatus) params.status = filterStatus;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.date_start = dateRange[0].format('YYYY-MM-DD');
        params.date_end = dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.get('/admin/finance/payment-records', { params });
      if (res?.data?.code === 0) {
        setRecords(res.data.data.list || []);
        setTotal(res.data.data.total || 0);
      } else {
        message.error(res?.data?.message || '获取支付凭证失败');
      }
    } catch (err: any) {
      message.error('获取支付凭证失败: ' + (err.message || '网络错误'));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, dateRange]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  return (
    <Card
      title="支付原始凭证"
      extra={
        <Space>
          <Select
            allowClear
            placeholder="支付状态"
            value={filterStatus || undefined}
            onChange={(v) => { setFilterStatus(v || ''); setPage(1); }}
            options={[
              { value: 'paid', label: '已支付' },
              { value: 'refunded', label: '已退款' },
            ]}
            size="small"
            style={{ width: 100 }}
          />
          <RangePicker
            size="small"
            onChange={(dates) => {
              setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null);
              setPage(1);
            }}
          />
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p) => { setPage(p); fetchData(p); },
          showTotal: (t) => `共 ${t} 条记录`,
        }}
        size="small"
        scroll={{ x: 1080 }}
      />
    </Card>
  );
}
