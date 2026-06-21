import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Statistic, Row, Col, Button, Space, Tag,
  DatePicker, Tabs, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DollarOutlined, WalletOutlined, DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../utils/api';

interface RevenueItem {
  date: string;
  order_count: number;
  revenue: number;
  settlement: number;
  status: string;
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

  // 统计数据 — 只保留4个
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [monthOrders, setMonthOrders] = useState(0);

  const fetchRevenue = useCallback(async () => {
    setLoadingRevenue(true);
    try {
      const res: any = await api.get('/operator/finance/summary');
      const s = res?.settlements ?? {};
      setRevenueList([]);
      setTodayRevenue(Math.round((s.settled_amount_cents ?? 0) / 100));
      setTodayOrders(s.settled_count ?? 0);
      setMonthRevenue(Math.round(((s.settled_amount_cents ?? 0) + (s.pending_amount_cents ?? 0)) / 100));
      setMonthOrders((s.settled_count ?? 0) + (s.pending_count ?? 0));
    } catch { setRevenueList([]); }
    finally { setLoadingRevenue(false); }
  }, []);

  const fetchSettlements = useCallback(async () => {
    setLoadingSettlement(true);
    try {
      const res: any = await api.get('/operator/finance/summary');
      setSettlementList([]);
    } catch { setSettlementList([]); }
    finally { setLoadingSettlement(false); }
  }, []);

  useEffect(() => {
    fetchRevenue();
    fetchSettlements();
  }, [fetchRevenue, fetchSettlements]);

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

  const revenueColumns: ColumnsType<RevenueItem> = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    {
      title: '订单数', dataIndex: 'order_count', key: 'order_count', width: 90,
      render: (v: number) => `${v}笔`,
    },
    {
      title: '营收', dataIndex: 'revenue', key: 'revenue', width: 120,
      render: (v: number) => <span style={{ fontWeight: 600 }}>¥{(v / 100).toFixed(2)}</span>,
      sorter: (a: RevenueItem, b: RevenueItem) => a.revenue - b.revenue,
    },
    {
      title: '结算金额', dataIndex: 'settlement', key: 'settlement', width: 120,
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    {
      title: '结算状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => (
        <Tag color={settlementStatusColors[s] || 'default'}>
          {settlementStatusLabels[s] || s}
        </Tag>
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

  return (
    <div>
      {/* 统计卡片 — 只保留4个：今日营收、本月营收、今日订单、本月订单 */}
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
    </div>
  );
}
