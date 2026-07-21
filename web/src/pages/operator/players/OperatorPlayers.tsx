import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Input, Tag, message,
} from 'antd';
import { SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import api from '../../../utils/api';

interface PlayerItem {
  id: string;
  nickname: string;
  phone: string;
  gender: 'male' | 'female' | 'unknown';
  age: number;
  venue_name: string;
  race_count: number;
  best_score: number;
  created_at: string;
}

export default function OperatorPlayers() {
  const [list, setList] = useState<PlayerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [keyword, setKeyword] = useState('');

  const fetchList = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, pageSize };
      if (keyword) params.keyword = keyword;

      const data: any = await api.get('/operator/players', { params });
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
  }, [keyword]);

  useEffect(() => {
    fetchList(pagination.current, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  const handleSearch = (value: string) => {
    setKeyword(value);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams({ export: 'csv' });
      if (keyword) params.set('keyword', keyword);

      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/v1/operator/players?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `玩家数据-${dayjs().format('YYYYMMDDHHmmss')}.csv`;
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
    { title: '参与赛场', dataIndex: 'venue_name', key: 'venue_name', width: 140, ellipsis: true },
    {
      title: '参赛次数', dataIndex: 'race_count', key: 'race_count', width: 90,
      sorter: (a: PlayerItem, b: PlayerItem) => a.race_count - b.race_count,
    },
    {
      title: '最佳成绩', dataIndex: 'best_score', key: 'best_score', width: 90,
      render: (v: number) => (v != null ? `${v}s` : '-'),
    },
    {
      title: '注册时间', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
      sorter: (a: PlayerItem, b: PlayerItem) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
  ];

  return (
    <Card
      title="玩家管理"
      extra={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>导出 CSV</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList(pagination.current, pagination.pageSize)}>刷新</Button>
        </Space>
      }
    >
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
        scroll={{ x: 1000 }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 名玩家`,
          onChange: (page, pageSize) => fetchList(page, pageSize),
        }}
      />
    </Card>
  );
}


