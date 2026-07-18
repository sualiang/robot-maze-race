import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Statistic, Row, Col, Button, Space,
  DatePicker, Tabs, message, Modal, Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DollarOutlined, WalletOutlined, DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../utils/api';

interface RevenueItem {
  date: string;
  orderCount: number;
  revenue: number;
  discount: number;
  pointsDeducted: number;
  orders: OrderDetail[];
}

interface OrderDetail {
  id: string;
  orderNo: string;
  amountCents: number;
  discountCents: number;
  pointsDeducted: number;
  paidAt: string;
  packageId: string;
}

interface SettlementItem {
  id: string;
  period: string;
  amount: number;
  status: string;
  settled_at?: string;
  created_at: string;
}

const settlementStatusLabels: Record<string, string> = {
  pending: '待结算',
  settled: '已结算',
  withdrawn: '已提现',
};

const settlementStatusColors: Record<string, string> = {
  pending: 'orange',
  settled: 'blue',
  withdrawn: 'green',
};

export default function FinanceCenter() {
  const [revenueList, setRevenueList] = useState<RevenueItem[]>([]);
  const [settlementList, setSettlementList] = useState<SettlementItem[]>([]);
  const [loadingRevenue, setLoadingRevenue] = useState(false);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [revenueSort, setRevenueSort] = useState<'desc' | 'asc'>('desc');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailDate, setDetailDate] = useState('');
  const [detailOrders, setDetailOrders] = useState<OrderDetail[]>([]);

  // 统计数据 — 5个：今日营收、本月营收、今日订单、本月订单、本月积分抵扣
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [monthOrders, setMonthOrders] = useState(0);
  const [monthPointsDeducted, setMonthPointsDeducted] = useState(0);

  const fetchRevenue = useCallback(async () => {
    setLoadingRevenue(true);
    try {
      const res: any = await api.get('/operator/finance/summary');
      const s = res?.settlements ?? {};
      setTodayRevenue(Math.round((s.settled_amount_cents ?? 0) / 100));
      setTodayOrders(s.settled_count ?? 0);
      setMonthRevenue(Math.round(((s.settled_amount_cents ?? 0) + (s.pending_amount_cents ?? 0)) / 100));
      setMonthOrders((s.settled_count ?? 0) + (s.pending_count ?? 0));
      setMonthPointsDeducted(Math.round((s.total_points_deduction_cents ?? 0) / 100));
    } catch { }
    finally { setLoadingRevenue(false); }
  }, []);

  const fetchRevenueDetails = useCallback(async (sort: string = 'desc') => {
    setLoadingRevenue(true);
    try {
      const res: any = await api.get('/operator/finance/revenue-details', {
        params: { sortOrder: sort },
      });
      setRevenueList(res?.data ?? res ?? []);
    } catch { setRevenueList([]); }
    finally { setLoadingRevenue(false); }
  }, []);

  const fetchSettlements = useCallback(async () => {
    setLoadingSettlement(true);
    try {
      await api.get('/operator/finance/summary');
      setSettlementList([]);
    } catch { setSettlementList([]); }
    finally { setLoadingSettlement(false); }
  }, []);

  useEffect(() => {
    fetchRevenue();
    fetchRevenueDetails();
    fetchSettlements();
  }, [fetchRevenue, fetchRevenueDetails, fetchSettlements]);

  const handleExport = async () => {
    try {
      const resp: any = await api.get('/operator/finance/export', {
        params: { format: 'csv' },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([resp]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-${dayjs().format('YYYY-MM-DD')}.csv`;
      a.click();
      message.success('导出成功');
    } catch { message.error('导出失败'); }
  };

  const handleSortRevenue = () => {
    const next = revenueSort === 'desc' ? 'asc' : 'desc';
    setRevenueSort(next);
    fetchRevenueDetails(next);
  };

  const showDetail = (item: RevenueItem) => {
    setDetailDate(item.date);
    setDetailOrders(item.orders || []);
    setDetailModalOpen(true);
  };

  const revenueColumns: ColumnsType<RevenueItem> = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    {
      title: '订单数', dataIndex: 'orderCount', key: 'orderCount', width: 90,
      render: (v: number) => `${v}笔`,
    },
    {
      title: (
        <span onClick={handleSortRevenue} style={{ cursor: 'pointer' }}>
          营收 {revenueSort === 'desc' ? '↓' : '↑'}
        </span>
      ),
      dataIndex: 'revenue', key: 'revenue', width: 150,
      render: (v: number, r: RevenueItem) => {
        const ptsYuan = (r.pointsDeducted || 0) / 100;
        return (
          <span>
            <span style={{ fontWeight: 600 }}>¥{(v / 100).toFixed(2)}</span>
            {ptsYuan > 0 ? <span style={{ color: '#faad14', fontSize: 12, marginLeft: 4 }}>(积分抵扣 ¥{ptsYuan.toFixed(2)})</span> : null}
          </span>
        );
      },
    },
    {
      title: '详情', dataIndex: 'detail', key: 'detail', width: 100,
      render: (_: any, item: RevenueItem) => (
        <Button type="link" size="small" onClick={() => showDetail(item)}>
          查看详情
        </Button>
      ),
    },
  ];

  const settlementColumns: ColumnsType<SettlementItem> = [
    { title: '结算周期', dataIndex: 'period', key: 'period', width: 140 },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: number) => `¥${(v / 100).toFixed(2)}` },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => <Tag color={settlementStatusColors[s] || 'default'}>{settlementStatusLabels[s] || s}</Tag>,
    },
    {
      title: '结算时间', dataIndex: 'settled_at', key: 'settled_at', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
  ];

  const tabItems = [
    {
      key: 'revenue',
      label: '营收明细',
      children: (
        <Table
          columns={revenueColumns}
          dataSource={revenueList}
          rowKey="date"
          loading={loadingRevenue}
          pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条` }}
          size="small"
        />
      ),
    },
    {
      key: 'settlements',
      label: '结算记录',
      children: (
        <Table
          columns={settlementColumns}
          dataSource={settlementList}
          rowKey="id"
          loading={loadingSettlement}
          pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条` }}
          size="small"
        />
      ),
    },
  ];

  const detailColumns: ColumnsType<OrderDetail> = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 200, ellipsis: true },
    {
      title: '实付金额', dataIndex: 'amountCents', key: 'amountCents', width: 100,
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    {
      title: '积分抵扣', dataIndex: 'pointsDeducted', key: 'pointsDeducted', width: 100,
      render: (v: number) => v > 0
        ? <Tag color="gold">-¥{(v / 100).toFixed(2)}</Tag>
        : <span style={{ color: '#999' }}>未使用</span>,
    },
    {
      title: '支付时间', dataIndex: 'paidAt', key: 'paidAt', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
  ];

  return (
    <div>
      {/* 统计卡片 — 5个 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日营收"
              value={todayRevenue / 100}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="本月营收"
              value={monthRevenue / 100}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日订单"
              value={todayOrders}
              prefix={<WalletOutlined />}
              suffix="笔"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="本月订单"
              value={monthOrders}
              prefix={<WalletOutlined />}
              suffix="笔"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="本月积分抵扣"
              value={monthPointsDeducted / 100}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 明细 */}
      <Card
        title="财务明细"
        extra={
          <Space>
            <DatePicker.RangePicker size="small" />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => { fetchRevenue(); fetchSettlements(); }}>
              刷新
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
              导出报表
            </Button>
          </Space>
        }
      >
        <Tabs items={tabItems} />
      </Card>
      {/* 详情弹窗 */}
      <Modal
        title={`${detailDate} 订单详情`}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={700}
      >
        <Table
          columns={detailColumns}
          dataSource={detailOrders}
          rowKey="id"
          pagination={{ pageSize: 5, showTotal: (t: number) => `共 ${t} 笔订单` }}
          size="small"
          summary={() => {
            const totalAmount = detailOrders.reduce((s, o) => s + o.amountCents, 0);
            const totalPts = detailOrders.reduce((s, o) => s + (o.pointsDeducted || 0), 0);
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><strong>¥{(totalAmount / 100).toFixed(2)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2}><strong>-¥{(totalPts / 100).toFixed(2)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={3}></Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
      </Modal>
    </div>
  );
}
