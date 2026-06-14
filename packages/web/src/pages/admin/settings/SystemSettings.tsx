import { useState, useEffect } from 'react';
import {
  Card, Form, InputNumber, Button, Switch, message, Divider,
  Space, Spin, Tabs, Result,
} from 'antd';
import {
  SaveOutlined, SettingOutlined, PercentageOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';
import ProfitConfig from './ProfitConfig';

export default function SystemSettings() {
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const roleName: string = adminUser.admin_role_name || '';
  const permissions: string[] = adminUser.permissions || [];
  const isSuperAdmin = roleName === 'super_admin' || permissions.includes('*');

  // 非超级管理员显示403
  if (!isSuperAdmin) {
    return (
      <Card>
        <Result
          status="403"
          title="403"
          subTitle="抱歉，仅超级管理员可访问系统设置。"
        />
      </Card>
    );
  }

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/settings')
      .then((data) => {
        if (data) form.setFieldsValue(data);
      })
      .catch(() => {
        form.setFieldsValue({
          default_search_radius: 100,
          max_queue_size: 50,
          default_timeout_seconds: 300,
          checkin_enabled: true,
          help_enabled: true,
          coupon_enabled: true,
          gps_check_enabled: true,
          gps_check_radius: 500,
          auto_assign_venue: true,
          maintenance_mode: false,
          api_rate_limit: 100,
          max_race_per_day: 50,
        });
      })
      .finally(() => setLoading(false));
  }, [form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.put('/admin/settings', values);
      message.success('系统设置已保存，部分设置将在下次重启后生效');
    } catch (err: any) {
      if (err?.errorFields) {
        message.error('请检查表单，存在必填字段未填写或格式错误');
      } else if (err?.message) {
        message.error(err.message || '保存失败');
      } else {
        message.error('保存失败，请重试');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card><div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div></Card>;
  }

  const tabItems = [
    {
      key: 'system',
      label: <Space><SettingOutlined /> 系统设置</Space>,
      children: (
        <Form form={form} layout="vertical" style={{ maxWidth: 800 }}>
          {/* 基础参数 */}
          <Divider >基础参数</Divider>
          <Space size={24} wrap>
            <Form.Item name="default_search_radius" label="默认搜索半径(米)" rules={[{ required: true }]}>
              <InputNumber min={10} max={5000} style={{ width: 180 }} addonAfter="米" />
            </Form.Item>
            <Form.Item name="max_queue_size" label="最大排队人数" rules={[{ required: true }]}>
              <InputNumber min={1} max={200} style={{ width: 180 }} addonAfter="人" />
            </Form.Item>
          </Space>
          <Space size={24} wrap>
            <Form.Item name="default_timeout_seconds" label="默认超时时间" rules={[{ required: true }]}>
              <InputNumber min={30} max={600} style={{ width: 180 }} addonAfter="秒" />
            </Form.Item>
            <Form.Item name="max_race_per_day" label="每人每日最大参赛次数" rules={[{ required: true }]}>
              <InputNumber min={1} max={100} style={{ width: 180 }} addonAfter="次" />
            </Form.Item>
          </Space>
          <Form.Item name="api_rate_limit" label="API速率限制(次/分钟)" rules={[{ required: true }]}>
            <InputNumber min={10} max={10000} style={{ width: 220 }} addonAfter="次/分钟" />
          </Form.Item>

          {/* 功能开关 */}
          <Divider >功能开关</Divider>
          <Space size={48} wrap>
            <Form.Item name="checkin_enabled" label="签到功能" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="help_enabled" label="助力功能" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="coupon_enabled" label="膨胀券功能" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="auto_assign_venue" label="自动分配赛场" valuePropName="checked"
              tooltip="启用后系统根据GPS自动将裁判分配到最近赛场">
              <Switch />
            </Form.Item>
          </Space>

          {/* GPS & 安全 */}
          <Divider >GPS 与安全</Divider>
          <Space size={24} wrap>
            <Form.Item name="gps_check_enabled" label="GPS定位校验" valuePropName="checked"
              tooltip="裁判签到/签退时校验GPS位置">
              <Switch />
            </Form.Item>
            <Form.Item name="gps_check_radius" label="GPS校验半径(米)" rules={[{ required: true }]}
              tooltip="裁判在赛场该范围内才可签到">
              <InputNumber min={50} max={5000} style={{ width: 180 }} addonAfter="米" />
            </Form.Item>
          </Space>

          {/* 维护模式 */}
          <Divider >系统维护</Divider>
          <Form.Item name="maintenance_mode" label="维护模式" valuePropName="checked"
            tooltip="开启后仅管理员可访问，用户端显示维护提示">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Button type="primary" size="large" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              保存系统设置
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'profit',
      label: <Space><PercentageOutlined /> 分润配置</Space>,
      children: <ProfitConfig />,
    },
  ];

  return (
    <Card
      title={
        <Space><SettingOutlined /> 系统设置</Space>
      }
    >
      <Tabs items={tabItems} />
    </Card>
  );
}
