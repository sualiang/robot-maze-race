import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Select, Popconfirm, Input,
  message, Descriptions, Badge, Tabs,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, EyeOutlined, KeyOutlined, ReloadOutlined,
  SwapOutlined, SearchOutlined, PlusOutlined, CopyOutlined, ExclamationCircleOutlined,
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

interface RefereeReviewItem {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  status: string;
  apply_remark?: string;
  review_remark?: string;
  reviewed_at?: string;
  operator_id?: string;
  operator_name?: string;
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
const operatorId: string = operatorUserInfo.operatorId || operatorUserInfo.id || '';
const operatorRoleName: string = operatorUserInfo.role_name || '';
const operatorRoleId: string = operatorUserInfo.role_id || '';
const operatorPermissions: string[] = operatorUserInfo.permissions || [];
// 运营商超管（op_super_admin）或拥有 '*' 权限 → 可删除
const isOperatorManager = operatorRoleId === 'op_super_admin' || operatorPermissions.includes('*');

export default function RefereeList() {
  // 裁判列表
  const [list, setList] = useState<RefereeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReferee, setDetailReferee] = useState<RefereeItem | null>(null);
  const [bindVenueOpen, setBindVenueOpen] = useState(false);
  const [bindTarget, setBindTarget] = useState<RefereeItem | null>(null);
  const [bindVenueId, setBindVenueId] = useState<string>('');

  const [searchName, setSearchName] = useState('');

