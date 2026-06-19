import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Select, Popconfirm,
  message, Input, Descriptions, Badge, Form,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, EyeOutlined, KeyOutlined, ReloadOutlined,
  SwapOutlined, SearchOutlined, PlusOutlined, CopyOutlined,
} from '@ant-design/icons';
import AccountInfoModal from '../../../components/AccountInfoModal';
import type { ColumnsType } from 'antd/es/table';

import api from '../../../utils/api';

interface RefereeItem {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  avatar_url: string;
  venue_name: string;
  venue_id: string;
  status?: string;
  cert_image_url?: string;
  check_in_at?: string;
  check_out_at?: string;
  total_hours?: number;
  last_active_at?: string;
  created_at: string;
}

interface VenueOption {
  id: string;
  name: string;
}

// 从 localStorage 获取当前用户角色
const operatorUserInfo = (() => {
  try {
    return JSON.parse(localStorage.getItem('operator_user_info') || '{}');
  } catch { return {}; }
})();
const operatorRoleName: string = operatorUserInfo.role_name || '';
const operatorRoleId: string = operatorUserInfo.role_id || '';
const operatorPermissions: string[] = operatorUserInfo.permissions || [];
// 运营商超管（op_super_admin）或拥有 '*' 权限 → 可删除
const isOperatorManager = operatorRoleId === 'op_super_admin' || operatorPermissions.includes('*');

