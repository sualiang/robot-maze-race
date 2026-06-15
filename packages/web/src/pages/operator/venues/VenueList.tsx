import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Tabs, message, Popconfirm, QRCode, Cascader } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, QrcodeOutlined, DownloadOutlined, ReloadOutlined, StopOutlined, PlayCircleOutlined, UserSwitchOutlined, MonitorOutlined } from '@ant-design/icons';
import { VenueStatus } from '@robot-race/shared';
import api from '../../../utils/api';
import { CITY_OPTIONS, getDistrictOptions } from '../../../utils/venueData';


// 省市区数据用Cascader
interface RegionOption {
  value: string;
  label: string;
  children?: RegionOption[];
}

interface VenueItem {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  province: string;
  status: VenueStatus;
  open_time: string;
  close_time: string;
  max_capacity: number;
  description?: string;
  today_races?: number;
  referee_count?: number;
  referees?: { id: string; name: string }[];
  created_at: string;
  updated_at: string;
}

interface RefereeOption {
  id: string;
  name: string;
  phone: string;
}

const statusLabels: Record<VenueStatus, string> = {
  [VenueStatus.OPEN]: '运营中',
  [VenueStatus.CLOSED]: '已关闭',
  [VenueStatus.MAINTENANCE]: '维护中',
};

const statusColors: Record<VenueStatus, string> = {
  [VenueStatus.OPEN]: 'green',
  [VenueStatus.CLOSED]: 'red',
  [VenueStatus.MAINTENANCE]: 'orange',
};

/* ── 赛场管理 Tab ── */
// 从 localStorage 获取当前用户角色
const operatorUserInfo = (() => {
  try {
    return JSON.parse(localStorage.getItem('operator_user_info') || '{}');
  } catch { return {}; }
})();
const operatorRoleName: string = operatorUserInfo.role_name || '';
const operatorRoleId: string = operatorUserInfo.role_id || '';
// 运营商超管（op_super_admin）→ 可删除
const isOperatorManager = operatorRoleId === 'op_super_admin';

