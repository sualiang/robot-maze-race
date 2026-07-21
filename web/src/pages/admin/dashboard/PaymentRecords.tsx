import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Select, DatePicker, Tag, Space, Button, Modal, Descriptions, message } from 'antd';
import { ExportOutlined, EyeOutlined } from '@ant-design/icons';
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

/* ── CSV 导出工具 ── */
const CSV_HEADERS = [
  '记录ID', '订单ID', '运营商ID', '运营商名称', '用户ID',
  '微信交易号', '金额(元)', '状态', '支付时间', '创建时间',
];

function recordToCsvRow(r: PaymentRecord): string[] {
  return [
    r.id,
    r.order_id,
    r.operator_id,
    r.operator_name,
    r.user_id,
    r.transaction_id,
    (r.amount_cents / 100).toFixed(2),
    statusLabels[r.status] || r.status,
    r.pay_time ? dayjs(r.pay_time).format('YYYY-MM-DD HH:mm:ss') : '',
    r.created_at ? dayjs(r.created_at).format('YYYY-MM-DD HH:mm:ss') : '',
  ];
}

function downloadCsv(rows: PaymentRecord[]) {
  const lines: string[] = [];
  lines.push('\uFEFF' + CSV_HEADERS.join(','));
  for (const r of rows) {
    lines.push(recordToCsvRow(r).map(escapeCsvField).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `支付凭证_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvField(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

const DETAIL_FIELDS: { label: string; key: keyof PaymentRecord; render?: (v: any, r: PaymentRecord) => string }[] = [
  { label: '记录ID', key: 'id' },
  { label: '订单ID', key: 'order_id' },
  { label: '运营商ID', key: 'operator_id' },
  { label: '运营商名称', key: 'operator_name' },
  { label: '用户ID', key: 'user_id' },
  { label: '微信交易号', key: 'transaction_id' },
  { label: '金额(元)', key: 'amount_cents', render: (v: number) => `¥${(v / 100).toFixed(2)}` },
  { label: '状态', key: 'status', render: (v: string) => statusLabels[v] || v },
  { label: '支付时间', key: 'pay_time', render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
  { label: '创建时间', key: 'created_at', render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
];

export default function PaymentRecords() {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  /* 详情弹窗 */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<PaymentRecord | null>(null);

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
      // 拦截器已解包 {list, total}
      if (res.list !== undefined) {
        setRecords(res.list || []);
        setTotal(res.total || 0);
      } else if (res?.data?.code === 0) {
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

  /* 导出 CSV：请求不分页获取全部记录 */
  const handleExport = async () => {
    try {
      const params: any = { page: 1, pageSize: 99999 };
      if (filterStatus) params.status = filterStatus;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.date_start = dateRange[0].format('YYYY-MM-DD');
        params.date_end = dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.get('/admin/finance/payment-records', { params });
      const list = res.list || res.data?.data?.list || [];
      downloadCsv(list);
      message.success(`已导出 ${list.length} 条记录`);
    } catch (err: any) {
      message.error('导出失败: ' + (err.message || '网络错误'));
    }
  };

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
    { title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_: any, record: PaymentRecord) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => { setDetailRecord(record); setDetailOpen(true); }}
        >
          查看详情
        </Button>
      )},
  ];

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
          <Button
            size="small"
            icon={<ExportOutlined />}
            onClick={handleExport}
          >
            导出CSV
          </Button>
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
        scroll={{ x: 1180 }}
      />

      <Modal
        title="支付凭证详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={600}
      >
        {detailRecord && (
          <Descriptions column={1} size="small" bordered>
            {DETAIL_FIELDS.map((f) => (
              <Descriptions.Item key={f.key} label={f.label}>
                {f.render
                  ? f.render(detailRecord[f.key], detailRecord)
                  : String(detailRecord[f.key] ?? '-')}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
}
