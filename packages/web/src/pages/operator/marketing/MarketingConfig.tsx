import { useState, useEffect } from 'react';
import {
  Card, Form, Switch, InputNumber, Button, Space,
  Divider, message, Spin, Alert, Descriptions, Typography,
} from 'antd';
import {
  SaveOutlined, GiftOutlined, ThunderboltOutlined, SettingOutlined,
  TeamOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

const { Text } = Typography;

interface Range {
  min: number;
  max: number;
  default: number;
}

export default function MarketingConfig() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 总部范围
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [rangeLoading, setRangeLoading] = useState(true);

  // 读取总部范围
  useEffect(() => {
    api.get('/operator/marketing/range')
      .then((data: any) => {
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
            help_coupon_bonus_count: {
              min: data.help_coupon_bonus_count_min || 1,
              max: data.help_coupon_bonus_count_max || 20,
              default: data.help_coupon_bonus_count_default || 2,
            },
            help_coupon_valid_days: {
              min: data.help_coupon_valid_days_min || 1,
              max: data.help_coupon_valid_days_max || 90,
              default: data.help_coupon_valid_days_default || 15,
            },
            recharge_coupon_bonus_count: {
              min: data.recharge_coupon_bonus_count_min || 1,
              max: data.recharge_coupon_bonus_count_max || 30,
              default: data.recharge_coupon_bonus_count_default || 3,
            },
            recharge_coupon_valid_days: {
              min: data.recharge_coupon_valid_days_min || 1,
              max: data.recharge_coupon_valid_days_max || 90,
              default: data.recharge_coupon_valid_days_default || 30,
            },
            recharge_coupon_trigger_races: {
              min: data.recharge_coupon_trigger_races_min || 1,
              max: data.recharge_coupon_trigger_races_max || 50,
              default: data.recharge_coupon_trigger_races_default || 3,
            },
          });
        }
      })
      .finally(() => setRangeLoading(false));
  }, []);

  // 加载已有配置或默认值
  useEffect(() => {
    if (rangeLoading || Object.keys(ranges).length === 0) return;

    setLoading(true);
    // 不传 venue_id，获取运营商的全局配置
    function applyDefaultValues() {
      return {
        help_enabled: true,
        help_required_count: ranges.help_required_count?.default ?? 3,
        help_reward_count: ranges.help_reward_count?.default ?? 1,
        help_coupon_enabled: true,
        help_coupon_bonus_count: ranges.help_coupon_bonus_count?.default ?? 2,
        help_coupon_valid_days: ranges.help_coupon_valid_days?.default ?? 15,
        recharge_coupon_enabled: true,
        recharge_coupon_bonus_count: ranges.recharge_coupon_bonus_count?.default ?? 3,
        recharge_coupon_valid_days: ranges.recharge_coupon_valid_days?.default ?? 30,
        recharge_coupon_trigger_races: ranges.recharge_coupon_trigger_races?.default ?? 3,
      };
    }

    api.get('/operator/marketing')
      .then((rows: any) => {
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
          if (config.help_coupon_enabled !== undefined) fields.help_coupon_enabled = config.help_coupon_enabled === 'true';
          if (config.help_coupon_bonus_count !== undefined) fields.help_coupon_bonus_count = Number(config.help_coupon_bonus_count);
          if (config.help_coupon_valid_days !== undefined) fields.help_coupon_valid_days = Number(config.help_coupon_valid_days);
          if (config.recharge_coupon_enabled !== undefined) fields.recharge_coupon_enabled = config.recharge_coupon_enabled === 'true';
          if (config.recharge_coupon_bonus_count !== undefined) fields.recharge_coupon_bonus_count = Number(config.recharge_coupon_bonus_count);
          if (config.recharge_coupon_valid_days !== undefined) fields.recharge_coupon_valid_days = Number(config.recharge_coupon_valid_days);
          if (config.recharge_coupon_trigger_races !== undefined) fields.recharge_coupon_trigger_races = Number(config.recharge_coupon_trigger_races);
        }
        form.setFieldsValue(fields);
      })
      .catch(() => {
        form.setFieldsValue(applyDefaultValues());
      })
      .finally(() => setLoading(false));
  }, [ranges, rangeLoading]);

  const handleSave = async () => {
    const values = await form.validateFields();

    // 前端校验范围
    const checks: { key: string; val: number; range: Range; label: string }[] = [
      { key: 'help_required_count', val: values.help_required_count, range: ranges.help_required_count, label: '所需助力人数' },
      { key: 'help_reward_count', val: values.help_reward_count, range: ranges.help_reward_count, label: '发起者奖励次数' },
      { key: 'help_coupon_bonus_count', val: values.help_coupon_bonus_count, range: ranges.help_coupon_bonus_count, label: '好友助力赠送次数' },
      { key: 'help_coupon_valid_days', val: values.help_coupon_valid_days, range: ranges.help_coupon_valid_days, label: '助力券有效期' },
      { key: 'recharge_coupon_bonus_count', val: values.recharge_coupon_bonus_count, range: ranges.recharge_coupon_bonus_count, label: '持续充值赠送次数' },
      { key: 'recharge_coupon_valid_days', val: values.recharge_coupon_valid_days, range: ranges.recharge_coupon_valid_days, label: '充值券有效期' },
      { key: 'recharge_coupon_trigger_races', val: values.recharge_coupon_trigger_races, range: ranges.recharge_coupon_trigger_races, label: '触发参赛次数' },
    ];
    for (const c of checks) {
      if (c.range && (c.val < c.range.min || c.val > c.range.max)) {
        message.error(`${c.label} 必须在 ${c.range.min}~${c.range.max} 之间`);
        return;
      }
    }

    setSaving(true);
    try {
      const configs = [
        { key: 'help_enabled', value: String(values.help_enabled) },
        { key: 'help_required_count', value: String(values.help_required_count) },
        { key: 'help_reward_count', value: String(values.help_reward_count) },
        { key: 'help_coupon_enabled', value: String(values.help_coupon_enabled) },
        { key: 'help_coupon_bonus_count', value: String(values.help_coupon_bonus_count) },
        { key: 'help_coupon_valid_days', value: String(values.help_coupon_valid_days) },
        { key: 'recharge_coupon_enabled', value: String(values.recharge_coupon_enabled) },
        { key: 'recharge_coupon_bonus_count', value: String(values.recharge_coupon_bonus_count) },
        { key: 'recharge_coupon_valid_days', value: String(values.recharge_coupon_valid_days) },
        { key: 'recharge_coupon_trigger_races', value: String(values.recharge_coupon_trigger_races) },
      ];
      // 不传 venue_id，保存为运营商全局配置
      await api.post('/operator/marketing/batch', { configs });
      message.success('营销配置已保存，对所有赛场全局生效');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (rangeLoading) {
    return <Card><div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div></Card>;
  }

  return (
    <Card
      title={
        <Space><SettingOutlined /> 营销管理</Space>
      }
      extra={
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存配置
        </Button>
      }
    >
      <Alert
        message="以下配置为运营商全局生效，不按单个赛场区分。修改后保存即可。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
        <Spin spinning={loading}>

          {/* 好友助力活动 */}
          <Divider >
            <Space><GiftOutlined /> 好友助力活动</Space>
          </Divider>

          <Form.Item name="help_enabled" label="开启助力活动" valuePropName="checked" tooltip="开启后玩家可在小程序中发起好友助力">
            <Switch />
          </Form.Item>

          <Space size={24} wrap>
            <Form.Item
              name="help_required_count"
              label="所需助力人数"
              rules={[{ required: true, message: '请输入助力人数' }]}
              tooltip={`总部范围: ${ranges.help_required_count?.min ?? 1}~${ranges.help_required_count?.max ?? 10}人`}
            >
              <InputNumber
                min={ranges.help_required_count?.min ?? 1}
                max={ranges.help_required_count?.max ?? 10}
                style={{ width: 180 }}
                addonAfter="人"
              />
            </Form.Item>

            <Form.Item
              name="help_reward_count"
              label="发起者奖励参赛次数"
              rules={[{ required: true, message: '请输入奖励参赛次数' }]}
              tooltip={`总部范围: ${ranges.help_reward_count?.min ?? 1}~${ranges.help_reward_count?.max ?? 50}次`}
            >
              <InputNumber
                min={ranges.help_reward_count?.min ?? 1}
                max={ranges.help_reward_count?.max ?? 50}
                style={{ width: 180 }}
                addonAfter="次"
              />
            </Form.Item>
          </Space>

          {/* 膨胀券 — 好友助力赠送 */}
          <Divider >
            <Space><TeamOutlined /> 膨胀券 · 好友助力赠送</Space>
            <Text type="secondary" style={{ fontSize: 12 }}>玩家助力后获得的膨胀券</Text>
          </Divider>

          <Form.Item name="help_coupon_enabled" label="开启好友助力赠送膨胀券" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Space size={24} wrap>
            <Form.Item
              name="help_coupon_bonus_count"
              label="赠送参赛次数"
              rules={[{ required: true }]}
              tooltip={`总部范围: ${ranges.help_coupon_bonus_count?.min ?? 1}~${ranges.help_coupon_bonus_count?.max ?? 20}次`}
            >
              <InputNumber
                min={ranges.help_coupon_bonus_count?.min ?? 1}
                max={ranges.help_coupon_bonus_count?.max ?? 20}
                style={{ width: 180 }}
                addonAfter="次"
              />
            </Form.Item>
            <Form.Item
              name="help_coupon_valid_days"
              label="有效期"
              rules={[{ required: true }]}
              tooltip={`总部范围: ${ranges.help_coupon_valid_days?.min ?? 1}~${ranges.help_coupon_valid_days?.max ?? 90}天`}
            >
              <InputNumber
                min={ranges.help_coupon_valid_days?.min ?? 1}
                max={ranges.help_coupon_valid_days?.max ?? 90}
                style={{ width: 160 }}
                addonAfter="天"
              />
            </Form.Item>
          </Space>

          {/* 膨胀券 — 持续充值赠送 */}
          <Divider >
            <Space><ReloadOutlined /> 膨胀券 · 持续充值赠送</Space>
            <Text type="secondary" style={{ fontSize: 12 }}>玩家累计参赛一定次数后自动获得</Text>
          </Divider>

          <Form.Item name="recharge_coupon_enabled" label="开启持续充值赠送膨胀券" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Space size={24} wrap>
            <Form.Item
              name="recharge_coupon_bonus_count"
              label="赠送参赛次数"
              rules={[{ required: true }]}
              tooltip={`总部范围: ${ranges.recharge_coupon_bonus_count?.min ?? 1}~${ranges.recharge_coupon_bonus_count?.max ?? 30}次`}
            >
              <InputNumber
                min={ranges.recharge_coupon_bonus_count?.min ?? 1}
                max={ranges.recharge_coupon_bonus_count?.max ?? 30}
                style={{ width: 180 }}
                addonAfter="次"
              />
            </Form.Item>
            <Form.Item
              name="recharge_coupon_valid_days"
              label="有效期"
              rules={[{ required: true }]}
              tooltip={`总部范围: ${ranges.recharge_coupon_valid_days?.min ?? 1}~${ranges.recharge_coupon_valid_days?.max ?? 90}天`}
            >
              <InputNumber
                min={ranges.recharge_coupon_valid_days?.min ?? 1}
                max={ranges.recharge_coupon_valid_days?.max ?? 90}
                style={{ width: 160 }}
                addonAfter="天"
              />
            </Form.Item>
            <Form.Item
              name="recharge_coupon_trigger_races"
              label="触发参赛次数"
              rules={[{ required: true }]}
              tooltip={`总部范围: ${ranges.recharge_coupon_trigger_races?.min ?? 1}~${ranges.recharge_coupon_trigger_races?.max ?? 50}次`}
            >
              <InputNumber
                min={ranges.recharge_coupon_trigger_races?.min ?? 1}
                max={ranges.recharge_coupon_trigger_races?.max ?? 50}
                style={{ width: 180 }}
                addonAfter="次"
              />
            </Form.Item>
          </Space>

          <Descriptions size="small" bordered style={{ marginBottom: 24, marginTop: 16 }}>
            <Descriptions.Item label="券类型说明">
              好友助力赠送券：玩家通过邀请好友助力后获得的膨胀券，购买参赛包时可额外增加参赛次数。
              持续充值赠送券：玩家累计参赛达到触发次数后系统自动赠送，购买参赛包时可额外增加参赛次数。
            </Descriptions.Item>
          </Descriptions>

        </Spin>

        <Form.Item>
          <Button type="primary" size="large" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            保存全部配置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
