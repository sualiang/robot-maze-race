import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Select, Popconfirm, Input,
  message, Descriptions, Badge,
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
  apply_remark?: string;
  review_remark?: string;
  reviewed_at?: string;
  operator_id?: string;
}

interface InviteItem {
  id: string;
  operator_id: string;
  phone: string | null;
  venue_id: string | null;
  token: string;
  note: string | null;
  status: string;
  openid: string | null;
  expires_at: string;
  created_at: string;
  invite_url: string;
}

interface VenueOption {
  id: string;
  name: string;
}

// 从 localStorage 获取当前用户角色
const operatorUserInfo = (() => {
  try { return JSON.parse(localStorage.getItem('operator_user_info') || '{}'); } catch { return {}; }
})();
const operatorRoleId: string = operatorUserInfo.role_id || '';
const operatorPermissions: string[] = operatorUserInfo.permissions || [];
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
  const [searchName, setSearchName] = useState('');

  // 邀请裁判 — 直接生成（不弹窗）
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ token: string; invite_url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ account: string; password: string } | null>(null);

  // 邀请记录
  const [inviteList, setInviteList] = useState<InviteItem[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/referees', { params: { name: searchName || undefined } });
      setList(data?.list ?? data ?? []);
    } catch { setList([]); } finally { setLoading(false); }
  }, [searchName]);

  const fetchInviteList = useCallback(async () => {
    setInviteLoading(true);
    try {
      const data: any = await api.get('/referee/invitations', { params: { pageSize: 50 } });
      setInviteList(data?.list ?? []);
    } catch { setInviteList([]); } finally { setInviteLoading(false); }
  }, []);

  const fetchVenues = useCallback(async () => {
    try {
      const data: any = await api.get('/venues', { params: { pageSize: 1000 } });
      const vlist = data?.list ?? data ?? [];
      setVenues(vlist.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); fetchVenues(); fetchInviteList(); }, [fetchList, fetchVenues, fetchInviteList]);

  const handleGenerateInvite = async () => {
    setInviteGenerating(true);
    try {
      const data: any = await api.post('/referee/invite', {});
      setInviteResult(data);
      message.success('邀请生成成功');
      fetchInviteList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '生成邀请失败');
    } finally { setInviteGenerating(false); }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); message.success('邀请链接已复制');
      setTimeout(() => setCopied(false), 3000);
    } catch { message.error('复制失败，请手动复制'); }
  };

  const handleBindVenue = (record: RefereeItem) => { setBindTarget(record); setBindVenueId(record.venue_id || ''); setBindVenueOpen(true); };

  const handleBindVenueConfirm = async () => {
    if (!bindTarget || !bindVenueId) { message.warning('请选择赛场'); return; }
    try { await api.patch(`/referees/${bindTarget.id}`, { venue_id: bindVenueId }); message.success('绑定成功'); setBindVenueOpen(false); fetchList(); } catch { message.error('绑定失败'); }
  };

  const handleToggleStatus = async (id: string, newStatus: string) => {
    try { await api.patch(`/referees/${id}/status`, { status: newStatus }); message.success(newStatus === 'disabled' ? '已禁用' : '已启用'); fetchList(); } catch { message.error('操作失败'); }
  };

  const handleDeleteReferee = async (id: string) => {
    try { await api.delete(`/referees/${id}`); message.success('已删除'); fetchList(); } catch { message.error('删除失败'); }
  };

  const handleResetPassword = async (record: RefereeItem) => {
    try {
      const res: any = await api.post(`/referees/${record.id}/reset-password`);
      setAccountInfo({ account: res.phone || record.phone, password: res.init_password });
      fetchList();
    } catch { message.error('重置密码失败'); }
  };

  const handleViewDetail = (record: RefereeItem) => { setDetailReferee(record); setDetailOpen(true); };

  const columns: ColumnsType<RefereeItem> = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130 },
    { title: '绑定赛场', dataIndex: 'venue_name', key: 'venue_name', width: 150, render: (v: string) => v || <Tag color="default">未绑定</Tag> },
    { title: '今日考勤', key: 'attendance', width: 120, render: (_: unknown, r: RefereeItem) => {
      if (r.check_in_at && !r.check_out_at) return <Badge status="processing" text="在岗" />;
      if (r.check_in_at && r.check_out_at) return <Badge status="default" text="已签退" />;
      return <Badge status="default" text="未签到" />;
    }},
    { title: '最近活跃', dataIndex: 'last_active_at', key: 'last_active_at', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { title: '操作', key: 'action', width: 240, fixed: 'right' as const, render: (_: unknown, record: RefereeItem) => (
      <Space size="small" wrap>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>详情</Button>
        <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => handleBindVenue(record)}>绑定赛场</Button>
        <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => handleResetPassword(record)}>重置密码</Button>
        {record.status === 'disabled' ? (
          <Popconfirm title="确认启用该裁判？" onConfirm={() => handleToggleStatus(record.id, 'active')}><Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>启用</Button></Popconfirm>
        ) : (
          <Popconfirm title="禁用后裁判无法登录，确定禁用？" onConfirm={() => handleToggleStatus(record.id, 'disabled')}><Button type="link" size="small" danger>禁用</Button></Popconfirm>
        )}
        {isOperatorManager && (
          <Popconfirm title="确定删除该裁判？" onConfirm={() => handleDeleteReferee(record.id)}><Button type="link" size="small" icon={<CloseOutlined />} danger>删除</Button></Popconfirm>
        )}
      </Space>
    )},
  ];

  const inviteColumns: ColumnsType<InviteItem> = [
    { title: '邀请链接', dataIndex: 'invite_url', key: 'invite_url', width: 300, render: (url: string) => (
      <Space>
        <span style={{ fontSize: 12, color: '#666', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{url}</span>
        <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => handleCopyLink(url)}>复制</Button>
      </Space>
    )},
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => {
      if (s === 'active') return <Tag color="processing">有效</Tag>;
      if (s === 'used') return <Tag color="default">已使用</Tag>;
      if (s === 'expired') return <Tag color="error">已过期</Tag>;
      return <Tag>{s}</Tag>;
    }},
    { title: '生成时间', dataIndex: 'created_at', key: 'created_at', width: 180, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { title: '过期时间', dataIndex: 'expires_at', key: 'expires_at', width: 180, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { title: '备注', dataIndex: 'note', key: 'note', width: 150, render: (v: string) => v || '-' },
  ];

  return (
    <>
      <Card
        title="裁判管理"
        extra={
          <Space>
            <Input placeholder="搜索裁判姓名" prefix={<SearchOutlined />} value={searchName} onChange={(e) => setSearchName(e.target.value)} onPressEnter={() => fetchList()} style={{ width: 200 }} allowClear />
            <Button type="primary" icon={<PlusOutlined />} loading={inviteGenerating} onClick={handleGenerateInvite}>邀请裁判</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchList(); fetchInviteList(); }}>刷新</Button>
          </Space>
        }
      >
        {/* 邀请结果（一键复制） */}
        {inviteResult && (
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 14 }}>✅ 邀请链接已生成</span>
              <span style={{ color: '#999', fontSize: 12, marginLeft: 12 }}>有效期至 {inviteResult.expires_at ? new Date(inviteResult.expires_at).toLocaleString('zh-CN') : '-'}</span>
            </div>
            <Space>
              <Button icon={<CopyOutlined />} type="primary" size="small" onClick={() => handleCopyLink(inviteResult.invite_url)}>{copied ? '已复制' : '复制链接'}</Button>
              <Button size="small" onClick={() => setInviteResult(null)}>关闭</Button>
            </Space>
          </div>
        )}

        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} scroll={{ x: 1000 }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 名裁判` }} />

        <div style={{ marginTop: 32 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>邀请记录</h4>
          <Table columns={inviteColumns} dataSource={inviteList} rowKey="id" loading={inviteLoading} scroll={{ x: 900 }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条邀请记录` }} />
        </div>
      </Card>

      <Modal title="裁判详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={560}>
        {detailReferee && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="姓名">{detailReferee.name}</Descriptions.Item>
            <Descriptions.Item label="手机号">{detailReferee.phone}</Descriptions.Item>
            <Descriptions.Item label="绑定赛场" span={2}>{detailReferee.venue_name || '未绑定'}</Descriptions.Item>
            <Descriptions.Item label="总工时(h)">{detailReferee.total_hours ?? 0}</Descriptions.Item>
            <Descriptions.Item label="签到时间" span={2}>{detailReferee.check_in_at ? new Date(detailReferee.check_in_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="签退时间" span={2}>{detailReferee.check_out_at ? new Date(detailReferee.check_out_at).toLocaleString('zh-CN') : '在岗'}</Descriptions.Item>
            <Descriptions.Item label="最近活跃" span={2}>{detailReferee.last_active_at ? new Date(detailReferee.last_active_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="注册时间" span={2}>{new Date(detailReferee.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal title={bindTarget ? `绑定赛场 - ${bindTarget.name}` : '绑定赛场'} open={bindVenueOpen} onOk={handleBindVenueConfirm} onCancel={() => setBindVenueOpen(false)}>
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 12, color: '#666' }}>为裁判选择绑定的赛场，绑定后可进行签到考勤。</p>
          <Select showSearch placeholder="选择赛场" style={{ width: '100%' }} value={bindVenueId || undefined} onChange={(v) => setBindVenueId(v)} options={venues.map((v) => ({ value: v.id, label: v.name }))} filterOption={(input, option) => (option?.label as string)?.includes(input) ?? false} />
        </div>
      </Modal>

      <AccountInfoModal open={!!accountInfo} account={accountInfo?.account || ''} password={accountInfo?.password || ''} role="referee" onClose={() => setAccountInfo(null)} />
    </>
  );
}
