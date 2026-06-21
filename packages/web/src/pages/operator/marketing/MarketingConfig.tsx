import { useState, useEffect } from 'react';
import {
  Card, Form, Switch, InputNumber, Button, Space,
  Divider, message, Spin, Alert, Typography, Descriptions,
} from 'antd';
import {
  SaveOutlined, GiftOutlined, SettingOutlined, TrophyOutlined,
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

  // 赛季奖励参数（只读，来自总部配置）
  const [seasonConfig, setSeasonConfig] = useState<Record<string, any> | null>(null);
  const [seasonConfigLoading, setSeasonConfigLoading] = useState(false);

  // 总部范围
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [rangeLoading, setRangeLoading] = useState(true);

  // 赛季奖励参数暂未实现，注释掉避免 404 错误
  // useEffect(() => {
  //   api.get('/operator/marketing/season-rewards')
  //     .then((data: any) => {
  //       if (data) setSeasonConfig(data);
  //     })
  //     .catch(() => {})
  //     .finally(() => setSeasonConfigLoading(false));
  // }, []);

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
        welcome_deduction_cents: 500,
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
          if (config.welcome_deduction_cents !== undefined) fields.welcome_deduction_cents = Number(config.welcome_deduction_cents);
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
        { key: 'welcome_deduction_cents', value: String(values.welcome_deduction_cents) },
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

          {/* 赛季奖励参数卡片（只读） */}
          {seasonConfig && (
            <Card
              size="small"
              title={<Space><TrophyOutlined /> 赛季奖励参数（只读 · 总部配置）</Space>}
              style={{ marginBottom: 24, background: '#fafafa' }}
            >
              <Descriptions column={3} size="small" bordered>
                <Descriptions.Item label="单场比赛经验">{seasonConfig.season_race_exp ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="商家签到经验">{seasonConfig.season_checkin_exp ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="单场积分">{seasonConfig.season_race_points ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="商家签到积分">{seasonConfig.season_checkin_points ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="日榜第1名积分">{seasonConfig.season_daily_rank_1 ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="日榜第2-5名积分">{seasonConfig.season_daily_rank_2_5 ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="日榜第6-10名积分">{seasonConfig.season_daily_rank_6_10 ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="39元档购包经验">{seasonConfig.season_pack_exp_39 ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="99元档购包经验">{seasonConfig.season_pack_exp_99 ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="199元档购包经验">{seasonConfig.season_pack_exp_199 ?? '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        <Spin spinning={loading}>

          {/* 好友助力活动 */}
          {/* 新用户赠送参赛抵扣金 */}
        <Divider>
          <Space><GiftOutlined /> 新用户赠送</Space>
        </Divider>

        <Form.Item
          name="welcome_deduction_cents"
          label="新用户注册赠送参赛抵扣金（分）"
          rules={[{ required: true, message: '请输入抵扣金金额' }]}
          tooltip="单位：分。500分=5元。设为0则不赠送。"
        >
          <InputNumber
            min={0}
            max={50000}
            style={{ width: 200 }}
            addonAfter="分"
          />
        </Form.Item>

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
