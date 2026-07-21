import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, DatePicker, Typography, Spin, Statistic, Row, Col, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LeftOutlined, RightOutlined, ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../utils/api';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/* ── Types ── */

type DrillLevel = 'province' | 'city' | 'district' | 'operator' | 'daily';

interface RegionItem {
  name: string;       // 地区名称（如广东省、广州市）
  operator_count: number;
  today_revenue_cents: number;
  month_revenue_cents: number;
  prev_month_revenue_cents: number;
}

interface OperatorItem {
  id: string;
  name: string;
}

interface DailyRevenueItem {
  date: string;
  revenue_cents: number;
}

/* ── Component ── */

export default function RegionRevenueDrilldown() {
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('province');
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<{ id: string; name: string } | null>(null);

  const [loading, setLoading] = useState(false);

  const [provinceList, setProvinceList] = useState<RegionItem[]>([]);
  const [cityList, setCityList] = useState<RegionItem[]>([]);
  const [districtList, setDistrictList] = useState<RegionItem[]>([]);
  const [operatorList, setOperatorList] = useState<OperatorItem[]>([]);
  const [dailyList, setDailyList] = useState<DailyRevenueItem[]>([]);

  const [dailyRange, setDailyRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs(),
  ]);

  /* ── 面包屑 ── */
  const breadcrumb: { level: DrillLevel; label: string }[] = [
    { level: 'province', label: '全国' },
    ...(selectedProvince ? [{ level: 'city' as const, label: selectedProvince }] : []),
    ...(selectedCity ? [{ level: 'district' as const, label: selectedCity }] : []),
    ...(selectedDistrict ? [{ level: 'operator' as const, label: selectedDistrict }] : []),
    ...(selectedOperator ? [{ level: 'daily' as const, label: selectedOperator.name }] : []),
  ];

  /* ── API 数据获取 ── */
  const fetchProvinceList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/dashboard/region-revenue', {
        params: { level: 'province' },
      }) as any[];
      setProvinceList(Array.isArray(data) ? data : []);
    } catch { setProvinceList([]); }
    finally { setLoading(false); }
  }, []);

  const drillToCity = async (provinceName: string) => {
    setLoading(true);
    try {
      const data = await api.get('/admin/dashboard/region-revenue', {
        params: { level: 'city', province: provinceName },
      }) as any[];
      setCityList(Array.isArray(data) ? data : []);
    } catch {
      setCityList([]);
      message.error('获取城市数据失败');
    } finally { setLoading(false); }
  };

  const drillToDistrict = async (cityName: string) => {
    setLoading(true);
    try {
      const data = await api.get('/admin/dashboard/region-revenue', {
        params: { level: 'district', city: cityName },
      }) as any[];
      setDistrictList(Array.isArray(data) ? data : []);
    } catch {
      setDistrictList([]);
      message.error('获取区县数据失败');
    } finally { setLoading(false); }
  };

  const fetchOperatorList = async (districtName: string) => {
    setLoading(true);
    try {
      const data = await api.get('/admin/dashboard/region-revenue', {
        params: { level: 'operator', district: districtName },
      }) as any[];
      setOperatorList(Array.isArray(data) ? data : []);
    } catch {
      setOperatorList([]);
      message.error('获取运营商列表失败');
    } finally { setLoading(false); }
  };

  const fetchDailyList = async (operatorId: string, start: string, end: string) => {
    setLoading(true);
    try {
      const data = await api.get('/admin/dashboard/region-revenue', {
        params: { level: 'daily', operator_id: operatorId, start_date: start, end_date: end },
      }) as any[];
      setDailyList(Array.isArray(data) ? data : []);
    } catch {
      setDailyList([]);
      message.error('获取每日营收失败');
    } finally { setLoading(false); }
  };

  /* ── 初始加载 ── */
  useEffect(() => {
    fetchProvinceList();
  }, [fetchProvinceList]);

  /* ── 汇总统计 ── */
  const summary = () => {
    if (drillLevel === 'province') return { count: provinceList.length, label: '省份' };
    if (drillLevel === 'city') return { count: cityList.length, label: '城市' };
    if (drillLevel === 'district') return { count: districtList.length, label: '区县' };
    if (drillLevel === 'operator') return { count: operatorList.length, label: '运营商' };
    return { count: 0, label: '' };
  };
  const sum = summary();

  /* ── 返回 ── */
  const goBack = () => {
    if (drillLevel === 'city') {
      setSelectedProvince(null);
      setDrillLevel('province');
    } else if (drillLevel === 'district') {
      if (selectedProvince && ['北京市','天津市','上海市','重庆市'].includes(selectedProvince)) {
        setSelectedCity(null);
        setSelectedProvince(null);
        setDrillLevel('province');
      } else {
        setSelectedCity(null);
        setDrillLevel('city');
      }
    } else if (drillLevel === 'operator') {
      setSelectedDistrict(null);
      setDrillLevel('district');
    } else if (drillLevel === 'daily') {
      setSelectedOperator(null);
      setDrillLevel('operator');
    }
  };

  /* ── 钻取操作 ── */
  const drillProvince = async (name: string) => {
    setSelectedProvince(name);
    setSelectedCity(null);
    setSelectedDistrict(null);
    setSelectedOperator(null);
    setCityList([]);

    if (['北京市', '天津市', '上海市', '重庆市'].includes(name)) {
      setDrillLevel('district');
      await drillToDistrict(name);
    } else {
      setDrillLevel('city');
      await drillToCity(name);
    }
  };

  const drillCity = async (name: string) => {
    setSelectedCity(name);
    setSelectedDistrict(null);
    setSelectedOperator(null);
    setDrillLevel('district');
    await drillToDistrict(name);
  };

  const drillDistrict = async (name: string) => {
    setSelectedDistrict(name);
    setSelectedOperator(null);
    setDrillLevel('operator');
    await fetchOperatorList(name);
  };

  /* ── 表格列 ── */

  const revenueColumns = [
    { title: '今日总营收', dataIndex: 'today_revenue_cents', key: 'today_revenue_cents', width: 120,
      render: (v: number) => <span style={{ color: '#52c41a' }}>¥{(v / 100).toFixed(2)}</span> },
    { title: '本月总营收', dataIndex: 'month_revenue_cents', key: 'month_revenue_cents', width: 120,
      render: (v: number) => <span style={{ color: '#1890ff' }}>¥{(v / 100).toFixed(2)}</span> },
    { title: '上月总营收', dataIndex: 'prev_month_revenue_cents', key: 'prev_month_revenue_cents', width: 120,
      render: (v: number) => <span>¥{(v / 100).toFixed(2)}</span> },
  ];

  const provinceColumns: ColumnsType<RegionItem> = [
    { title: '省份', dataIndex: 'name', key: 'name', width: 160 },
    { title: '运营商数量', dataIndex: 'operator_count', key: 'operator_count', width: 100 },
    ...revenueColumns,
    {
      title: '操作', key: 'action', width: 100,
      render: (_: unknown, record: RegionItem) => (
        <Button type="link" icon={<RightOutlined />} onClick={() => drillProvince(record.name)}>
          查看城市
        </Button>
      ),
    },
  ];

  const cityColumns: ColumnsType<RegionItem> = [
    { title: '城市', dataIndex: 'name', key: 'name', width: 160 },
    { title: '运营商数量', dataIndex: 'operator_count', key: 'operator_count', width: 100 },
    ...revenueColumns,
    {
      title: '操作', key: 'action', width: 100,
      render: (_: unknown, record: RegionItem) => (
        <Button type="link" icon={<RightOutlined />} onClick={() => drillCity(record.name)}>
          查看区县
        </Button>
      ),
    },
  ];

  const districtColumns: ColumnsType<RegionItem> = [
    { title: '区县', dataIndex: 'name', key: 'name', width: 160 },
    { title: '运营商数量', dataIndex: 'operator_count', key: 'operator_count', width: 100 },
    ...revenueColumns,
    {
      title: '操作', key: 'action', width: 100,
      render: (_: unknown, record: RegionItem) => (
        <Button type="link" icon={<RightOutlined />} onClick={() => drillDistrict(record.name)}>
          查看运营商
        </Button>
      ),
    },
  ];

  const operatorColumns: ColumnsType<OperatorItem> = [
    { title: '运营商名称', dataIndex: 'name', key: 'name', width: 200 },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: unknown, record: OperatorItem) => (
        <Button type="link" icon={<RightOutlined />} onClick={() => {
          setSelectedOperator({ id: record.id, name: record.name });
          setDrillLevel('daily');
          fetchDailyList(record.id, dailyRange[0].format('YYYY-MM-DD'), dailyRange[1].format('YYYY-MM-DD'));
        }}>
          查看明细
        </Button>
      ),
    },
  ];

  const dailyColumns: ColumnsType<DailyRevenueItem> = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 150 },
    {
      title: '营收金额', dataIndex: 'revenue_cents', key: 'revenue_cents', width: 150,
      render: (v: number) => <Text strong>¥{(v / 100).toFixed(2)}</Text>,
    },
  ];

  /* ── 当前列表 ── */
  const currentData = () => {
    if (drillLevel === 'province') return { columns: provinceColumns, data: provinceList, rowKey: 'name' };
    if (drillLevel === 'city') return { columns: cityColumns, data: cityList, rowKey: 'name' };
    if (drillLevel === 'district') return { columns: districtColumns, data: districtList, rowKey: 'name' };
    if (drillLevel === 'operator') return { columns: operatorColumns, data: operatorList, rowKey: 'id' };
    return { columns: dailyColumns, data: dailyList, rowKey: 'date' };
  };

  const { columns, data, rowKey } = currentData();

  /* ── Render ── */
  return (
    <div>
      {/* 面包屑 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        {breadcrumb.map((item, idx) => (
          <span key={item.level}>
            {idx > 0 && <Text type="secondary" style={{ margin: '0 4px' }}>/</Text>}
            {idx < breadcrumb.length - 1 ? (
              <Button type="link" size="small" style={{ padding: 0 }}
                onClick={() => {
                  const target = item.level;
                  if (target === 'province') {
                    setSelectedProvince(null); setSelectedCity(null); setSelectedDistrict(null);
                    setSelectedOperator(null); setDrillLevel('province');
                  } else if (target === 'city') {
                    setSelectedCity(null); setSelectedDistrict(null); setSelectedOperator(null);
                    setDrillLevel('city');
                  } else if (target === 'district') {
                    setSelectedDistrict(null); setSelectedOperator(null);
                    setDrillLevel('district');
                  } else if (target === 'operator') {
                    setSelectedOperator(null);
                    setDrillLevel('operator');
                  }
                }}>
                {item.label}
              </Button>
            ) : (
              <Text strong>{item.label}</Text>
            )}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        {drillLevel !== 'province' && (
          <Button size="small" icon={<LeftOutlined />} onClick={goBack}>返回</Button>
        )}
        <Button size="small" icon={<ReloadOutlined />} onClick={() => {
          if (drillLevel === 'province') fetchProvinceList();
          else if (drillLevel === 'city' && selectedProvince) drillToCity(selectedProvince);
          else if (drillLevel === 'district' && selectedCity) drillToDistrict(selectedCity);
          else if (drillLevel === 'operator' && selectedDistrict) fetchOperatorList(selectedDistrict);
        }}>刷新</Button>
      </div>

      {/* 钻取结果 */}
      <Spin spinning={loading}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Card
              title={
                drillLevel === 'province' ? '省份列表' :
                drillLevel === 'city' ? `${selectedProvince} - 城市列表` :
                drillLevel === 'district' ? `${selectedCity} - 区县列表` :
                drillLevel === 'operator' ? `${selectedDistrict} - 运营商列表` :
                `${selectedOperator?.name} - 每日营收`
              }
              size="small"
              extra={drillLevel === 'daily' ? (
                <RangePicker size="small" value={dailyRange} onChange={(dates) => {
                  if (dates?.[0] && dates?.[1] && selectedOperator) {
                    setDailyRange([dates[0], dates[1]]);
                    fetchDailyList(selectedOperator.id, dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'));
                  }
                }} />
              ) : null}
            >
              <Table columns={columns as any} dataSource={data} rowKey={rowKey} pagination={false} size="small" />
              {data.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: 32 }}><Text type="secondary">暂无数据</Text></div>
              )}
            </Card>
          </div>
          <div style={{ width: 240 }}>
            <Card size="small" style={{ marginBottom: 12 }}>
              <Statistic
                title={
                  drillLevel === 'province' ? '覆盖省份' :
                  drillLevel === 'city' ? '覆盖城市' :
                  drillLevel === 'district' ? '覆盖区县' :
                  drillLevel === 'operator' ? '运营商数量' :
                  '区间营收(元)'
                }
                value={drillLevel === 'daily' ? dailyList.reduce((s, r) => s + r.revenue_cents, 0) / 100 : sum.count}
              />
            </Card>
          </div>
        </div>
      </Spin>
    </div>
  );
}