  // 邀请裁判弹窗
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ token: string; invite_url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ account: string; password: string } | null>(null);

  // 申请审核 Tab
  const [reviewList, setReviewList] = useState<RefereeReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RefereeReviewItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<string>('list');

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

  const fetchReviewList = useCallback(async () => {
    setReviewLoading(true);
    try {
      // 拉取所有裁判申请（后端已 JOIN operators 返回 operator_name）
      const data: any = await api.get('/referees', { params: { pageSize: 1000 } });
      setReviewList(data?.list ?? []);
    } catch {
      setReviewList([]);
    } finally {
      setReviewLoading(false);
    }
  }, []);

  const fetchVenues = useCallback(async () => {
    try {
      const data: any = await api.get('/venues', { params: { pageSize: 1000 } });
      const vlist = data?.list ?? data ?? [];
      setVenues(vlist.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); fetchVenues(); }, [fetchList, fetchVenues]);

  // Tab 切换到审核时拉取审核列表
  useEffect(() => {
    fetchReviewList();
  }, []);

  const handleGenerateInvite = async () => {
    if (!invitePhone || !/^\d{11}$/.test(invitePhone)) {
      message.warning('请输入正确的11位手机号');
      return;
    }
    setInviteGenerating(true);
    try {
      const data: any = await api.post('/referee/invite', {
        phone: invitePhone,
        note: inviteNote || undefined,
      });
      setInviteResult(data);
      message.success('邀请生成成功');
    } catch (err: any) {
      message.error(err?.response?.data?.message || '生成邀请失败');
    } finally {
      setInviteGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.invite_url);
      setCopied(true);
      message.success('邀请链接已复制');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const handleCloseInvite = () => {
    setInviteOpen(false);
    setInvitePhone('');
    setInviteNote('');
    setInviteResult(null);
    setCopied(false);
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

  // 审核操作
  const handleApprove = async (record: RefereeReviewItem) => {
    setReviewSubmitting(true);
    try {
      await api.patch(`/referees/${record.id}/review`, { action: 'approve' });
      message.success(`裁判「${record.name}」已通过审核`);
      fetchReviewList();
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '审核失败');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleRejectClick = (record: RefereeReviewItem) => {
    setRejectTarget(record);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setReviewSubmitting(true);
    try {
      await api.patch(`/referees/${rejectTarget.id}/review`, {
        action: 'reject',
        reason: rejectReason || undefined,
      });
      message.success(`裁判「${rejectTarget.name}」已驳回`);
      setRejectModalOpen(false);
      setRejectTarget(null);
      setRejectReason('');
      fetchReviewList();
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '审核失败');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // 裁判列表列（保持原有不变，仅增加 status 展示）
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

  // 审核列表列
  const reviewColumns: ColumnsType<RefereeReviewItem> = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      title: '推荐运营商', dataIndex: 'operator_name', key: 'operator_name', width: 160,
      render: (v: string) => v || <Tag color="default">未关联</Tag>,
    },
    {
      title: '申请时间', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => {
        if (s === 'pending') return <Tag color="processing">待审核</Tag>;
        if (s === 'approved') return <Tag color="success">已通过</Tag>;
        if (s === 'rejected') return <Tag color="error">已拒绝</Tag>;
        return <Tag>{s || '-'}</Tag>;
      },
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record: RefereeReviewItem) => {
        if (record.status !== 'pending') return null;
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              style={{ color: '#52c41a' }}
              loading={reviewSubmitting}
              onClick={() => handleApprove(record)}
            >
              通过
            </Button>
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseOutlined />}
              loading={reviewSubmitting}
              onClick={() => handleRejectClick(record)}
            >
              拒绝
            </Button>
          </Space>
        );
      },
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

            <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
              邀请裁判
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchList(); fetchReviewList(); }}>刷新</Button>
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            if (key === 'review') fetchReviewList();
          }}
          items={[
            {
              key: 'list',
              label: '裁判列表',
              children: (
                <Table
                  columns={columns}
                  dataSource={list}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 1000 }}
                  pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 名裁判` }}
                />
              ),
            },
            {
              key: 'review',
              label: (
                <span>
                  申请审核
                  {reviewList.filter((r) => r.status === 'pending').length > 0 && (
                    <Tag color="red" style={{ marginLeft: 6 }}>
                      {reviewList.filter((r) => r.status === 'pending').length}
                    </Tag>
                  )}
                </span>
              ),
              children: (
                <Table
                  columns={reviewColumns}
                  dataSource={reviewList}
                  rowKey="id"
                  loading={reviewLoading}
                  scroll={{ x: 800 }}
                  pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条申请` }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 驳回原因弹窗 */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            驳回裁判申请
          </Space>
        }
        open={rejectModalOpen}
        onOk={handleRejectConfirm}
        onCancel={() => { setRejectModalOpen(false); setRejectTarget(null); setRejectReason(''); }}
        confirmLoading={reviewSubmitting}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ marginBottom: 12 }}>
            驳回裁判申请：<strong>{rejectTarget?.name}</strong>（{rejectTarget?.phone}）
          </p>
          <Input.TextArea
            placeholder="驳回原因（选填）"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={200}
            showCount
          />
        </div>
      </Modal>

      {/* 邀请裁判弹窗 */}
      <Modal
        title="邀请裁判注册"
        open={inviteOpen}
        onCancel={handleCloseInvite}
        footer={
          inviteResult ? (
            <Space>
              <Button icon={<CopyOutlined />} type="primary" onClick={handleCopyLink}>
                {copied ? '已复制' : '复制链接'}
              </Button>
              <Button onClick={handleCloseInvite}>关闭</Button>
            </Space>
          ) : (
            <Space>
              <Button onClick={handleCloseInvite}>取消</Button>
              <Button type="primary" icon={<PlusOutlined />} loading={inviteGenerating} onClick={handleGenerateInvite}>
                生成邀请
              </Button>
            </Space>
          )
        }
      >
        {inviteResult ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 8,
              padding: '12px 16px',
            }}>
              <p style={{ color: '#52c41a', margin: 0, fontWeight: 600, fontSize: 14 }}>
                ✅ 邀请链接已生成
              </p>
              <p style={{ color: '#999', margin: '4px 0 0', fontSize: 12 }}>
                有效期至 {inviteResult.expires_at ? new Date(inviteResult.expires_at).toLocaleString('zh-CN') : '-'}
              </p>
            </div>
            <Input.TextArea
              value={inviteResult.invite_url}
              readOnly
              rows={3}
              style={{ background: '#f5f5f5' }}
            />
            <p style={{ color: '#999', fontSize: 12, margin: 0 }}>
              请将上方链接通过微信发送给受邀裁判，对方在微信内打开链接后可完成授权登录并提交注册信息。
            </p>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <p style={{ color: '#666', fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              生成一个专属邀请链接，裁判点击链接后可通过微信授权登录并提交注册申请。
              <br />
              <span style={{ color: '#999', fontSize: 12 }}>邀请链接有效期为24小时</span>
            </p>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#333', fontWeight: 500 }}>裁判手机号 *</label>
              <Input
                placeholder="请输入裁判手机号"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value.replace(/\D/g, ''))}
                maxLength={11}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#333', fontWeight: 500 }}>备注（选填）</label>
              <Input.TextArea
                placeholder="邀请备注，裁判可见"
                value={inviteNote}
                onChange={(e) => setInviteNote(e.target.value)}
                maxLength={200}
                rows={2}
              />
            </div>
          </Space>
        )}
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
