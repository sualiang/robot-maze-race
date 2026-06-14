import { useState, useEffect } from 'react';
import {
  Card, Form, InputNumber, Button, Switch, message, Divider,
  Space, Spin, Alert, Table, Typography, Tabs, Row, Col,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SaveOutlined, GiftOutlined, ReloadOutlined, SettingOutlined,
  TeamOutlined, ThunderboltOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

const { Text } = Typography;

interface OperatorMarketing {
  id: string;
  operator_name: string;
  help_enabled: boolean;
  help_required_count: number;
  help_reward_count: number;
  help_coupon_enabled: boolean;
  help_coupon_bonus_count: number;
  recharge_coupon_enabled: boolean;
  recharge_coupon_bonus_count: number;
  recharge_coupon_trigger_races: number;
  updated_at: string;
}

export default function MarketingGlobal() {
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const roleName: string = adminUser.admin_role_name || '';
  const permissions: string[] = adminUser.permissions || [];
  const canEdit = permissions.includes('*') || permissions.includes('marketing:edit') || roleName === 'super_admin';
  // 🔓 临时全部放开：菜单可见即可操作
  const canOperate = true;

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [operators, setOperators] = useState<OperatorMarketing[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  useEffect(() => {
    setLoading(true);
    api.get('/admin/marketing/config')
      .then((data) => {
        if (data) {
          form.setFieldsValue(data);
        }
      })
      .catch(() => {
        form.setFieldsValue({
          help_default_enabled: true,
          help_required_count_min: 1,
          help_required_count_max: 10,
          help_required_count_default: 3,
          help_reward_count_min: 1,
          help_reward_count_max: 50,
          help_reward_count_default: 1,
          help_coupon_default_enabled: true,
          help_coupon_bonus_count_min: 1,
          help_coupon_bonus_count_max: 20,
          help_coupon_bonus_count_default: 2,
          help_coupon_valid_days_min: 1,
          help_coupon_valid_days_max: 90,
          help_coupon_valid_days_default: 15,
          recharge_coupon_default_enabled: true,
          recharge_coupon_bonus_count_min: 1,
          recharge_coupon_bonus_count_max: 30,
          recharge_coupon_bonus_count_default: 3,
          recharge_coupon_valid_days_min: 1,
          recharge_coupon_valid_days_max: 90,
          recharge_coupon_valid_days_default: 30,
          recharge_coupon_trigger_races_min: 1,
          recharge_coupon_trigger_races_max: 50,
          recharge_coupon_trigger_races_default: 3,
        });
      })
      .finally(() => setLoading(false));

    setOperatorsLoading(true);
    api.get('/admin/marketing/operators')
      .then((r: any) => {
        setOperators(r?.list ?? r ?? []);
      })
      .catch(() => setOperators([]))
      .finally(() => setOperatorsLoading(false));
  }, [form]);

  const handleSaveGlobal = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.put('/admin/marketing/config', values);
      message.success('全局营销配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const operatorColumns: ColumnsType<OperatorMarketing> = [
    { title: '运营商', dataIndex: 'operator_name', key: 'operator_name', width: 130 },
    {
      title: '助力活动', dataIndex: 'help_enabled', key: 'help_enabled', width: 80,
      render: (v: boolean) => v ? <span style={{ color: '#52c41a' }}>✓</span> : <span style={{ color: '#999' }}>✗</span>,
    },
    {
      title: '助力人数', dataIndex: 'help_required_count', key: 'help_required_count', width: 80,
      render: (v: number) => `${v}人`,
    },
    {
      title: '奖励次数', dataIndex: 'help_reward_count', key: 'help_reward_count', width: 80,
      render: (v: number) => `${v}次`,
    },
    {
      title: '助力券', dataIndex: 'help_coupon_enabled', key: 'help_coupon_enabled', width: 70,
      render: (v: boolean) => v ? <span style={{ color: '#52c41a' }}>✓</span> : <span style={{ color: '#999' }}>✗</span>,
    },
    {
      title: '助力券加成', dataIndex: 'help_coupon_bonus_count', key: 'help_coupon_bonus_count', width: 80,
      render: (v: number) => `${v ?? '-'}次`,
    },
    {
      title: '充值券', dataIndex: 'recharge_coupon_enabled', key: 'recharge_coupon_enabled', width: 70,
      render: (v: boolean) => v ? <span style={{ color: '#52c41a' }}>✓</span> : <span style={{ color: '#999' }}>✗</span>,
    },
    {
      title: '充值券加成', dataIndex: 'recharge_coupon_bonus_count', key: 'recharge_coupon_bonus_count', width: 80,
      render: (v: number) => `${v ?? '-'}次`,
    },
    {
      title: '触发次数', dataIndex: 'recharge_coupon_trigger_races', key: 'recharge_coupon_trigger_races', width: 80,
      render: (v: number) => `${v ?? '-'}次`,
    },
    {
      title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 150,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
  ];

  if (loading) {
    return <Card><div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div></Card>;
  }

  const tabItems = [
    {
      key: 'config',
      label: '全局营销参数范围',
      children: (
        <Card>
          <Form form={form} layout="vertical">
          <Alert
            message="总部在此设置营销活动的参数范围（最小值/最大值/默认值），各运营商可在自己的后台自定义具体数值。"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />
          <div style={{ maxWidth: 900 }}>
            {/* 助力活动 */}
            <Divider orientation="left">
              <Space><GiftOutlined /> 好友助力活动</Space>
            </Divider>

            <Form.Item name="help_default_enabled" label="默认开启助力活动" valuePropName="checked">
              <Switch />
            </Form.Item>

            <div style={{ paddingLeft: 24 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="help_required_count_min" label="所需助力人数(最小值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="人" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_required_count_max" label="所需助力人数(最大值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="人" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_required_count_default" label="所需助力人数(默认值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="人" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="help_reward_count_min" label="发起者奖励次数(最小值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_reward_count_max" label="发起者奖励次数(最大值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_reward_count_default" label="发起者奖励次数(默认值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* 膨胀券 — 好友助力赠送 */}
            <Divider orientation="left">
              <Space><TeamOutlined /> 膨胀券 · 好友助力赠送</Space>
              <Text type="secondary" style={{ fontSize: 12 }}>玩家通过邀请好友助力获得的膨胀券</Text>
            </Divider>

            <Form.Item name="help_coupon_default_enabled" label="默认开启好友助力赠送膨胀券" valuePropName="checked">
              <Switch />
            </Form.Item>

            <div style={{ paddingLeft: 24 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="help_coupon_bonus_count_min" label="赠送参赛次数(最小值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_coupon_bonus_count_max" label="赠送参赛次数(最大值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_coupon_bonus_count_default" label="赠送参赛次数(默认值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="help_coupon_valid_days_min" label="有效期(最小值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_coupon_valid_days_max" label="有效期(最大值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="help_coupon_valid_days_default" label="有效期(默认值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* 膨胀券 — 持续充值赠送 */}
            <Divider orientation="left">
              <Space><ReloadOutlined /> 膨胀券 · 持续充值赠送</Space>
              <Text type="secondary" style={{ fontSize: 12 }}>玩家累计参赛达到一定次数后系统自动赠送的膨胀券</Text>
            </Divider>

            <Form.Item name="recharge_coupon_default_enabled" label="默认开启持续充值赠送膨胀券" valuePropName="checked">
              <Switch />
            </Form.Item>

            <div style={{ paddingLeft: 24 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_bonus_count_min" label="赠送参赛次数(最小值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_bonus_count_max" label="赠送参赛次数(最大值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_bonus_count_default" label="赠送参赛次数(默认值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_valid_days_min" label="有效期(最小值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_valid_days_max" label="有效期(最大值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_valid_days_default" label="有效期(默认值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_trigger_races_min" label="触发参赛次数(最小值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_trigger_races_max" label="触发参赛次数(最大值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="recharge_coupon_trigger_races_default" label="触发参赛次数(默认值)" rules={[{ required: true }]}>
                    <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="次" />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {canOperate && (
              <Form.Item style={{ marginTop: 16 }}>
                <Button type="primary" size="large" icon={<SaveOutlined />} onClick={handleSaveGlobal} loading={saving}>
                  保存全局配置
                </Button>
              </Form.Item>
            )}
          </div>
          </Form>
        </Card>
      ),
    },
    {
      key: 'operators',
      label: '各运营商当前配置一览',
      children: (
        <Card
          title={null}
          extra={
            <Button onClick={() => {
              api.get('/admin/marketing/operators')
                .then((r: any) => setOperators(r?.list ?? r ?? []))
                .catch(() => {});
            }}>
              刷新
            </Button>
          }
        >
          <Table
            columns={operatorColumns}
            dataSource={operators}
            rowKey="id"
            loading={operatorsLoading}
            pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 家运营商` }}
            size="small"
            scroll={{ x: 900 }}
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
