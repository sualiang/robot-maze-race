import { useState, useEffect, useCallback } from 'react';
import {
  Card, Form, Switch, InputNumber, Button, Space, Input, Select,
  Divider, message, Spin, Alert, Typography, Modal, Tabs, Table, Tag,
} from 'antd';
import {
  SaveOutlined, GiftOutlined, SettingOutlined, ThunderboltOutlined,
  ShopOutlined, BellOutlined, DeleteOutlined, PlusOutlined, UploadOutlined, KeyOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface Range {
  min: number;
  max: number;
  default: number;
}

export default function MarketingConfig() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [hasData, setHasData] = useState<boolean | null>(null);

  // 总部范围
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [rangeLoading, setRangeLoading] = useState(true);

  // 公告
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);

  // 积分商城商品
  const [shopItems, setShopItems] = useState<any[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [redeemCode, setRedeemCode] = useState<string | null>(null);
  const [redeemCodeLoading, setRedeemCodeLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();

  // ===== 公告 =====
  const fetchAnnouncement = useCallback(async () => {
    try {
      const data: any = await api.get('/operator/marketing');
      if (Array.isArray(data)) {
        const ann = data.find((r: any) => r.key === 'home_announcement');
        if (ann) setAnnouncementText(ann.value);
      }
    } catch {}
  }, []);

  const handleSaveAnnouncement = async () => {
    if (announcementText.length > 30) {
      message.error('公告内容不超过30字');
      return;
    }
    setAnnouncementSaving(true);
    try {
      await api.post('/operator/marketing/batch', {
        configs: [{ key: 'home_announcement', value: announcementText }]
      });
      message.success('公告已更新');
    } catch {
      message.error('保存失败');
    } finally {
      setAnnouncementSaving(false);
    }
  };

  // ===== 积分商城 =====
  const fetchShopItems = useCallback(async () => {
    setShopLoading(true);
    try {
      const data: any = await api.get('/points-shop/items/all');
      if (data) setShopItems(data);
    } catch {
      message.error('加载积分商品失败');
    } finally {
      setShopLoading(false);
    }
  }, []);

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    editForm.setFieldsValue({
      name: item.name,
      itemType: item.itemType || 'physical_gift',
      description: item.description,
      image: item.image || '',
      needPoints: item.needPoints,
      faceValue: item.faceValue || 0,
      sortWeight: item.sortWeight,
      status: item.status,
      stock: item.stock || 0,
    });
    setEditModalOpen(true);
  };

  const handleSaveItem = async () => {
    try {
      const values = await editForm.validateFields();
      await api.put('/points-shop/items/' + editingItem.id, values);
      message.success('更新成功');
      setEditModalOpen(false);
      fetchShopItems();
    } catch {}
  };

  const handleToggleItem = async (id: string, currentStatus: number) => {
    try {
      await api.put('/points-shop/items/' + id, { status: currentStatus === 1 ? 0 : 1 });
      fetchShopItems();
    } catch {}
  };

  const handleDeleteItem = (id: string) => {
    Modal.confirm({
      title: '确定删除此商品？',
      content: '删除后不可恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete('/points-shop/items/' + id);
          message.success('已删除');
          fetchShopItems();
        } catch {}
      },
    });
  };

  const handleAddItem = () => {
    setEditingItem(null);
    editForm.resetFields();
    editForm.setFieldsValue({
      itemType: 'physical_gift',
      needPoints: 100,
      sortWeight: 0,
      status: 1,
      stock: 999,
    });
    setEditModalOpen(true);
  };

  const handleCreateItem = async () => {
    try {
      const values = await editForm.validateFields();
      await api.post('/points-shop/items', values);
      message.success('创建成功');
      setEditModalOpen(false);
      fetchShopItems();
    } catch {}
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      message.error('图片大小不能超过 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data: any = await api.post('/upload/image', { image: reader.result });
        const url = data?.url || '';
        if (url) {
          editForm.setFieldsValue({ image: url });
          message.success('上传成功');
        }
      } catch {
        message.error('上传失败');
      }
    };
    reader.readAsDataURL(file);
  };

  // ===== 原配置 =====
  const checkHasData = useCallback(async () => {
    try {
      const data: any = await api.get('/operator/marketing/check-init');
      setHasData(data?.initialized ?? true);
    } catch {
      setHasData(true);
    }
  }, []);

  const handleInitTemplates = () => {
    Modal.confirm({
      title: '一键初始化',
      content: '将创建以下基础数据：\n\n• 3档参赛包模板（基础68元 / 标准168元 / 专业368元）\n• 默认营销配置\n• 几张测试消费券\n\n⚠️ 仅可在系统无数据时执行一次。确认继续？',
      okText: '确认初始化',
      cancelText: '取消',
      onOk: async () => {
        setInitLoading(true);
        try {
          await api.post('/operator/marketing/init-templates');
          message.success('初始化成功！基础数据已创建');
          setHasData(true);
          window.location.reload();
        } catch {
          message.error('初始化失败，请稍后重试');
        } finally {
          setInitLoading(false);
        }
      },
    });
  };

  useEffect(() => {
    checkHasData();
    api.get('/operator/marketing/range').then((data: any) => {
      if (data) {
        setRanges({
          help_required_count: {
            min: data.help_required_count_min || 1,
            max: data.help_required_count_max || 10,
            default: data.help_required_count_default || 3,
          },
          help_reward_count: {
            min: data.help_reward_count_min || 1,
            max: data.help_reward_count_max || 50,
            default: data.help_reward_count_default || 1,
          },
        });
      }
    }).finally(() => setRangeLoading(false));

    fetchAnnouncement();
    fetchShopItems();

    fetchRedeemCode();
  }, []);

  const fetchRedeemCode = async () => {
    setRedeemCodeLoading(true);
    try {
      const data: any = await api.get('/points-shop/redeem-code');
      if (data?.redeem_code) {
        setRedeemCode(data.redeem_code);
      }
    } catch { /* ignore */ }
    setRedeemCodeLoading(false);
  };

  const handleCreateRedeemCode = async () => {
    try {
      const data: any = await api.post('/points-shop/redeem-code');
      if (data?.redeemCode) {
        setRedeemCode(data.redeemCode);
        message.success(`核销码已创建: ${data.redeemCode}`);
      }
    } catch { message.error('创建核销码失败'); }
  };

  useEffect(() => {
    if (rangeLoading || Object.keys(ranges).length === 0) return;

    setLoading(true);
    function applyDefaultValues() {
      return {
        help_enabled: true,
        help_required_count: ranges.help_required_count?.default ?? 3,
        help_reward_count: ranges.help_reward_count?.default ?? 1,
        welcome_deduction_cents: 500,
      };
    }

    api.get('/operator/marketing').then((rows: any) => {
      let fields = applyDefaultValues();
      if (Array.isArray(rows) && rows.length > 0) {
        const config: Record<string, any> = {};
        for (const r of rows) {
          const num = Number(r.value);
          config[r.key] = isNaN(num) ? r.value : num;
        }
        if (config.help_enabled !== undefined) fields.help_enabled = config.help_enabled === 'true';
        if (config.help_required_count !== undefined) fields.help_required_count = Number(config.help_required_count);
        if (config.help_reward_count !== undefined) fields.help_reward_count = Number(config.help_reward_count);
        if (config.welcome_deduction_cents !== undefined) fields.welcome_deduction_cents = Number(config.welcome_deduction_cents);
      }
      form.setFieldsValue(fields);
    }).catch(() => {
      form.setFieldsValue(applyDefaultValues());
    }).finally(() => setLoading(false));
  }, [ranges, rangeLoading]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const configs = [
        { key: 'help_enabled', value: String(values.help_enabled) },
        { key: 'help_required_count', value: String(values.help_required_count) },
        { key: 'help_reward_count', value: String(values.help_reward_count) },
        { key: 'welcome_deduction_cents', value: String(values.welcome_deduction_cents) },
      ];
      await api.post('/operator/marketing/batch', { configs });
      message.success('营销配置已保存，对所有赛场全局生效');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ===== 积分商城表格列 =====
  const shopColumns = [
    {
      title: '图片', dataIndex: 'image', key: 'image', width: 80,
      render: (img: string) => img ? <img src={img} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} /> : <span style={{ color: '#ccc', fontSize: 12 }}>暂无</span>,
    },
    { title: '商品名', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '类型',
      dataIndex: 'itemType',
      key: 'itemType',
      width: 140,
      render: (t: string) => {
        const map: Record<string, string> = {
          physical_gift: '实物礼品',
        };
        return <Tag>{map[t] || t}</Tag>;
      },
    },
    { title: '面额', dataIndex: 'faceValue', key: 'faceValue', width: 80, render: (v: number) => v ? `¥${v}` : '-' },
    { title: '积分', dataIndex: 'needPoints', key: 'needPoints', width: 80 },
    { title: '库存', dataIndex: 'stock', key: 'stock', width: 60 },
    { title: '排序', dataIndex: 'sortWeight', key: 'sortWeight', width: 60 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: number, record: any) => (
        <Tag color={s === 1 ? 'green' : 'red'} style={{ cursor: 'pointer' }} onClick={() => handleToggleItem(record.id, s)}>
          {s === 1 ? '上架' : '下架'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => handleEditItem(record)}>编辑</Button>
          <Button size="small" danger onClick={() => handleDeleteItem(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  if (rangeLoading) {
    return <Card><div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div></Card>;
  }

  const tabItems = [
    {
      key: 'config',
      label: <span><SettingOutlined /> 活动配置</span>,
      children: (
        <>
          <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
            <Alert message="以下配置为运营商全局生效。修改后请点击保存。" type="info" showIcon style={{ marginBottom: 24 }} />
            <Spin spinning={loading}>
              <Divider><Space><GiftOutlined /> 新用户赠送</Space></Divider>
              <Form.Item
                name="welcome_deduction_cents"
                label="新用户注册赠送参赛抵扣卡（分）"
                rules={[{ required: true, message: '请输入抵扣金金额' }]}
                tooltip="单位：分。500分=5元。设为0则不赠送。"
              >
                <InputNumber min={0} max={50000} style={{ width: 200 }} addonAfter="分" />
              </Form.Item>

              <Divider><Space><GiftOutlined /> 好友助力活动</Space></Divider>
              <Form.Item name="help_enabled" label="开启助力活动" valuePropName="checked" tooltip="开启后玩家可在小程序中发起好友助力">
                <Switch />
              </Form.Item>
              <Space size={24} wrap>
                <Form.Item name="help_required_count" label="所需助力人数"
                  rules={[{ required: true, message: '请输入助力人数' }]}
                  tooltip={`总部范围: ${ranges.help_required_count?.min ?? 1}~${ranges.help_required_count?.max ?? 10}人`}
                >
                  <InputNumber min={ranges.help_required_count?.min ?? 1} max={ranges.help_required_count?.max ?? 10} style={{ width: 180 }} addonAfter="人" />
                </Form.Item>
                <Form.Item name="help_reward_count" label="发起者奖励参赛次数"
                  rules={[{ required: true, message: '请输入奖励参赛次数' }]}
                  tooltip={`总部范围: ${ranges.help_reward_count?.min ?? 1}~${ranges.help_reward_count?.max ?? 50}次`}
                >
                  <InputNumber min={ranges.help_reward_count?.min ?? 1} max={ranges.help_reward_count?.max ?? 50} style={{ width: 180 }} addonAfter="次" />
                </Form.Item>
              </Space>
            </Spin>
            <Form.Item>
              <Button type="primary" size="large" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                保存全部配置
              </Button>
            </Form.Item>
          </Form>
        </>
      ),
    },
    {
      key: 'announcement',
      label: <span><BellOutlined /> 首页公告</span>,
      children: (
        <div style={{ maxWidth: 520 }}>
          <Alert message="设置首页顶部滚动公告，纯文字，不超过30字。" type="info" showIcon style={{ marginBottom: 24 }} />
          <div style={{ marginBottom: 12 }}>
            <Text strong>公告内容</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>（{announcementText.length}/30）</Text>
          </div>
          <Input
            value={announcementText}
            onChange={e => setAnnouncementText(e.target.value)}
            maxLength={30}
            placeholder="输入公告内容，留空则不显示"
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveAnnouncement} loading={announcementSaving}>
            发布公告
          </Button>
        </div>
      ),
    },
    {
      key: 'shop',
      label: <span><ShopOutlined /> 积分商城设置</span>,
      children: (
        <>
          <Alert
            message="管理积分商城可兑换的商品。实物礼品需要线下核销。"
            type="info" showIcon style={{ marginBottom: 16 }}
          />
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem}>
              新增商品
            </Button>
            <Divider type="vertical" />
            <Space>
              <KeyOutlined />
              <Text strong>现场核销码：</Text>
              {redeemCodeLoading ? (
                <Spin size="small" />
              ) : redeemCode ? (
                <Tag color="green" style={{ fontSize: 18, padding: '4px 16px', fontFamily: 'monospace' }}>{redeemCode}</Tag>
              ) : (
                <Tag color="default">未设置</Tag>
              )}
              <Button size="small" type="dashed" onClick={handleCreateRedeemCode}>
                {redeemCode ? '重置新码' : '创建核销码'}
              </Button>
            </Space>
          </div>
          <Table
            dataSource={shopItems}
            columns={shopColumns}
            rowKey="id"
            loading={shopLoading}
            pagination={false}
            size="small"
          />
        </>
      ),
    },
  ];

  return (
    <Card
      title={<Space><SettingOutlined /> 营销管理</Space>}
      extra={
        hasData === false && (
          <Button type="primary" danger icon={<ThunderboltOutlined />} onClick={handleInitTemplates} loading={initLoading}>
            一键初始化
          </Button>
        )
      }
    >
      <Tabs items={tabItems} />

      {/* 编辑/新增商品弹窗 */}
      <Modal
        title={editingItem ? '编辑商品' : '新增商品'}
        open={editModalOpen}
        onOk={editingItem ? handleSaveItem : handleCreateItem}
        onCancel={() => setEditModalOpen(false)}
        okText={editingItem ? '保存' : '创建'}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="商品名称" rules={[{ required: true, message: '请输入商品名称' }]}>
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item name="itemType" label="商品类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select placeholder="请选择商品类型">
              <Select.Option value="physical_gift">实物礼品</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="itemId" label="备注">
            <Input placeholder="实物礼品描述信息" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="image" label="商品图片">
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="图片URL（也可点右侧上传按钮）" style={{ flex: 1 }} />
              <label style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 40, height: 32, background: '#1677ff', borderRadius: '0 6px 6px 0',
                cursor: 'pointer',
              }}>
                <UploadOutlined style={{ color: '#fff', fontSize: 16 }} />
                <input type="file" accept="image/*" onChange={handleImageUpload}
                  style={{ display: 'none' }} />
              </label>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="needPoints" label="所需积分" rules={[{ required: true, message: '请输入积分' }]}>
            <InputNumber min={1} max={999999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="faceValue" label="商品面额（元）">
            <InputNumber min={0} max={999999} precision={2} prefix="¥" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="stock" label="库存数量" rules={[{ required: true, message: '请输入库存数量' }]}>
            <InputNumber min={1} max={999999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sortWeight" label="排序权重（越小越靠前）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
