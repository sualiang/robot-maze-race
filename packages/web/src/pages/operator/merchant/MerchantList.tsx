import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input,
  message, Badge, Tabs, Tag, Tooltip, Popover, Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, ReloadOutlined, KeyOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';
import AccountInfoModal from '../../../components/AccountInfoModal';

interface MerchantItem {
  id: string;
  merchantName: string;
  name?: string;
  merchantAddress: string;
  address?: string;
  longitude: number;
  latitude: number;
  contactName: string;
  contactPhone: string;
  contact_phone?: string;
  contact_name?: string;
  logoUrl: string;
  logo_url?: string;
  status: number;
  audit_status: number;
  reject_reason: string;
  created_at: string;
}

interface CouponItem {
  id: string;
  name: string;
  merchantName: string;
  description: string;
  denominationCents: number;
  minConsumeCents: number;
  totalCount: number;
  remainCount: number;
  auditStatus: number;
  auditRemark: string;
  status: number;
  createdAt: number;
}

export default function MerchantList() {
  const [list, setList] = useState<MerchantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('all');
  const [accountInfo, setAccountInfo] = useState<{ account: string; password: string } | null>(null);

  // 优惠券审核
  const [couponList, setCouponList] = useState<CouponItem[]>([]);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponAuditOpen, setCouponAuditOpen] = useState(false);
  const [auditCoupon, setAuditCoupon] = useState<CouponItem | null>(null);
  const [couponAuditResult, setCouponAuditResult] = useState<'approved' | 'rejected'>('approved');
  const [couponAuditReason, setCouponAuditReason] = useState('');
  const [couponAuditing, setCouponAuditing] = useState(false);

  // 待下架审核
  const [offlineList, setOfflineList] = useState<CouponItem[]>([]);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [offlineAuditOpen, setOfflineAuditOpen] = useState(false);
  const [offlineCoupon, setOfflineCoupon] = useState<CouponItem | null>(null);
  const [offlineApproved, setOfflineApproved] = useState<boolean | null>(null);
  const [offlineReason, setOfflineReason] = useState('');
  const [offlineAuditing, setOfflineAuditing] = useState(false);

  // 已驳回列表
  const [rejectedList, setRejectedList] = useState<any[]>([]);
  const [rejectedLoading, setRejectedLoading] = useState(false);
  const [rejectedUnreadCount, setRejectedUnreadCount] = useState(0);

  // 优惠券子 Tab
  const [couponSubTab, setCouponSubTab] = useState('pending');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/admin/merchant');
      setList(data?.list ?? data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchCouponList = useCallback(async () => {
    setCouponLoading(true);
    try {
      const data: any = await api.get('/operator/merchant/coupon/pending');
      setCouponList(data?.list ?? []);
    } catch {
      setCouponList([]);
    } finally {
      setCouponLoading(false);
    }
  }, []);

  const fetchOfflineList = useCallback(async () => {
    setOfflineLoading(true);
    try {
      const data: any = await api.get('/operator/merchant/coupon/offline-pending');
      setOfflineList(data?.list ?? []);
    } catch {
      setOfflineList([]);
    } finally {
      setOfflineLoading(false);
    }
  }, []);

  const fetchRejectedList = useCallback(async () => {
    setRejectedLoading(true);
    try {
      const data: any = await api.get('/operator/merchant/coupon/rejected');
      setRejectedList(data?.list ?? []);
      setRejectedUnreadCount(data?.unreadCount ?? 0);
    } catch {
      setRejectedList([]);
      setRejectedUnreadCount(0);
    } finally {
      setRejectedLoading(false);
    }
  }, []);

  const markRejectedRead = async (couponId: string) => {
    try {
      await api.post('/operator/merchant/coupon/rejected/read', { couponId });
      setRejectedList(prev => prev.map(r => r.id === couponId ? { ...r, opRead: 1 } : r));
      setRejectedUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      message.error('标记已读失败');
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: MerchantItem) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleToggleStatus = async (record: MerchantItem) => {
    const newStatus = record.status === 1 ? 0 : 1;
    const actionText = newStatus === 1 ? '启用' : '禁用';
    Modal.confirm({
      title: `${actionText}商家`,
      content: `确定${actionText}商家「${record.merchantName}」吗？`,
      onOk: () => {
        api.patch(`/admin/merchant/${record.id}/status`, { status: newStatus })
          .then(() => {
            message.success(`商家已${actionText}`);
            setList(prev => prev.map(item =>
              item.id === record.id ? { ...item, status: newStatus } : item
            ));
          })
          .catch(() => {
            message.error('操作失败');
          });
      },
    });
  };

  const handleDelete = async (record: MerchantItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定永久删除商家「${record.merchantName}」吗？此操作不可恢复，将同时删除关联的账号、优惠券等数据。`,
      okType: 'danger',
      onOk: () => {
        api.delete(`/admin/merchant/${record.id}`)
          .then(() => {
            message.success('商家已删除');
            setList(prev => prev.filter(item => item.id !== record.id));
          })
          .catch(() => {
            message.error('删除失败');
          });
      },
    });
  };

  const handleResetPassword = (record: MerchantItem) => {
    Modal.confirm({
      title: '确认重置密码',
      content: `确定重置商家「${record.merchantName}」的管理员密码吗？重置后商家需使用新密码登录。`,
      onOk: () => {
        api.post(`/admin/merchant/${record.id}/reset-password`)
          .then((res: any) => {
            Modal.success({
              title: '密码已重置',
              content: (
                <div>
                  <p>商家：<strong>{record.merchantName}</strong></p>
                  <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, marginTop: 12 }}>
                    <p>新密码：<strong style={{ color: '#f5222d', fontSize: 16 }}>{res.initPassword}</strong></p>
                  </div>
                  <p style={{ color: '#999', marginTop: 12, fontSize: 13 }}>请将新密码提供给商家。</p>
                </div>
              ),
              okText: '知道了',
              width: 400,
            });
          })
          .catch(() => {
            message.error('重置密码失败');
          });
      },
    });
  };

  const handleSave = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      message.error('表单验证失败，请检查填写内容');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/admin/merchant/${editingId}`, values);
        message.success('商家已更新');
      } else {
        const d = await api.post('/admin/merchant', values);
        setAccountInfo({ account: values.accountPhone, password: d?.adminPassword || '' });
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  // 优惠券审核
  const openCouponAudit = (coupon: CouponItem) => {
    setAuditCoupon(coupon);
    setCouponAuditResult('approved');
    setCouponAuditReason('');
    setCouponAuditOpen(true);
  };

  const handleCouponAudit = async () => {
    if (!auditCoupon) return;
    if (couponAuditResult === 'rejected' && !couponAuditReason.trim()) {
      message.error('驳回原因必填');
      return;
    }
    setCouponAuditing(true);
    try {
      await api.post('/operator/merchant/coupon/audit', {
        couponId: auditCoupon.id,
        auditStatus: couponAuditResult === 'approved' ? 2 : 3,
        auditRemark: couponAuditResult === 'rejected' ? couponAuditReason.trim() : '',
      });
      message.success(couponAuditResult === 'approved' ? '优惠券已通过' : '优惠券已驳回');
      setCouponAuditOpen(false);
      fetchCouponList();
    } catch {
      message.error('审核操作失败');
    } finally {
      setCouponAuditing(false);
    }
  };

  // 下架审核
  const openOfflineAudit = (coupon: CouponItem, approved: boolean) => {
    setOfflineCoupon(coupon);
    setOfflineApproved(approved);
    setOfflineReason('');
    // 如果驳回，直接弹窗要原因
    if (!approved) {
      setOfflineAuditOpen(true);
    } else {
      // 同意下架直接提交
      handleOfflineAudit(coupon.id, true);
    }
  };

  const handleOfflineAudit = async (couponId: string, approved: boolean) => {
    setOfflineAuditing(true);
    try {
      await api.post('/operator/merchant/coupon/offline-audit', {
        couponId,
        approved,
        auditRemark: approved ? '' : offlineReason.trim(),
      });
      message.success(approved ? '已下架' : '已驳回下架申请');
      setOfflineAuditOpen(false);
      fetchOfflineList();
    } catch {
      message.error('操作失败');
    } finally {
      setOfflineAuditing(false);
    }
  };

  const submitOfflineReject = () => {
    if (!offlineCoupon) return;
    if (!offlineReason.trim()) {
      message.error('驳回原因必填');
      return;
    }
    handleOfflineAudit(offlineCoupon.id, false);
  };

  const renderAuditStatus = (record: MerchantItem) => {
    if (record.audit_status === 0) {
      return <Tag color="warning">待审核</Tag>;
    }
    if (record.audit_status === 1) {
      return <Tag color="success">已通过</Tag>;
    }
    if (record.audit_status === 2) {
      return (
        <Tooltip title={record.reject_reason || '无驳回原因'}>
          <Tag color="error">已驳回</Tag>
        </Tooltip>
      );
    }
    return null;
  };

  const renderCouponStatus = (status: number) => {
    if (status === 0) return <Tag color="default">草稿</Tag>;
    if (status === 1) return <Tag color="warning">待审核</Tag>;
    if (status === 2) return <Tag color="success">已通过</Tag>;
    if (status === 3) return <Tag color="error">已驳回</Tag>;
    if (status === 4) return <Tag color="purple">待下架审核</Tag>;
    return null;
  };

  const userInfoStr = localStorage.getItem('operator_user_info') || '{}';
  const userInfo = JSON.parse(userInfoStr);
  const permissions = userInfo?.permissions || [];
  const roleId = userInfo?.role_id || '';
  const canDelete = permissions.includes('*') || roleId === 'role-admin' || userInfo?.role === 'operator';

  const merchantColumns: ColumnsType<MerchantItem> = [
    { title: '商家名称', dataIndex: 'merchantName', key: 'merchantName', width: 160 },
    { title: '地址', dataIndex: 'merchantAddress', key: 'merchantAddress', width: 200, ellipsis: true },
    { title: '联系人', dataIndex: 'contactName', key: 'contactName', width: 100 },
    { title: '联系手机', dataIndex: 'contactPhone', key: 'contactPhone', width: 120 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: number) => (
        <Badge status={s === 1 ? 'success' : 'error'} text={s === 1 ? '启用' : '禁用'} />
      ),
    },
    {
      title: '审核状态', key: 'audit_status', width: 100,
      render: (_: unknown, record: MerchantItem) => renderAuditStatus(record),
    },
    {
      title: '操作', key: 'action', width: 360, fixed: 'right',
      render: (_: unknown, record: MerchantItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 1 ? '禁用' : '启用'}
          </Button>
          <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => handleResetPassword(record)}>重置密码</Button>
          {canDelete && (
            <Button type="link" size="small" danger onClick={() => handleDelete(record)}>删除</Button>
          )}
        </Space>
      ),
    },
  ];

  const couponColumns: ColumnsType<CouponItem> = [
    { title: '优惠券名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '商家名称', dataIndex: 'merchantName', key: 'merchantName', width: 130 },
    {
      title: '面值', dataIndex: 'denominationCents', key: 'denominationCents', width: 80,
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
    },
    {
      title: '门槛', dataIndex: 'minConsumeCents', key: 'minConsumeCents', width: 80,
      render: (v: number) => v > 0 ? `满¥${(v / 100).toFixed(2)}` : '无门槛',
    },
    { title: '库存', dataIndex: 'totalCount', key: 'totalCount', width: 60 },
    { title: '剩余', dataIndex: 'remainCount', key: 'remainCount', width: 60 },
    {
      title: '审核状态', key: 'auditStatus', width: 90,
      render: (_: unknown, r: CouponItem) => renderCouponStatus(r.auditStatus),
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right',
      render: (_: unknown, record: CouponItem) => (
        <Space size="small" wrap>
          {record.auditStatus === 1 && (
            <Button type="link" size="small" onClick={() => openCouponAudit(record)}>审核</Button>
          )}
          {record.auditStatus === 4 && (
            <>
              <Button type="link" size="small" style={{ color: '#52c41a' }} onClick={() => openOfflineAudit(record, true)}>同意下架</Button>
              <Button type="link" size="small" danger onClick={() => openOfflineAudit(record, false)}>驳回</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="商家管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => {
              if (activeTab === 'all') fetchList();
              else if (activeTab === 'coupon') {
                if (couponSubTab === 'pending') fetchCouponList();
                else if (couponSubTab === 'offline') fetchOfflineList();
                else fetchRejectedList();
              }
            }}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增商家</Button>
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            if (key === 'coupon') fetchCouponList();
          }}
          items={[
            { key: 'all', label: '全部商家' },
            {
              key: 'coupon', label: '优惠券审核',
              children: (
                <Tabs
                  activeKey={couponSubTab}
                  onChange={(key) => {
                    setCouponSubTab(key);
                    if (key === 'pending') fetchCouponList();
                    else if (key === 'offline') fetchOfflineList();
                    else fetchRejectedList();
                  }}
                  items={[
                    { key: 'pending', label: '待审核' },
                    { key: 'offline', label: '待下架审核' },
                    { key: 'rejected', label: `已驳回${rejectedUnreadCount > 0 ? ` (${rejectedUnreadCount})` : ''}` },
                  ]}
                />
              ),
            },
          ]}
          style={{ marginBottom: 16 }}
        />

        {activeTab === 'all' ? (
          <Table
            columns={merchantColumns}
            dataSource={list}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1100 }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 家商家` }}
          />
        ) : couponSubTab === 'pending' ? (
          <Table
            columns={couponColumns}
            dataSource={couponList}
            rowKey="id"
            loading={couponLoading}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
          />
        ) : couponSubTab === 'offline' ? (
          <Table
            columns={couponColumns}
            dataSource={offlineList}
            rowKey="id"
            loading={offlineLoading}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
          />
        ) : (
          <Table
            columns={[
              { title: '优惠券名称', dataIndex: 'name', key: 'name', width: 140 },
              { title: '商家名称', dataIndex: 'merchantName', key: 'merchantName', width: 130 },
              {
                title: '面值', dataIndex: 'denominationCents', key: 'denominationCents', width: 80,
                render: (v: number) => `¥${(v / 100).toFixed(2)}`,
              },
              {
                title: '驳回理由', key: 'auditRemark', width: 300,
                render: (_: unknown, r: any) => r.auditRemark || '无',
              },
              {
                title: '审核状态', key: 'auditStatus', width: 90,
                render: (_: unknown, r: any) => renderCouponStatus(r.auditStatus),
              },
              {
                title: '操作', key: 'action', width: 120,
                render: (_: unknown, r: any) => (
                  <Space size="small" wrap>
                    {r.opRead === 0 ? (
                      <Button
                        type="link"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        onClick={() => markRejectedRead(r.id)}
                      >
                        确认已读
                      </Button>
                    ) : (
                      <span style={{ color: '#999' }}>已读</span>
                    )}
                  </Space>
                ),
              },
            ]}
            dataSource={rejectedList}
            rowKey="id"
            loading={rejectedLoading}
            scroll={{ x: 960 }}
            locale={{ emptyText: <Empty description="暂无已驳回记录" /> }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
          />
        )}
      </Card>

      {/* 商家编辑弹窗 */}
      <Modal
        title={editingId ? '编辑商家' : '新增商家'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={600}
        destroyOnClose
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingId && (
            <>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#999' }}>商家登录账号（创建后不可修改），初始密码由系统自动生成</div>
              <Form.Item name="accountPhone" label="登录账号" rules={[{ required: true, message: '请输入登录手机号' }]}>
                <Input placeholder="商家登录用的手机号" maxLength={11} style={{ width: 280 }} />
              </Form.Item>
            </>
          )}
          <Form.Item name="merchantName" label="商家名称" rules={[{ required: true, message: '请输入商家名称' }]}>
            <Input placeholder="商家名称" maxLength={50} />
          </Form.Item>
          <Form.Item name="merchantAddress" label="地址">
            <Input.TextArea rows={2} placeholder="详细地址" maxLength={200} />
          </Form.Item>
          <input type="hidden" name="latitude" value={0} />
          <input type="hidden" name="longitude" value={0} />
          <Space size={16} wrap>
            <Form.Item name="contactName" label="联系人">
              <Input placeholder="联系人姓名" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="contactPhone" label="联系手机">
              <Input placeholder="联系手机号码" style={{ width: 200 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 优惠券审核弹窗 */}
      <Modal
        title="优惠券审核"
        open={couponAuditOpen}
        onCancel={() => setCouponAuditOpen(false)}
        footer={null}
        width={500}
        destroyOnClose
      >
        {auditCoupon && (
          <>
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
              <p><strong>优惠券名称：</strong>{auditCoupon.name}</p>
              <p><strong>商家名称：</strong>{auditCoupon.merchantName}</p>
              <p><strong>面值：</strong>¥{(auditCoupon.denominationCents / 100).toFixed(2)}</p>
              <p><strong>描述：</strong>{auditCoupon.description || '-'}</p>
              <p><strong>库存：</strong>{auditCoupon.totalCount}</p>
              <p><strong>创建时间：</strong>{new Date(auditCoupon.createdAt).toLocaleString('zh-CN')}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>审核结果</label>
              <Space>
                <Button type={couponAuditResult === 'approved' ? 'primary' : 'default'} onClick={() => setCouponAuditResult('approved')}>通过</Button>
                <Button type={couponAuditResult === 'rejected' ? 'primary' : 'default'} danger onClick={() => setCouponAuditResult('rejected')}>驳回</Button>
              </Space>
            </div>
            {couponAuditResult === 'rejected' && (
              <Form.Item label="驳回原因" required
                validateStatus={!couponAuditReason.trim() ? 'error' : undefined}
                help={!couponAuditReason.trim() ? '驳回原因必填' : undefined}
              >
                <Input.TextArea rows={3} placeholder="请输入驳回原因" value={couponAuditReason} onChange={(e) => setCouponAuditReason(e.target.value)} />
              </Form.Item>
            )}
            <Space style={{ marginTop: 24, width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setCouponAuditOpen(false)}>取消</Button>
              <Button type="primary" loading={couponAuditing} onClick={handleCouponAudit}>确认审核</Button>
            </Space>
          </>
        )}
      </Modal>

      {/* 下架审核 — 驳回原因弹窗 */}
      <Modal
        title="驳回下架申请"
        open={offlineAuditOpen}
        onCancel={() => setOfflineAuditOpen(false)}
        onOk={submitOfflineReject}
        confirmLoading={offlineAuditing}
        width={460}
        destroyOnClose
      >
        <p style={{ marginBottom: 12 }}>确定驳回「{offlineCoupon?.name}」的下架申请？</p>
        <Form.Item label="驳回原因" required
          validateStatus={!offlineReason.trim() ? 'error' : undefined}
          help={!offlineReason.trim() ? '驳回原因必填' : undefined}
        >
          <Input.TextArea rows={3} placeholder="请输入驳回原因" value={offlineReason} onChange={(e) => setOfflineReason(e.target.value)} />
        </Form.Item>
      </Modal>

      <AccountInfoModal
        open={!!accountInfo}
        account={accountInfo?.account || ''}
        password={accountInfo?.password || ''}
        role="merchant"
        loginUrl="http://175.24.200.63/merchant/login"
        onClose={() => setAccountInfo(null)}
      />
    </>
  );
}
