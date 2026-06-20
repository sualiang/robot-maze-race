import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input,
  InputNumber, message, Switch, Popconfirm, Descriptions, Divider,
} from 'antd';
import { PlusOutlined, ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined, GiftOutlined } from '@ant-design/icons';
import api from '../../../utils/api';

interface PackageItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  race_count: number;
  valid_days: number;
  is_active: boolean;
  coupon_reward_min?: number;
  coupon_reward_max?: number;
  created_at: string;
  updated_at: string;
}

interface MatchedCoupon {
  couponId: string;
  couponName: string;
  merchantName: string;
  denominationCents: number;
  couponType: number;
}

// 从 localStorage 获取当前用户角色
const operatorUserInfo = (() => {
  try { return JSON.parse(localStorage.getItem('operator_user_info') || '{}'); } catch { return {}; }
})();
const operatorRoleId: string = operatorUserInfo.role_id || '';
const operatorPermissions: string[] = operatorUserInfo.permissions || [];
const isOperatorManager = operatorRoleId === 'op_super_admin' || operatorPermissions.includes('*');

const couponTypeLabels: Record<number, string> = {
  1: '无门槛立减券',
  3: '满减券',
  4: '兑换券',
};

export default function PackageList() {
  const [list, setList] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardPackageId, setRewardPackageId] = useState<string | null>(null);
  const [rewardMatchLoading, setRewardMatchLoading] = useState(false);
  const [matchedCoupons, setMatchedCoupons] = useState<MatchedCoupon[]>([]);
  const [totalReward, setTotalReward] = useState(0);
  const [rewardInfo, setRewardInfo] = useState<{ min: number; max: number }>({ min: 0, max: 0 });

  const formatPrice = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/packages?status=');
      setList(data?.list ?? data ?? []);
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
    form.setFieldsValue({
      price: 9.90,
      race_count: 3,
      valid_days: 30,
      is_active: true,
      coupon_reward_min: 0,
      coupon_reward_max: 0,
    });
    setModalOpen(true);
  };

  const handleEdit = (record: PackageItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      price: record.price,
      race_count: record.race_count,
      valid_days: record.valid_days,
      is_active: record.is_active,
      coupon_reward_min: record.coupon_reward_min || 0,
      coupon_reward_max: record.coupon_reward_max || 0,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingId) {
        await api.put(`/packages/${editingId}`, values);
        message.success('更新成功');
      } else {
        await api.post('/packages', values);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      console.error('[PackageList] save error:', err);
      const serverMsg = err?.response?.data?.message || err?.data?.message || err?.message || '';
      message.error(serverMsg || '操作失败');
    }
  };

  const handleToggleStatus = async (record: PackageItem) => {
    try {
      await api.patch(`/packages/${record.id}`, { is_active: !record.is_active });
      message.success(record.is_active ? '已下架' : '已上架');
      fetchList();
    } catch (err: any) {
      console.error('[PackageList] toggle error:', err);
      message.error(err?.response?.data?.message || err?.data?.message || err?.message || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/packages/${id}`);
      message.success('已删除');
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.data?.message || err?.message || '删除失败');
    }
  };

  // ============================================================
  // 礼券匹配功能
  // ============================================================
  const openRewardPanel = (record: PackageItem) => {
    setRewardPackageId(record.id);
    setRewardInfo({
      min: record.coupon_reward_min || 0,
      max: record.coupon_reward_max || 0,
    });
    setMatchedCoupons([]);
    setTotalReward(0);
    setRewardOpen(true);
  };

  const handleMatchCoupons = async () => {
    if (!rewardPackageId) return;
    setRewardMatchLoading(true);
    try {
      const res: any = await api.post(`/packages/${rewardPackageId}/match-coupons`, {});
      if (res?.data?.matched) {
        setMatchedCoupons(res.data.matched);
        setTotalReward(res.data.totalValue || 0);
        if (res.data.message) {
          message.info(res.data.message);
        }
      } else {
        message.warning(res?.data?.message || '匹配无结果');
      }
    } catch (err: any) {
      message.error('匹配失败');
    } finally {
      setRewardMatchLoading(false);
    }
  };

  const handleSaveMatched = async () => {
    if (!rewardPackageId) return;
    setRewardMatchLoading(true);
    try {
      const res: any = await api.post(`/packages/${rewardPackageId}/save-matched-coupons`, {});
      if (res?.data?.saved) {
        setMatchedCoupons(res.data.saved);
        setTotalReward(res.data.totalValue || 0);
        message.success('礼券匹配已保存');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setRewardMatchLoading(false);
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: '描述', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '价格(¥)', dataIndex: 'price', key: 'price', width: 100,
      render: (v: number) => `¥${v.toFixed(2)}`,
      sorter: (a: PackageItem, b: PackageItem) => a.price - b.price,
    },
    { title: '参赛次数', dataIndex: 'race_count', key: 'race_count', width: 90 },
    { title: '有效期(天)', dataIndex: 'valid_days', key: 'valid_days', width: 100, render: (v: number) => `${v}天` },
    {
      title: '礼券', key: 'couponReward', width: 120,
      render: (_: unknown, record: PackageItem) => {
        if (record.coupon_reward_min && record.coupon_reward_max) {
          return (
            <Tag color="purple">
              ¥{record.coupon_reward_min}~¥{record.coupon_reward_max}
            </Tag>
          );
        }
        return <Tag style={{ opacity: 0.4 }}>未设置</Tag>;
      }
    },
    {
      title: '状态', dataIndex: 'is_active', key: 'is_active', width: 90,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? '在售' : '已下架'}</Tag>
      ),
    },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作', key: 'action', width: 280, fixed: 'right',
      render: (_: unknown, record: PackageItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          {record.coupon_reward_min && record.coupon_reward_max && (
            <Button type="link" size="small" icon={<GiftOutlined />}
              onClick={() => openRewardPanel(record)}>礼券</Button>
          )}
          <Popconfirm title={record.is_active ? '确定下架？' : '确定上架？'}
            onConfirm={() => handleToggleStatus(record)}>
            <Button type="link" size="small"
              icon={record.is_active ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
              danger={record.is_active}>
              {record.is_active ? '下架' : '上架'}
            </Button>
          </Popconfirm>
          {isOperatorManager && (
            <Popconfirm title="确定删除？不可恢复" onConfirm={() => handleDelete(record.id)}>
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
        title="参赛包管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增参赛包</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 个参赛包` }}
        />
      </Card>

      {/* ====== 创建/编辑 Modal ====== */}
      <Modal
        title={editingId ? '编辑参赛包' : '新增参赛包'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="参赛包名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：新手体验包" maxLength={30} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="描述信息（选填）" maxLength={200} showCount />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="price" label="价格（元）" rules={[{ required: true, message: '请输入价格' }]}>
              <InputNumber min={0.01} max={99999} step={0.01} precision={2} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="race_count" label="参赛次数" rules={[{ required: true, message: '请输入次数' }]}>
              <InputNumber min={1} max={100} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="valid_days" label="有效期（天）" rules={[{ required: true, message: '请输入有效期' }]}>
            <InputNumber min={1} max={365} style={{ width: 200 }} />
          </Form.Item>

          <Divider>🎁 礼券自动匹配（选填）</Divider>
          <Space size={16}>
            <Form.Item name="coupon_reward_min" label="礼券总价值下限（元）">
              <InputNumber min={0} step={0.01} precision={2} style={{ width: 150 }}
                placeholder="例如48元参赛包设50" />
            </Form.Item>
            <Form.Item name="coupon_reward_max" label="礼券总价值上限（元）">
              <InputNumber min={0} step={0.01} precision={2} style={{ width: 150 }}
                placeholder="例如设60" />
            </Form.Item>
          </Space>

          <Form.Item name="is_active" label="立即上架" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* ====== 礼券匹配面板 Modal ====== */}
      <Modal
        title="🎁 礼券匹配详情"
        open={rewardOpen}
        onCancel={() => setRewardOpen(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="匹配区间">
            ¥{rewardInfo.min} ~ ¥{rewardInfo.max}
          </Descriptions.Item>
          <Descriptions.Item label="当前总价值">
            <span style={{ color: '#52c41a', fontWeight: 'bold', fontSize: 16 }}>
              {formatPrice(totalReward)}
            </span>
          </Descriptions.Item>
        </Descriptions>

        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<GiftOutlined />} loading={rewardMatchLoading}
            onClick={handleMatchCoupons}>自动匹配</Button>
          {matchedCoupons.length > 0 && (
            <Button onClick={handleSaveMatched} loading={rewardMatchLoading}>保存匹配结果</Button>
          )}
        </Space>

        {matchedCoupons.length === 0 && (
          <div style={{ color: 'rgba(0,0,0,0.35)', textAlign: 'center', padding: 24 }}>
            点击「自动匹配」从全平台券池中自动选配礼券组合
          </div>
        )}

        {matchedCoupons.length > 0 && (
          <Card size="small" title="匹配结果">
            {matchedCoupons.map((c, i) => (
              <div key={c.couponId} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: i < matchedCoupons.length - 1 ? '1px solid #f0f0f0' : 'none'
              }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{c.couponName}</div>
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                    {c.merchantName} · {couponTypeLabels[c.couponType] || '券'}
                  </div>
                </div>
                <div style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 15 }}>
                  {formatPrice(c.denominationCents)}
                </div>
              </div>
            ))}
          </Card>
        )}
      </Modal>
    </>
  );
}
