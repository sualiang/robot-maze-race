import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tabs, Input, Select, Tag, message,
} from 'antd';
import { SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import api from '../../../utils/api';

function formatRaceTime(ms: number | null): string {
  if (ms === null || ms === undefined || ms <= 0) return '-';
  const v = ms < 1000 ? Math.round(ms * 1000) : Math.round(ms);
  const totalSec = Math.floor(v / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs = Math.floor((v % 1000) / 10);
  return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
}

interface PlayerItem {
  id: string;
  nickname: string;
  phone: string;
  gender: 'male' | 'female' | 'unknown';
  age: number;
  venue_name: string;
  operator_name: string;
  race_count: number;
  best_score: number;
  created_at: string;
}

interface OperatorOption {
  id: string;
  name: string;
}

export default function AdminPlayers() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL query 中还原初始状态
  const initialTab = searchParams.get('scope') === 'direct' ? 'direct' : 'operator';
  const initialKeyword = searchParams.get('keyword') || '';
  const initialOperatorId = searchParams.get('operator_id') || '';

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [list, setList] = useState<PlayerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: Number(searchParams.get('page')) || 1,
    pageSize: Number(searchParams.get('pageSize')) || 20,
    total: 0,
  });
  const [keyword, setKeyword] = useState(initialKeyword);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [operatorId, setOperatorId] = useState<string>(initialOperatorId);

  // 获取运营商列表（用于筛选下拉框）
  const fetchOperators = useCallback(async () => {
    try {
      const data: any = await api.get('/admin/operators');
      const opList = data?.list ?? data ?? [];
      setOperators(opList.map((op: { id: string; name: string }) => ({ id: op.id, name: op.name })));
    } catch {
      setOperators([]);
    }
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  // 获取玩家列表
  const fetchList = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const scope = activeTab === 'direct' ? 'direct' : 'operator';
      const params: Record<string, any> = { scope, page, pageSize };
      if (keyword) params.keyword = keyword;
      if (activeTab === 'operator' && operatorId) params.operator_id = operatorId;

      const data: any = await api.get('/admin/players', { params });
      const resultList = data?.list ?? data ?? [];
      setList(resultList);
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: data?.total ?? resultList.length,
      }));
    } catch {
      setList([]);
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: 0,
      }));
    } finally {
      setLoading(false);
    }
  }, [activeTab, keyword, operatorId]);

  // 同步筛选条件到 URL query
  useEffect(() => {
    const params: Record<string, string> = {};
    params.scope = activeTab;
    if (keyword) params.keyword = keyword;
    if (activeTab === 'operator' && operatorId) params.operator_id = operatorId;
    if (pagination.current > 1) params.page = String(pagination.current);
    if (pagination.pageSize !== 20) params.pageSize = String(pagination.pageSize);
    setSearchParams(params, { replace: true });
  }, [activeTab, keyword, operatorId, pagination.current, pagination.pageSize, setSearchParams]);

  useEffect(() => {
    fetchList(pagination.current, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, keyword, operatorId]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleSearch = (value: string) => {
    setKeyword(value);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleExportCsv = async () => {
    try {
      const scope = activeTab === 'direct' ? 'direct' : 'operator';
      const params = new URLSearchParams({ export: 'csv', scope });
      if (keyword) params.set('keyword', keyword);
      if (activeTab === 'operator' && operatorId) params.set('operator_id', operatorId);

      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/v1/admin/players?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `玩家数据-${activeTab === 'direct' ? '总部直属' : '运营商'}-${dayjs().format('YYYYMMDDHHmmss')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      // TODO: 后端导出 CSV 接口未就绪
      message.warning('导出功能暂未就绪（后端接口待实现）');
    }
  };

  const columns: ColumnsType<PlayerItem> = [
    { title: '昵称', dataIndex: 'nickname', key: 'nickname', width: 120 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      title: '性别', dataIndex: 'gender', key: 'gender', width: 60,
      render: (v: string) => {
        if (v === 'male') return <Tag color="blue">男</Tag>;
        if (v === 'female') return <Tag color="pink">女</Tag>;
        return <Tag color="default">未知</Tag>;
      },
    },
    { title: '年龄', dataIndex: 'age', key: 'age', width: 60 },
    { title: '归属赛场', dataIndex: 'venue_name', key: 'venue_name', width: 140, ellipsis: true },
    { title: '归属运营商', dataIndex: 'operator_name', key: 'operator_name', width: 140, ellipsis: true },
    {
      title: '参赛次数', dataIndex: 'race_count', key: 'race_count', width: 90,
      sorter: (a: PlayerItem, b: PlayerItem) => a.race_count - b.race_count,
    },
    {
      title: '最佳成绩', dataIndex: 'best_score', key: 'best_score', width: 90,
      render: (v: number) => (v != null ? formatRaceTime(v) : '-'),
    },
    {
      title: '注册时间', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
      sorter: (a: PlayerItem, b: PlayerItem) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
  ];

  return (
    <Card
      title={<span>玩家管理 <span style={{ fontSize: 13, color: '#999', fontWeight: 'normal' }}>（超级管理员）</span></span>}
      extra={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>导出 CSV</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList(pagination.current, pagination.pageSize)}>刷新</Button>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'operator',
            label: '运营商玩家',
            children: (
              <>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Input.Search
                    placeholder="搜索昵称/手机号"
                    prefix={<SearchOutlined />}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onSearch={handleSearch}
                    style={{ width: 240 }}
                    allowClear
                  />
                  <Select
                    placeholder="选择运营商"
                    allowClear
                    style={{ width: 200 }}
                    value={operatorId || undefined}
                    onChange={(val) => {
                      setOperatorId(val || '');
                      setPagination(prev => ({ ...prev, current: 1 }));
                    }}
                    options={operators.map(op => ({ value: op.id, label: op.name }))}
                  />
                </Space>
                <Table
                  columns={columns}
                  dataSource={list}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 1100 }}
                  pagination={{
                    ...pagination,
                    showSizeChanger: true,
                    showTotal: (t: number) => `共 ${t} 名玩家`,
                    onChange: (page, pageSize) => fetchList(page, pageSize),
                  }}
                />
              </>
            ),
          },
          {
            key: 'direct',
            label: '总部直属玩家',
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Input.Search
                    placeholder="搜索昵称/手机号"
                    prefix={<SearchOutlined />}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onSearch={handleSearch}
                    style={{ width: 240 }}
                    allowClear
                  />
                </Space>
                <Table
                  columns={columns}
                  dataSource={list}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 1100 }}
                  pagination={{
                    ...pagination,
                    showSizeChanger: true,
                    showTotal: (t: number) => `共 ${t} 名玩家`,
                    onChange: (page, pageSize) => fetchList(page, pageSize),
                  }}
                />
              </>
            ),
          },
        ]}
      />
    </Card>
  );
}

