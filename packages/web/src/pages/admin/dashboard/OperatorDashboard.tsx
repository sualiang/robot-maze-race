import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Statistic, Row, Col, Button, Space, Tag, Select,
  DatePicker, message,
  Tabs, Result,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DollarOutlined, WalletOutlined, BankOutlined, ArrowUpOutlined,
  ArrowDownOutlined, DownloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../utils/api';
import RegionRevenueDrilldown from './RegionRevenueMap';

const { RangePicker } = DatePicker;

/* ── Types ── */
interface PlatformStats {
  total_revenue: number;
  total_orders: number;
  platform_profit: number;
  pending_withdraw: number;
}

interface TopOperator {
  rank: number;
  name: string;
  province: string;
  city: string;
  district: string;
  total_revenue: number;
  total_platform_profit: number;
  order_count: number;
}


export default function OperatorDashboard() {
  // 从 localStorage 获取当前用户角色和权限
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const roleName: string = adminUser.admin_role_name || '';
  const permissions: string[] = adminUser.permissions || [];
  const canView = permissions.includes('*') || permissions.includes('dashboard:read') || permissions.includes('dashboard:list') || roleName === 'super_admin' || roleName === 'ops_admin';

  if (!canView) {
    return (
      <Card>
        <Result
          status="403"
          title="403"
          subTitle="抱歉，您没有访问数据看板的权限。"
        />
      </Card>
    );
  }

  /* ── State: Stats ── */
  const [stats, setStats] = useState<PlatformStats>({
    total_revenue: 0, total_orders: 0, platform_profit: 0, pending_withdraw: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);



  /* ── State: Top operators ── */
  const [topOps, setTopOps] = useState<TopOperator[]>([]);
  const [loadingTopOps, setLoadingTopOps] = useState(false);
  const [topOpsMonth, setTopOpsMonth] = useState<string>('current');
  const [topOpsDateRange, setTopOpsDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [topOpsPage, setTopOpsPage] = useState(1);
  const [topOpsPageSize] = useState(10);




  /* ── Fetch stats ── */
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res: any = await api.get('/admin/dashboard/stats');
      if (res) setStats(res);
    } catch {
      // fallback
      setStats({
        total_revenue: 0,
        total_orders: 0,
        platform_profit: 0,
        pending_withdraw: 0,
      });
    } finally {
      setLoadingStats(false);
    }
  }, []);

  /* ── Fetch top operators ── */
  const fetchTopOperators = useCallback(async (page: number) => {
    setLoadingTopOps(true);
    try {
      const params: any = { page, page_size: 10 };
      if (topOpsMonth === 'current') params.month = dayjs().format('YYYY-MM');
      else params.month = dayjs().subtract(1, 'month').format('YYYY-MM');
      if (topOpsDateRange) {
        params.start_date = topOpsDateRange[0].format('YYYY-MM-DD');
        params.end_date = topOpsDateRange[1].format('YYYY-MM-DD');
      }
      const res: any = await api.get('/admin/dashboard/top-operators', { params });
      setTopOps(res?.list ?? []);
    } catch {
      setTopOps([]);
    } finally {
      setLoadingTopOps(false);
    }
  }, [topOpsMonth, topOpsDateRange]);


  useEffect(() => {
    fetchStats();
    fetchTopOperators(1);
  }, [fetchStats, fetchTopOperators]);



  const handleExport = async () => {
    try {
      const resp: any = await api.get('/admin/dashboard/export', {
        params: { format: 'csv' },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([resp]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-${dayjs().format('YYYY-MM-DD')}.csv`;
      a.click();
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  };

  /* ── Columns: Top Operators ── */
  const topOpColumns: ColumnsType<TopOperator> = [
    { title: '排名', dataIndex: 'rank', key: 'rank', width: 60, align: 'center' },
    { title: '运营商名称', dataIndex: 'name', key: 'name', width: 180 },
    { title: '省', dataIndex: 'province', key: 'province', width: 80 },
    { title: '市', dataIndex: 'city', key: 'city', width: 80 },
    { title: '区', dataIndex: 'district', key: 'district', width: 80 },
    {
      title: '营收', dataIndex: 'total_revenue', key: 'total_revenue', width: 130,
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    {
      title: '平台利润', dataIndex: 'total_platform_profit', key: 'total_platform_profit', width: 130,
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    {
      title: '订单数', dataIndex: 'order_count', key: 'order_count', width: 80,
    },
  ];



  /* ── 默认 Tab 为营收排行，区域钻取延迟加载避免 GeoJSON 大文件卡死 ── */
  const [activeTab, setActiveTab] = useState('topops');
  const [regionLoaded, setRegionLoaded] = useState(false);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === 'region' && !regionLoaded) {
      setRegionLoaded(true);
    }
  };

  /* ── Tab items ── */
  const tabItems = [
    {
      key: 'topops',
      label: '运营商营收排行',
      children: (
        <Card
          title="全国运营商营收排行"
          extra={
            <Space>
              <Select
                value={topOpsMonth}
                onChange={(v) => { setTopOpsMonth(v); setTopOpsPage(1); }}
                options={[
                  { value: 'current', label: '本月' },
                  { value: 'last', label: '上月' },
                ]}
                size="small"
                style={{ width: 90 }}
              />
              <RangePicker
                size="small"
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setTopOpsDateRange([dates[0], dates[1]]);
                  } else {
                    setTopOpsDateRange(null);
                  }
                  setTopOpsPage(1);
                }}
              />
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
            </Space>
          }
        >
          <Table
            columns={topOpColumns}
            dataSource={topOps}
            rowKey="rank"
            loading={loadingTopOps}
            pagination={{
              current: topOpsPage,
              pageSize: topOpsPageSize,
              total: 100,
              onChange: (p) => {
                setTopOpsPage(p);
                fetchTopOperators(p);
              },
              showTotal: (t) => `共 ${t} 家运营商`,
            }}
            size="small"
            scroll={{ x: 850 }}
          />
        </Card>
      ),
    },
    {
      key: 'region',
      label: '区域营收钻取',
      children: regionLoaded ? <RegionRevenueDrilldown /> : <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>点击此标签页加载数据</div>,
    },
  ];

  return (
    <div>
      {/* 板块一：核心指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loadingStats}>
            <Statistic title="全平台营收" value={stats.total_revenue / 100} precision={2}
              prefix={<DollarOutlined />} suffix="元" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loadingStats}>
            <Statistic title="全平台订单" value={stats.total_orders} prefix={<WalletOutlined />} suffix="笔" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loadingStats}>
            <Statistic title="平台利润" value={stats.platform_profit / 100} precision={2}
              prefix={<BankOutlined />} suffix="元" valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loadingStats}>
            <Statistic title="待审核提现" value={stats.pending_withdraw / 100} precision={2}
              prefix={<DollarOutlined />} suffix="元" valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
      </Row>

      {/* 板块二+三+四: Tabs */}
      <Card>
        <Tabs items={tabItems} activeKey={activeTab} onChange={handleTabChange} />
      </Card>
    </div>
  );
}
