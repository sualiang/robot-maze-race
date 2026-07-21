import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card, Table, Space, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import api from '../../../utils/api';

interface MerchantItem {
  id: string;
  merchantName: string;
  merchantAddress: string;
  contactName: string;
  contactPhone: string;
  status: number;
  coupon_count: number;
  total_verify: number;
  created_at: string;
}

export default function MerchantManage() {
  const { id } = useParams<{ id: string }>();
  const [list, setList] = useState<MerchantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [operatorInfo, setOperatorInfo] = useState<{ name: string } | null>(null);

  const fetchList = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data: any = await api.get(`/admin/merchant?operator_id=${id}`);
      setList(data?.list ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchOperator = useCallback(async () => {
    if (!id) return;
    try {
      const data: any = await api.get(`/admin/operators/${id}`);
      setOperatorInfo(data);
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { fetchList(); fetchOperator(); }, [fetchList, fetchOperator]);

  const columns: ColumnsType<MerchantItem> = [
    { title: '商家名称', dataIndex: 'merchantName', key: 'merchantName', width: 160 },
    { title: '地址', dataIndex: 'merchantAddress', key: 'merchantAddress', width: 200, ellipsis: true },
    { title: '联系人', dataIndex: 'contactName', key: 'contactName', width: 100 },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 120 },
    {
      title: '优惠券数量', dataIndex: 'coupon_count', key: 'coupon_count', width: 100,
      sorter: (a: MerchantItem, b: MerchantItem) => (a.coupon_count || 0) - (b.coupon_count || 0),
    },
    {
      title: '累计核销', dataIndex: 'total_verify', key: 'total_verify', width: 100,
      sorter: (a: MerchantItem, b: MerchantItem) => (a.total_verify || 0) - (b.total_verify || 0),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: number) => (
        <Badge status={s === 1 ? 'success' : 'error'} text={s === 1 ? '启用' : '禁用'} />
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 160 },
  ];

  return (
    <Card
      title={operatorInfo ? `商家概况 — ${operatorInfo.name}` : '商家概况'}
      extra={<a onClick={fetchList}><ReloadOutlined /> 刷新</a>}
    >
      <Table
        dataSource={list}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 家商家` }}
        scroll={{ x: 1000 }}
      />
    </Card>
  );
}
