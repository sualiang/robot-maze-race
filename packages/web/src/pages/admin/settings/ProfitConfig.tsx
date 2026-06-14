import { useState, useEffect, useCallback } from 'react';
import { Card, Form, InputNumber, Button, message, Typography } from 'antd';
import { PercentageOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../../../utils/api';

const { Text } = Typography;

export default function ProfitConfig() {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchRate = useCallback(async () => {
    try {
      const data: any = await api.get('/admin/settings/profit-share-rate');
      if (data && data.rate !== undefined) {
        form.setFieldsValue({ rate: data.rate });
      }
    } catch {
      form.setFieldsValue({ rate: 80 });
    }
  }, [form]);

  useEffect(() => {
    fetchRate();
  }, [fetchRate]);

  const handleSave = async (values: { rate: number }) => {
    setLoading(true);
    try {
      const res: any = await api.put('/admin/settings/profit-share-rate', {
        ...values,
        syncToAll: true,
      });
      message.success(res?.message || '分润比例已更新');
    } catch {
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={
        <span><PercentageOutlined style={{ marginRight: 8 }} />分润比例设置</span>
      }
      style={{ maxWidth: 500 }}
    >
      <Form form={form} layout="vertical" onFinish={handleSave} style={{ maxWidth: 400 }}>
        <Form.Item
          name="rate"
          label="默认分润比例 (%)"
          rules={[
            { required: true, message: '请输入分润比例' },
            { type: 'number', min: 0, max: 100, message: '分润比例应在0-100之间' },
          ]}
        >
          <InputNumber min={0} max={100} style={{ width: 200 }} addonAfter="%" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
            保存
          </Button>
        </Form.Item>
        <div style={{ color: '#999', fontSize: 12, lineHeight: 1.6 }}>
          <Text type="secondary">
            此设置为全局默认分润比例，保存时将自动同步到所有已有运营商。
          </Text>
        </div>
      </Form>
    </Card>
  );
}