export default function RefereeList() {
  const [list, setList] = useState<RefereeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReferee, setDetailReferee] = useState<RefereeItem | null>(null);
  const [bindVenueOpen, setBindVenueOpen] = useState(false);
  const [bindTarget, setBindTarget] = useState<RefereeItem | null>(null);
  const [bindVenueId, setBindVenueId] = useState<string>('');
  const [createdResult, setCreatedResult] = useState<any>(null);
  const [searchName, setSearchName] = useState('');

  // 新建裁判弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', phone: '', venue_id: '' });
  const [creating, setCreating] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ account: string; password: string } | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/referees', { params: { name: searchName || undefined } });
      setList(data?.list ?? data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [searchName]);

  const fetchVenues = useCallback(async () => {
    try {
      const data: any = await api.get('/venues', { params: { pageSize: 1000 } });
      const vlist = data?.list ?? data ?? [];
      setVenues(vlist.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); fetchVenues(); }, [fetchList, fetchVenues]);

  const handleCreate = async () => {
    if (!createForm.name || !createForm.phone) {
      message.warning('请填写裁判姓名和手机号');
      return;
    }
    setCreating(true);
    try {
      const res: any = await api.post('/referees/create-by-operator', {
        name: createForm.name,
        phone: createForm.phone,
        venue_id: createForm.venue_id || undefined,
      });
      setCreateOpen(false);
      setAccountInfo({ account: res.phone, password: res.init_password });
      message.success(`裁判 ${res.name} 创建成功`);
      setCreateForm({ name: '', phone: '', venue_id: '' });
      fetchList();
    } catch (e: any) {
      message.error(e.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyPassword = () => {
    if (accountInfo) {
      navigator.clipboard.writeText(`手机号: ${accountInfo.account}\n初始密码: ${accountInfo.password}`);
      message.success('已复制账号信息');
    }
  };

  const handleBindVenue = (record: RefereeItem) => {
    setBindTarget(record);
    setBindVenueId(record.venue_id || '');
    setBindVenueOpen(true);
  };

  const handleBindVenueConfirm = async () => {
    if (!bindTarget || !bindVenueId) {
      message.warning('请选择赛场');
      return;
    }
    try {
      await api.patch(`/referees/${bindTarget.id}`, { venue_id: bindVenueId });
      message.success('绑定成功');
      setBindVenueOpen(false);
      fetchList();
    } catch { message.error('绑定失败'); }
  };

  const handleToggleStatus = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/referees/${id}/status`, { status: newStatus });
      message.success(newStatus === 'disabled' ? '已禁用' : '已启用');
      fetchList();
    } catch { message.error('操作失败'); }
  };

  const handleDeleteReferee = async (id: string) => {
    try {
      await api.delete(`/referees/${id}`);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  const handleResetPassword = async (record: RefereeItem) => {
    try {
      const res: any = await api.post(`/referees/${record.id}/reset-password`);
      setAccountInfo({ account: res.phone || record.phone, password: res.init_password });
      fetchList();
    } catch { message.error('重置密码失败'); }
  };

  const handleViewDetail = (record: RefereeItem) => {
    setDetailReferee(record);
    setDetailOpen(true);
  };

  const columns: ColumnsType<RefereeItem> = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      title: '绑定赛场', dataIndex: 'venue_name', key: 'venue_name', width: 150,
      render: (v: string) => v || <Tag color="default">未绑定</Tag>,
    },
    {
      title: '今日考勤', key: 'attendance', width: 120,
      render: (_: unknown, r: RefereeItem) => {
        if (r.check_in_at && !r.check_out_at) {
          return <Badge status="processing" text="在岗" />;
        }
        if (r.check_in_at && r.check_out_at) {
          return <Badge status="default" text="已签退" />;
        }
        return <Badge status="default" text="未签到" />;
      },
    },
    {
      title: '最近活跃', dataIndex: 'last_active_at', key: 'last_active_at', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right',
      render: (_: unknown, record: RefereeItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => handleBindVenue(record)}>
            绑定赛场
          </Button>
          <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => handleResetPassword(record)}>
            重置密码
          </Button>
          {record.status === 'disabled' ? (
            <Popconfirm title="确认启用该裁判？" onConfirm={() => handleToggleStatus(record.id, 'active')}>
              <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>启用</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="禁用后裁判无法登录，确定禁用？" onConfirm={() => handleToggleStatus(record.id, 'disabled')}>
              <Button type="link" size="small" danger>禁用</Button>
            </Popconfirm>
          )}
          {isOperatorManager && (
            <Popconfirm title="确定删除该裁判？此操作不可恢复！" onConfirm={() => handleDeleteReferee(record.id)}>
              <Button type="link" size="small" icon={<CloseOutlined />} danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="裁判管理"
        extra={
          <Space>
            <Input
              placeholder="搜索裁判姓名"
              prefix={<SearchOutlined />}
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onPressEnter={() => fetchList()}
              style={{ width: 200 }}
              allowClear
            />

            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); setCreatedResult(null); }}>
              新建裁判
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 名裁判` }}
        />
      </Card>

      {/* 新建裁判弹窗 */}
      <Modal
        title="新建裁判"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); }}
        footer={
          <Space>
            <Button onClick={() => { setCreateOpen(false); }}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleCreate}>
              创建裁判
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Form.Item label="说明">
            <span style={{ color: '#888', fontSize: 13 }}>创建后系统将自动生成随机密码，裁判首次登录时可设置用户名和修改密码</span>
          </Form.Item>
          <div>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>裁判姓名 *</label>
            <Input
              placeholder="请输入裁判姓名"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>登录账号 *</label>
            <Input
              placeholder="请用手机号码注册"
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>绑定赛场（可选）</label>
            <Select
              showSearch
              placeholder="选择赛场"
              style={{ width: '100%' }}
              value={createForm.venue_id || undefined}
              onChange={(v) => setCreateForm({ ...createForm, venue_id: v })}
              options={venues.map((v) => ({ value: v.id, label: v.name }))}
              filterOption={(input, option) =>
                (option?.label as string)?.includes(input) ?? false
              }
              allowClear
            />
          </div>
        </Space>
      </Modal>

      {/* 裁判详情弹窗 */}
      <Modal
        title="裁判详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={560}
      >
        {detailReferee && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="姓名">{detailReferee.name}</Descriptions.Item>
            <Descriptions.Item label="手机号">{detailReferee.phone}</Descriptions.Item>
            <Descriptions.Item label="绑定赛场" span={2}>
              {detailReferee.venue_name || '未绑定'}
            </Descriptions.Item>
            <Descriptions.Item label="总工时(h)">{detailReferee.total_hours ?? 0}</Descriptions.Item>
            <Descriptions.Item label="签到时间" span={2}>
              {detailReferee.check_in_at ? new Date(detailReferee.check_in_at).toLocaleString('zh-CN') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="签退时间" span={2}>
              {detailReferee.check_out_at ? new Date(detailReferee.check_out_at).toLocaleString('zh-CN') : '在岗'}
            </Descriptions.Item>
            <Descriptions.Item label="最近活跃" span={2}>
              {detailReferee.last_active_at ? new Date(detailReferee.last_active_at).toLocaleString('zh-CN') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="注册时间" span={2}>
              {new Date(detailReferee.created_at).toLocaleString('zh-CN')}
            </Descriptions.Item>
            {detailReferee.cert_image_url && (
              <Descriptions.Item label="认证照片" span={2}>
                <img
                  src={detailReferee.cert_image_url}
                  alt="认证照片"
                  style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }}
                />
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* 绑定赛场弹窗 */}
      <Modal
        title={bindTarget ? `绑定赛场 - ${bindTarget.name}` : '绑定赛场'}
        open={bindVenueOpen}
        onOk={handleBindVenueConfirm}
        onCancel={() => setBindVenueOpen(false)}
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 12, color: '#666' }}>
            为裁判选择绑定的赛场，绑定后可进行签到考勤。
          </p>
          <Select
            showSearch
            placeholder="选择赛场"
            style={{ width: '100%' }}
            value={bindVenueId || undefined}
            onChange={(v) => setBindVenueId(v)}
            options={venues.map((v) => ({ value: v.id, label: v.name }))}
            filterOption={(input, option) =>
              (option?.label as string)?.includes(input) ?? false
            }
          />
        </div>
      </Modal>

      <AccountInfoModal
        open={!!accountInfo}
        account={accountInfo?.account || ''}
        password={accountInfo?.password || ''}
        role="referee"
        onClose={() => setAccountInfo(null)}
      />
    </>
  );
}