function VenueTab() {
  const [list, setList] = useState<VenueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalMaxQueueSize, setGlobalMaxQueueSize] = useState(50);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrVenue, setQrVenue] = useState<VenueItem | null>(null);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [form] = Form.useForm();

  // 绑定裁判员
  const [bindRefereeModalOpen, setBindRefereeModalOpen] = useState(false);
  const [bindVenueId, setBindVenueId] = useState<string | null>(null);
  const [bindVenueName, setBindVenueName] = useState('');
  const [refereeList, setRefereeList] = useState<RefereeOption[]>([]);
  const [selectedRefereeIds, setSelectedRefereeIds] = useState<string[]>([]);

  // 加载地区数据（Cascader用）
  useEffect(() => {
    fetch('/api/v1/operator/regions')
      .then(r => r.json())
      .then(json => {
        if (json.code === 0 && json.data) {
          const convert = (items: any[]): RegionOption[] =>
            items.map((item: any) => ({
              value: item.name,
              label: item.name,
              children: item.children ? convert(item.children) : undefined,
            }));
          setRegionOptions(convert(json.data));
        }
      })
      .catch(() => {});
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/venues');
      const rawList = data?.list ?? data ?? [];
      // 为每个赛场加载绑定的裁判员列表
      const enriched = await Promise.all(rawList.map(async (v: any) => {
        try {
          const refs: any = await api.get(`/venues/${v.id}/referees`);
          return { ...v, referees: refs ?? [] };
        } catch {
          return { ...v, referees: [] };
        }
      }));
      setList(enriched);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    // 异步获取全局排队上限
    api.get('/operator/settings').then((res: any) => {
      const q = res?.max_queue_size ?? 50;
      setGlobalMaxQueueSize(q);
      form.setFieldsValue({
        max_capacity: q,
        status: VenueStatus.OPEN,
        open_time: '09:00',
        close_time: '21:00',
      });
    }).catch(() => {
      form.setFieldsValue({
        max_capacity: 50,
        status: VenueStatus.OPEN,
        open_time: '09:00',
        close_time: '21:00',
      });
    });
    setModalOpen(true);
  };

  const handleEdit = (record: VenueItem) => {
    setEditingId(record.id);
    const formValues: any = { ...record };
    // 后端字段名 max_queue_size 映射为前端 max_capacity
    if (formValues.max_queue_size !== undefined && formValues.max_capacity === undefined) {
      formValues.max_capacity = formValues.max_queue_size;
    }
    if (record.province || record.city || record.district) {
      formValues.province_path = [record.province, record.city, record.district].filter(Boolean);
    }
    form.setFieldsValue(formValues);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    // 从 Cascader 拆出省市区
    const provPath = values.province_path || [];
    const payload = {
      ...values,
      province: provPath[0] || '',
      city: provPath[1] || '',
      district: provPath[2] || '',
    };
    delete payload.province_path;
    try {
      if (editingId) {
        await api.put(`/venues/${editingId}`, payload);
        message.success('更新成功');
      } else {
        await api.post('/venues', payload);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleStatusChange = async (id: string, status: VenueStatus) => {
    try {
      await api.patch(`/venues/${id}/status`, { status });
      message.success('状态已更新');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/venues/${id}`);
      message.success('已删除');
      fetchList();
    } catch {
      message.error('删除失败');
    }
  };

  // 绑定裁判员
  const handleBindReferee = async (record: VenueItem) => {
    setBindVenueId(record.id);
    setBindVenueName(record.name);
    // 加载所有可用裁判员
    try {
      const data: any = await api.get('/referees');
      const refs: RefereeOption[] = data?.list ?? data ?? [];
      setRefereeList(refs);
      setSelectedRefereeIds((record.referees || []).map(r => r.id));
    } catch {
      setRefereeList([]);
    }
    setBindRefereeModalOpen(true);
  };

  const handleSaveBindReferee = async () => {
    if (!bindVenueId) return;
    try {
      await api.put(`/venues/${bindVenueId}/referees`, { referee_ids: selectedRefereeIds });
      message.success('裁判绑定成功');
      setBindRefereeModalOpen(false);
      fetchList();
    } catch {
      message.error('绑定失败');
    }
  };

  const handleShowQR = (record: VenueItem) => {
    setQrVenue(record);
    setQrModalOpen(true);
  };

  const handleScreenUrl = (record: VenueItem) => {
    const url = `http://175.24.200.63/screen/display?venueId=${record.id}`;
    const modal = Modal.info({
      title: '现场大屏网址',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>赛场「{record.name}」的大屏地址：</p>
          <div style={{
            background: '#f5f5f5',
            padding: '8px 12px',
            borderRadius: 6,
            wordBreak: 'break-all',
            fontSize: 13,
            marginBottom: 12,
          }}>{url}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="primary"
              onClick={() => {
                navigator.clipboard.writeText(url).then(() => {
                  message.success('链接已复制');
                  modal.destroy();
                });
              }}
            >
              复制链接
            </Button>
            <Button onClick={() => window.open(url, '_blank')}>
              打开大屏
            </Button>
          </div>
        </div>
      ),
      okText: '关闭',
      onOk: () => modal.destroy(),
    });
  };

  const downloadQR = () => {
    const canvas = document.querySelector('.qr-canvas canvas') as HTMLCanvasElement;
    if (canvas && qrVenue) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `venue-${qrVenue.name}-qr.png`;
      a.click();
      message.success('二维码已下载');
    }
  };

  const columns: ColumnsType<VenueItem> = [
    { title: '赛场名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '所在省市', key: 'region', width: 120,
      render: (_: unknown, r: VenueItem) => r.city ? `${r.city} ${r.district || ''}` : '-',
    },
    {
      title: '地址', dataIndex: 'address', key: 'address', ellipsis: true,
      render: (v: string) => <span title={v}>{v}</span>,
    },
    {
      title: '营业时间', key: 'hours', width: 140,
      render: (_: unknown, r: VenueItem) => `${r.open_time} - ${r.close_time}`,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: VenueStatus) => <Tag color={statusColors[s]}>{statusLabels[s]}</Tag>,
    },
    { title: '今日参赛', dataIndex: 'today_races', key: 'today_races', width: 80 },
    {
      title: '操作', key: 'action', width: 380, fixed: 'right',
      render: (_: unknown, record: VenueItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<MonitorOutlined />} onClick={() => handleScreenUrl(record)}>
            现场大屏
          </Button>
          <Button type="link" size="small" icon={<UserSwitchOutlined />} onClick={() => handleBindReferee(record)}>
            绑定裁判员
          </Button>
          <Button type="link" size="small" icon={<QrcodeOutlined />} onClick={() => handleShowQR(record)}>
            二维码
          </Button>
          {record.status === VenueStatus.OPEN ? (
            <Popconfirm title="确定关闭此赛场？" onConfirm={() => handleStatusChange(record.id, VenueStatus.CLOSED)}>
              <Button type="link" size="small" danger icon={<StopOutlined />}>关闭</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="确定开启此赛场？" onConfirm={() => handleStatusChange(record.id, VenueStatus.OPEN)}>
              <Button type="link" size="small" icon={<PlayCircleOutlined />} style={{ color: '#52c41a' }}>开启</Button>
            </Popconfirm>
          )}
          {isOperatorManager && (
            <Popconfirm title="确定删除此赛场？此操作不可恢复" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="赛场管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建赛场</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 个赛场` }}
        />
      </Card>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingId ? '编辑赛场' : '新建赛场'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="赛场名称" rules={[{ required: true, message: '请输入赛场名称' }]}>
            <Input placeholder="例如：北京朝阳大悦城赛场" maxLength={50} />
          </Form.Item>
          <Form.Item name="province_path" label="省/市/区" rules={[{ required: true, message: '请选择省市区' }]}>
            <Cascader
              placeholder="请选择省/市/区"
              style={{ width: 360 }}
              options={regionOptions}
              showSearch
            />
          </Form.Item>
          <Form.Item name="address" label="详细地址" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="详细地址" />
          </Form.Item>

          <Space size={16}>
            <Form.Item name="open_time" label="营业开始" rules={[{ required: true }]}>
              <Input type="time" />
            </Form.Item>
            <Form.Item name="close_time" label="营业结束" rules={[{ required: true }]}>
              <Input type="time" />
            </Form.Item>
            <Form.Item name="max_capacity" label="排队上限" rules={[{ required: true }]}>
              <InputNumber min={1} max={200} style={{ width: 120 }} disabled />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: VenueStatus.OPEN, label: '运营中' },
                { value: VenueStatus.CLOSED, label: '已关闭' },
                { value: VenueStatus.MAINTENANCE, label: '维护中' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="赛场描述（选填）" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 二维码弹窗 */}
      <Modal
        title={qrVenue ? `赛场二维码 - ${qrVenue.name}` : '赛场二维码'}
        open={qrModalOpen}
        onCancel={() => setQrModalOpen(false)}
        footer={
          <Button type="primary" icon={<DownloadOutlined />} onClick={downloadQR}>
            下载二维码
          </Button>
        }
        width={400}
      >
        {qrVenue && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div className="qr-canvas">
              <QRCode
                value={`robotmaze://venue/${qrVenue.id}`}
                size={200}
                bordered={false}
              />
            </div>
            <p style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
              赛场ID: {qrVenue.id}<br />
              扫描二维码可进入此赛场
            </p>
          </div>
        )}
      </Modal>

      {/* 绑定裁判员弹窗 */}
      <Modal
        title={`绑定裁判员 - ${bindVenueName}`}
        open={bindRefereeModalOpen}
        onOk={handleSaveBindReferee}
        onCancel={() => setBindRefereeModalOpen(false)}
        width={500}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          选择要绑定到此赛场的裁判员（可多选），已选裁判员会在列表中高亮。
        </p>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="搜索并选择裁判员"
          value={selectedRefereeIds}
          onChange={(vals: string[]) => setSelectedRefereeIds(vals)}
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
          }
          options={refereeList.map(r => ({
            value: r.id,
            label: `${r.name}（${r.phone || '无电话'}）`,
          }))}
        />
      </Modal>
    </>
  );
}

/* ── 主组件（Tabs 切换） ── */
export default function VenueList() {
  const tabItems = [
    {
      key: 'venues',
      label: '赛场列表',
      children: <VenueTab />,
    },
  ];

  return (
    <Tabs items={tabItems} />
  );
}
