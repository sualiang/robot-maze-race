import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, InputNumber, Select, Button, Spin, message, Cascader } from 'antd';
import { VenueStatus } from '@robot-race/shared';
import api from '../../../utils/api';

interface RegionOption {
  value: string;
  label: string;
  children?: RegionOption[];
}

export default function VenueEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [defaultProfitRate, setDefaultProfitRate] = useState<number>(80);

  // 加载区域树
  useEffect(() => {
    fetch('/api/v1/operator/regions')
      .then(r => r.json())
      .then(json => {
        if (json.code === 0 && json.data) {
          const convert = (items: any[]): RegionOption[] =>
            items.map((item: any) => ({
              value: item.name,
              label: item.name,
              children: item.children ? convert(item.children) : undefined,
            }));
          setRegionOptions(convert(json.data));
        }
      })
      .catch(() => {});
  }, []);

  // 加载系统默认分润比例
  useEffect(() => {
    api.get('/operator/profit-share-rate').then((res: any) => {
      if (res?.rate != null) {
        setDefaultProfitRate(Number(res.rate));
      }
    }).catch(() => {});
  }, []);

  const fetchVenue = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data: any = await api.get(`/venues/${id}`);
      const venue = data?.venue ?? data ?? {};
      const formValues: any = { ...venue };
      if (venue.province || venue.city || venue.district) {
        formValues.province_path = [venue.province, venue.city, venue.district].filter(Boolean);
      }
      form.setFieldsValue(formValues);
    } catch {
      message.error('获取赛场信息失败');
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => { fetchVenue(); }, [fetchVenue]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const provPath = values.province_path || [];
    const payload = {
      ...values,
      profit_share_rate: values.profit_share_rate ?? defaultProfitRate,
      province: provPath[0] || '',
      city: provPath[1] || '',
      district: provPath[2] || '',
    };
    delete payload.province_path;
    setSaving(true);
    try {
      if (id) {
        await api.put(`/venues/${id}`, payload);
        message.success('保存成功');
      } else {
        // 新建模式暂不支持，跳转回列表
        message.warning('暂不支持新建赛场');
      }
      navigate('/operator/venues');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin tip="加载中..." style={{ display: 'block', marginTop: 80 }} />;

  return (
    <Card title={id ? '编辑赛场' : '新建赛场'} extra={<Button onClick={() => navigate('/operator/venues')}>返回列表</Button>}>
      <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
        <Form.Item name="name" label="赛场名称" rules={[{ required: true }]}>
          <Input maxLength={50} />
        </Form.Item>
        <Form.Item name="province_path" label="省/市/区" rules={[{ required: true, message: '请选择省市区' }]}>
          <Cascader
            placeholder="请选择省/市/区"
            style={{ width: 360 }}
            options={regionOptions}
            showSearch
          />
        </Form.Item>
        <Form.Item name="address" label="详细地址" rules={[{ required: true }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="open_time" label="营业开始" rules={[{ required: true }]}>
          <Input type="time" />
        </Form.Item>
        <Form.Item name="close_time" label="营业结束" rules={[{ required: true }]}>
          <Input type="time" />
        </Form.Item>
        <Form.Item name="max_capacity" label="排队上限" rules={[{ required: true }]}>
          <InputNumber min={1} max={200} style={{ width: 120 }} disabled />
        </Form.Item>
        <Form.Item name="profit_share_rate" label="分润比例(%)" initialValue={defaultProfitRate}
          rules={[{ required: true }, { type: 'number', min: 0, max: 100, message: '分润比例应在0-100之间' }]}>
          <InputNumber min={0} max={100} style={{ width: 120 }} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            options={[
              { value: VenueStatus.OPEN, label: '运营中' },
              { value: VenueStatus.CLOSED, label: '已关闭' },
              { value: VenueStatus.MAINTENANCE, label: '维护中' },
            ]}
          />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} maxLength={500} />
        </Form.Item>
        <Button type="primary" onClick={handleSave} loading={saving}>
          保存
        </Button>
      </Form>
    </Card>
  );
}
