import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input,
  InputNumber, message, Badge, Tabs, Tag, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

interface MerchantItem {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact_name: string;
  contact_phone: string;
  logo_url: string;
  status: 'enabled' | 'disabled';
  audit_status: number; // 0=待审核, 1=已通过, 2=已驳回
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
  auditStatus: number; // 0=待审核, 1=已通过, 2=已驳回
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
  // 审核相关（商家入驻）
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditMerchant, setAuditMerchant] = useState<MerchantItem | null>(null);
  const [auditResult, setAuditResult] = useState<'approved' | 'rejected'>('approved');
  const [auditReason, setAuditReason] = useState('');
  const [auditing, setAuditing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  // 优惠券审核
  const [couponList, setCouponList] = useState<CouponItem[]>([]);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponAuditOpen, setCouponAuditOpen] = useState(false);
  const [auditCoupon, setAuditCoupon] = useState<CouponItem | null>(null);
  const [couponAuditResult, setCouponAuditResult] = useState<'approved' | 'rejected'>('approved');
  const [couponAuditReason, setCouponAuditReason] = useState('');
  const [couponAuditing, setCouponAuditing] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      let data: any;
      if (activeTab === 'pending') {
        data = await api.get('/operator/merchant/pending');
      } else {
        data = await api.get('/admin/merchant');
      }
      setList(data?.list ?? data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

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

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/admin/merchant/${editingId}`, values);
        message.success('商家已更新');
      } else {
        await api.post('/admin/merchant', values);
        message.success('商家已创建');
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  // 商家入驻审核
  const openAuditModal = (record: MerchantItem) => {
    setAuditMerchant(record);
    setAuditResult('approved');
    setAuditReason('');
    setAuditModalOpen(true);
  };

  const handleAudit = async () => {
    if (!auditMerchant) return;
    if (auditResult === 'rejected' && !auditReason.trim()) {
      message.error('驳回原因必填');
      return;
    }
    setAuditing(true);
    try {
      await api.post('/operator/merchant/audit', {
        merchantId: auditMerchant.id,
        auditStatus: auditResult === 'approved' ? 1 : 2,
        auditRemark: auditResult === 'rejected' ? auditReason.trim() : '',
      });
      message.success(auditResult === 'approved' ? '已通过审核' : '已驳回');
      setAuditModalOpen(false);
      fetchList();
    } catch {
      message.error('审核操作失败');
    } finally {
      setAuditing(false);
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
        auditStatus: couponAuditResult === 'approved' ? 1 : 2,
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
    if (status === 0) return <Tag color="warning">待审核</Tag>;
    if (status === 1) return <Tag color="success">已通过</Tag>;
    if (status === 2) return <Tag color="error">已驳回</Tag>;
    return null;
  };

  const merchantColumns: ColumnsType<MerchantItem> = [
    { title: '商家名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: '地址', dataIndex: 'address', key: 'address', width: 200,
      ellipsis: true,
    },
    // 经纬度列已移除（用户不需要手动输入）
    { title: '联系人', dataIndex: 'contact_name', key: 'contact_name', width: 100 },
    { title: '联系人手机', dataIndex: 'contact_phone', key: 'contact_phone', width: 120 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => (
        <Badge status={s === 'enabled' ? 'success' : 'error'} text={s === 'enabled' ? '启用' : '禁用'} />
      ),
    },
    {
      title: '审核状态', key: 'audit_status', width: 100,
      render: (_: unknown, record: MerchantItem) => renderAuditStatus(record),
    },
    {
      title: '操作', key: 'action', width: 180, fixed: 'right',
      render: (_: unknown, record: MerchantItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          {record.audit_status === 0 && (
            <Button type="link" size="small" onClick={() => openAuditModal(record)}>
              审核
            </Button>
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
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record: CouponItem) => (
        <Space size="small" wrap>
          {record.auditStatus === 0 && (
            <Button type="link" size="small" onClick={() => openCouponAudit(record)}>
              审核
            </Button>
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
            <Button icon={<ReloadOutlined />} onClick={() => activeTab === 'coupon' ? fetchCouponList() : fetchList()}>刷新</Button>
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
            { key: 'pending', label: '待审核商家' },
            { key: 'coupon', label: '优惠券审核' },
          ]}
          style={{ marginBottom: 16 }}
        />

        {activeTab === 'coupon' ? (
          <Table
            columns={couponColumns}
            dataSource={couponList}
            rowKey="id"
            loading={couponLoading}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
          />
        ) : (
          <Table
            columns={merchantColumns}
            dataSource={list}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1100 }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 家商家` }}
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
          <Form.Item name="merchantName" label="商家名称" rules={[{ required: true, message: '请输入商家名称' }]}>
            <Input placeholder="商家名称" maxLength={50} />
          </Form.Item>

          <Form.Item name="merchantAddress" label="地址" rules={[{ required: true, message: '请输入地址' }]}>
            <Input.TextArea rows={2} placeholder="详细地址" maxLength={200} />
          </Form.Item>

          <input type="hidden" name="latitude" value={0} />
          <input type="hidden" name="longitude" value={0} />

          <Space size={16} wrap>
            <Form.Item name="contactPhone" label="联系人手机" rules={[{ required: true, message: '请输入联系人手机' }]}>
              <Input placeholder="手机号码" style={{ width: 200 }} />
            </Form.Item>
          </Space>

          <Form.Item name="logoUrl" label="Logo URL">
            <Input placeholder="Logo图片地址（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 商家入驻审核弹窗 */}
      <Modal
        title="商家审核"
        open={auditModalOpen}
        onCancel={() => setAuditModalOpen(false)}
        footer={null}
        width={500}
        destroyOnClose
      >
        {auditMerchant && (
          <>
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
              <p><strong>商家名称：</strong>{auditMerchant.name}</p>
              <p><strong>地址：</strong>{auditMerchant.address}</p>
              <p><strong>联系人：</strong>{auditMerchant.contact_name} / {auditMerchant.contact_phone}</p>
              <p><strong>创建时间：</strong>{auditMerchant.created_at}</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>审核结果</label>
              <Space>
                <Button
                  type={auditResult === 'approved' ? 'primary' : 'default'}
                  onClick={() => setAuditResult('approved')}
                >
                  通过
                </Button>
                <Button
                  type={auditResult === 'rejected' ? 'primary' : 'default'}
                  danger
                  onClick={() => setAuditResult('rejected')}
                >
                  驳回
                </Button>
              </Space>
            </div>

            {auditResult === 'rejected' && (
              <Form.Item
                label="驳回原因"
                required
                validateStatus={!auditReason.trim() ? 'error' : undefined}
                help={!auditReason.trim() ? '驳回原因必填' : undefined}
              >
                <Input.TextArea
                  rows={3}
                  placeholder="请输入驳回原因"
                  value={auditReason}
                  onChange={(e) => setAuditReason(e.target.value)}
                />
              </Form.Item>
            )}

            <Space style={{ marginTop: 24, width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setAuditModalOpen(false)}>取消</Button>
              <Button type="primary" loading={auditing} onClick={handleAudit}>
                确认审核
              </Button>
            </Space>
          </>
        )}
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
                <Button
                  type={couponAuditResult === 'approved' ? 'primary' : 'default'}
                  onClick={() => setCouponAuditResult('approved')}
                >
                  通过
                </Button>
                <Button
                  type={couponAuditResult === 'rejected' ? 'primary' : 'default'}
                  danger
                  onClick={() => setCouponAuditResult('rejected')}
                >
                  驳回
                </Button>
              </Space>
            </div>

            {couponAuditResult === 'rejected' && (
              <Form.Item
                label="驳回原因"
                required
                validateStatus={!couponAuditReason.trim() ? 'error' : undefined}
                help={!couponAuditReason.trim() ? '驳回原因必填' : undefined}
              >
                <Input.TextArea
                  rows={3}
                  placeholder="请输入驳回原因"
                  value={couponAuditReason}
                  onChange={(e) => setCouponAuditReason(e.target.value)}
                />
              </Form.Item>
            )}

            <Space style={{ marginTop: 24, width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setCouponAuditOpen(false)}>取消</Button>
              <Button type="primary" loading={couponAuditing} onClick={handleCouponAudit}>
                确认审核
              </Button>
            </Space>
          </>
        )}
      </Modal>
    </>
  );
}
