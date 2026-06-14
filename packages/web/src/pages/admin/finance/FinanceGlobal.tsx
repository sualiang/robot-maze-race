import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, message, Popconfirm, Modal,
  DatePicker, Typography, Tabs,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckOutlined, CloseOutlined, DownloadOutlined, HistoryOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../../utils/api';

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface WithdrawItem {
  id: string;
  operator_id: string;
  operator_name: string;
  amount: number;
  bank_account: string;
  bank_name: string;
  status: string;
  applied_at: string;
  processed_at?: string;
  remark?: string;
}

export default function FinanceGlobal() {
  // 从 localStorage 获取当前用户角色
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const roleName: string = adminUser.admin_role_name || '';
  const permissions: string[] = adminUser.permissions || [];
  const canApprove = permissions.includes('*') || permissions.includes('finance:withdraw') || roleName === 'super_admin';

  const [yesterdayWithdraws, setYesterdayWithdraws] = useState<WithdrawItem[]>([]);
  const [historyWithdraws, setHistoryWithdraws] = useState<WithdrawItem[]>([]);
  const [loadingYesterday, setLoadingYesterday] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyDateRange, setHistoryDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const fetchYesterdayWithdraws = useCallback(async () => {
    setLoadingYesterday(true);
    try {
      const res: any = await api.get('/admin/finance/withdraws', {
        params: {
          start_date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
          end_date: dayjs().format('YYYY-MM-DD'),
        },
      });
      setYesterdayWithdraws(res?.list ?? res ?? []);
    } catch {
      setYesterdayWithdraws([]);
    } finally {
      setLoadingYesterday(false);
    }
  }, []);

  const fetchHistoryWithdraws = useCallback(async (start: string, end: string) => {
    setLoadingHistory(true);
    try {
      const res: any = await api.get('/admin/finance/withdraws', {
        params: { start_date: start, end_date: end },
      });
      setHistoryWithdraws(res?.list ?? res ?? []);
    } catch {
      setHistoryWithdraws([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchYesterdayWithdraws();
    fetchHistoryWithdraws(
      historyDateRange[0].format('YYYY-MM-DD'),
      historyDateRange[1].format('YYYY-MM-DD'),
    );
  }, [fetchYesterdayWithdraws, fetchHistoryWithdraws, historyDateRange]);

  const handleApproveWithdraw = async (id: string) => {
    try {
      await api.post(`/admin/finance/withdraws/${id}/approve`);
      message.success('已批准提现');
      fetchYesterdayWithdraws();
      fetchHistoryWithdraws(
        historyDateRange[0].format('YYYY-MM-DD'),
        historyDateRange[1].format('YYYY-MM-DD'),
      );
    } catch {
      message.error('操作失败');
    }
  };

  const handleRejectWithdraw = (id: string) => {
    Modal.confirm({
      title: '拒绝提现',
      content: '请输入拒绝原因：',
      onOk: async () => {
        try {
          await api.post(`/admin/finance/withdraws/${id}/reject`);
          message.success('已拒绝提现');
          fetchYesterdayWithdraws();
          fetchHistoryWithdraws(
            historyDateRange[0].format('YYYY-MM-DD'),
            historyDateRange[1].format('YYYY-MM-DD'),
          );
        } catch {
          message.error('操作失败');
        }
      },
    });
  };

  const handleExport = async () => {
    try {
      const resp: any = await api.get('/admin/finance/export', {
        params: {
          format: 'csv',
          start_date: historyDateRange[0].format('YYYY-MM-DD'),
          end_date: historyDateRange[1].format('YYYY-MM-DD'),
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([resp]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `withdraw-history-${dayjs().format('YYYY-MM-DD')}.csv`;
      a.click();
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  };

  const withdrawColumns: ColumnsType<WithdrawItem> = [
    { title: '运营商名称', dataIndex: 'operator_name', key: 'operator_name', width: 130 },
    {
      title: '提现金额', dataIndex: 'amount', key: 'amount', width: 120,
      render: (v: number) => <Text strong>¥{(v / 100).toFixed(2)}</Text>,
    },
    { title: '开户行', dataIndex: 'bank_name', key: 'bank_name', width: 120 },
    { title: '银行账号', dataIndex: 'bank_account', key: 'bank_account', width: 180 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => {
        const labels: Record<string, string> = {
          pending: '待审核', approved: '已通过', rejected: '已拒绝', processed: '已打款',
        };
        const colors: Record<string, string> = {
          pending: 'orange', approved: 'blue', rejected: 'red', processed: 'green',
        };
        return <Tag color={colors[s]}>{labels[s] || s}</Tag>;
      },
    },
    {
      title: '申请时间', dataIndex: 'applied_at', key: 'applied_at', width: 160,
      render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作', key: 'action', width: 140, fixed: 'right',
      render: (_: unknown, record: WithdrawItem) => (
        <Space size="small">
          {record.status === 'pending' && canApprove && (
            <>
              <Popconfirm
                title="确认批准此提现?"
                onConfirm={() => handleApproveWithdraw(record.id)}
              >
                <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>
                  通过
                </Button>
              </Popconfirm>
              <Button
                type="link" size="small" danger icon={<CloseOutlined />}
                onClick={() => handleRejectWithdraw(record.id)}
              >
                拒绝
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const [activeTab, setActiveTab] = useState('pending');

  const tabItems = [
    {
      key: 'pending',
      label: '昨日提现申请',
      children: (
        <Card
          title={<Space><HistoryOutlined /> 昨日提现申请</Space>}
          extra={
            <Text type="secondary">
              共 {yesterdayWithdraws.length} 条提现申请
            </Text>
          }
        >
          <Table
            columns={withdrawColumns}
            dataSource={yesterdayWithdraws}
            rowKey="id"
            loading={loadingYesterday}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
            size="small"
          />
        </Card>
      ),
    },
    {
      key: 'history',
      label: '历史提现数据',
      children: (
        <Card
          title={<Space><HistoryOutlined /> 历史提现数据</Space>}
          extra={
            <Space>
              <RangePicker
                size="small"
                value={historyDateRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setHistoryDateRange([dates[0], dates[1]]);
                    fetchHistoryWithdraws(
                      dates[0].format('YYYY-MM-DD'),
                      dates[1].format('YYYY-MM-DD'),
                    );
                  }
                }}
              />
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>
                导出报表
              </Button>
            </Space>
          }
        >
          <Table
            columns={withdrawColumns}
            dataSource={historyWithdraws}
            rowKey="id"
            loading={loadingHistory}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条提现记录` }}
            size="small"
          />
        </Card>
      ),
    },
  ];

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}
