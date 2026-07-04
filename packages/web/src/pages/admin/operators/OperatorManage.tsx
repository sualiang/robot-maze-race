import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Modal, Form, Input,
  message, Popconfirm, Drawer, Descriptions, Badge, Select, Typography, Cascader,
} from 'antd';

const { Text } = Typography;
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, EyeOutlined, ReloadOutlined,
  StopOutlined, CheckCircleOutlined, DeleteOutlined, ShopOutlined,
} from '@ant-design/icons';
import AccountInfoModal from '../../../components/AccountInfoModal';
import api from '../../../utils/api';

interface OperatorItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  company_name: string;
  status: 'active' | 'disabled';
  venue_count: number;
  total_revenue: number;
  profit_share_rate: number;
  bank_account?: string;
  bank_name?: string;
  province?: string;
  city?: string;
  district?: string;
  company_address?: string;
  contact_person: string;
  created_at: string;
  updated_at: string;
  operator_username?: string;
  operator_password?: string;
}

interface RegionOption {
  value: string;
  label: string;
  children?: RegionOption[];
}

export default function OperatorManage() {
  const navigate = useNavigate();
  const [list, setList] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<OperatorItem | null>(null);
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm] = Form.useForm();
  const [form] = Form.useForm();

  // 地区数据（用于 Cascader）
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [defaultProfitRate, setDefaultProfitRate] = useState<number | undefined>(undefined);
  const [accountInfo, setAccountInfo] = useState<{ account: string; password: string } | null>(null);

  // 银行选择（手输模式）
  const COMMON_BANKS = [
    { value: '中国工商银行', label: '中国工商银行' },
    { value: '中国农业银行', label: '中国农业银行' },
    { value: '中国银行', label: '中国银行' },
    { value: '中国建设银行', label: '中国建设银行' },
    { value: '交通银行', label: '交通银行' },
    { value: '招商银行', label: '招商银行' },
    { value: '平安银行', label: '平安银行' },
    { value: '浦发银行', label: '浦发银行' },
    { value: '兴业银行', label: '兴业银行' },
    { value: '中信银行', label: '中信银行' },
    { value: '中国光大银行', label: '中国光大银行' },
    { value: '中国民生银行', label: '中国民生银行' },
    { value: '广发银行', label: '广发银行' },
    { value: '华夏银行', label: '华夏银行' },
    { value: '北京银行', label: '北京银行' },
    { value: '上海银行', label: '上海银行' },
    { value: '南京银行', label: '南京银行' },
    { value: '宁波银行', label: '宁波银行' },
    { value: '中国邮政储蓄银行', label: '中国邮政储蓄银行' },
    { value: '农村商业银行', label: '农村商业银行' },
    { value: '江苏银行', label: '江苏银行' },
    { value: '杭州银行', label: '杭州银行' },
    { other: true, value: '其他银行', label: '其他银行（手动输入）' },
  ];
  const [isOtherBank, setIsOtherBank] = useState(false);
  const [otherBankName, setOtherBankName] = useState('');
  const [profitRateLoaded, setProfitRateLoaded] = useState(false);

  // 从 localStorage 获取当前用户角色和权限
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const roleName: string = adminUser.role_name || adminUser.admin_role_name || '';
  const permissions: string[] = adminUser.permissions || [];
  const isSuperAdmin = roleName === 'super_admin' || permissions.includes('*');
  const canEdit = permissions.includes('*') || permissions.includes('operators:edit') || roleName === 'super_admin' || roleName === 'ops_admin';
  // 🔓 临时全部放开：菜单可见即可操作，后续按需收紧
  const canOperate = true;


  // 银行选择处理
  const handleBankChange = (value: string) => {
    if (value === '其他银行') {
      setIsOtherBank(true);
      form.setFieldValue('bank_name', otherBankName);
    } else {
      setIsOtherBank(false);
      setOtherBankName('');
      form.setFieldValue('bank_name', value);
    }
  };

  const handleOtherBankInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOtherBankName(val);
    form.setFieldValue('bank_name', val);
  };

  // 加载地区数据
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
    api.get('/admin/settings/profit-share-rate').then((res: any) => {
      // api.interceptors.response 已解包，res 即为后端 data 字段
      if (res?.rate != null) {
        setDefaultProfitRate(Number(res.rate));
      } else {
        setDefaultProfitRate(80);
      }
      setProfitRateLoaded(true);
    }).catch(() => { setDefaultProfitRate(80); setProfitRateLoaded(true); });
  }, []);

  // 检查登录状态
  const checkLogin = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoginVisible(true);
    }
    return !!token;
  }, []);

  const handleLogin = async () => {
    const values = await loginForm.validateFields();
    setLoginLoading(true);
    try {
      const resp = await fetch('/api/v1/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await resp.json();
      if (json.code === 0) {
        localStorage.setItem('token', json.data.token);
        message.success('登录成功');
        setLoginVisible(false);
        fetchList();
      } else {
        message.error(json.message || '登录失败');
      }
    } catch {
      message.error('登录失败，请检查后端是否运行');
    } finally {
      setLoginLoading(false);
    }
  };

  const fetchList = useCallback(async () => {
    if (!checkLogin()) return;
    setLoading(true);
    try {
      const res: any = await api.get('/admin/operators');
      setList(res?.list ?? res ?? []);
    } catch { setList([]); } finally { setLoading(false); }
  }, [checkLogin]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleAdd = canOperate ? () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      profit_share_rate: defaultProfitRate || 80,
      status: 'active',
    });
    setModalOpen(true);
  } : () => {};

  const handleEdit = canOperate ? (record: OperatorItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      // Cascader 回显：将 province/city/district 转成数组
      province_path: record.province
        ? [record.province, record.city, record.district].filter(Boolean)
        : undefined,
    });
    setModalOpen(true);
  } : () => {};

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      // 从 Cascader 数组拆出省/市/区
      const provPath = values.province_path || [];
      const payload = {
        ...values,
        province: provPath[0] || '',
        city: provPath[1] || '',
        district: provPath[2] || '',
      };
      delete payload.province_path;

      if (editingId) {
        await api.put(`/admin/operators/${editingId}`, payload);
        message.success('更新成功');
      } else {
        // 新建时不传分润比例，让后端从系统设置读取默认值
        const { profit_share_rate: _, ...createPayload } = payload;
        const res: any = await api.post('/admin/operators', createPayload);
        setAccountInfo({ account: res.account, password: res.password });
      }
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      if (err && typeof err === 'object' && Object.keys(err).length === 0) {
        // Ant Design form.validateFields() 校验失败抛出空对象 {}
        console.warn('[OperatorManage] 表单校验未通过，请检查必填项');
        message.warning('请检查表单填写内容');
      } else {
        const msg = err?.message || (typeof err === 'string' ? err : '操作失败');
        message.error(msg);
      }
    }
  };

  const handleToggleStatus = canOperate ? async (record: OperatorItem) => {
    const newStatus = record.status === 'active' ? 'disabled' : 'active';
    try {
      await api.patch(`/admin/operators/${record.id}`, { status: newStatus });
      message.success(newStatus === 'active' ? '已启用' : '已禁用');
      fetchList();
    } catch { message.error('操作失败'); }
  } : async () => {};

  const handleViewDetail = (record: OperatorItem) => {
    setDrawerItem(record);
    setDrawerOpen(true);
  };

  const columns: ColumnsType<OperatorItem> = [
    { title: '运营商名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '联系人', dataIndex: 'contact_person', key: 'contact_person', width: 100 },
    { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 130 },
    { title: '公司名称', dataIndex: 'company_name', key: 'company_name', width: 180, ellipsis: true },
    {
      title: '赛场数', dataIndex: 'venue_count', key: 'venue_count', width: 80,
      sorter: (a: OperatorItem, b: OperatorItem) => a.venue_count - b.venue_count,
    },
    {
      title: '累计营收', dataIndex: 'total_revenue', key: 'total_revenue', width: 120,
      render: (v: number) => `¥${(v / 100).toFixed(2)}`,
      sorter: (a: OperatorItem, b: OperatorItem) => a.total_revenue - b.total_revenue,
    },
    {
      title: '分润比例', dataIndex: 'profit_share_rate', key: 'profit_share_rate', width: 90,
      render: (v: number) => `${v}%`,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => (
        <Badge status={s === 'active' ? 'success' : 'error'} text={s === 'active' ? '正常' : '已禁用'} />
      ),
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right',
      render: (_: unknown, record: OperatorItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<ShopOutlined />} onClick={() => navigate(`/admin/operators/${record.id}/merchants`)}>
            商家
          </Button>
          {canOperate && (
            <Popconfirm
              title={record.status === 'active' ? '确定禁用该运营商？' : '确定启用该运营商？'}
              onConfirm={() => handleToggleStatus(record)}
            >
              <Button
                type="link" size="small"
                danger={record.status === 'active'}
                icon={record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
              >
                {record.status === 'active' ? '禁用' : '启用'}
              </Button>
            </Popconfirm>
          )}
          {isSuperAdmin && (
            <Popconfirm
              title="确定删除该运营商？此操作不可恢复！"
              onConfirm={async () => {
                try {
                  await api.delete(`/admin/operators/${record.id}`);
                  message.success('已删除');
                  fetchList();
                } catch (err: any) {
                  const msg = err?.message || err?.response?.data?.message || '删除失败';
                  message.error(msg);
                }
              }}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
          <Button type="link" size="small" icon={<ReloadOutlined />} onClick={async () => {
            try {
              const res: any = await api.post(`/admin/operators/${record.id}/reset-password`);
              setAccountInfo({ account: res.account, password: res.password });
            } catch (err: any) {
              const msg = err?.message || '密码重置失败';
              message.error(msg);
            }
          }}>
            重置密码
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* 登录弹窗 */}
      <Modal
        title="总部后台登录"
        open={loginVisible}
        closable={false}
        maskClosable={false}
        footer={
          <Button type="primary" loading={loginLoading} onClick={handleLogin}>
            登录
          </Button>
        }
        destroyOnClose
      >
        <Form form={loginForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="管理员账号" rules={[{ required: true }]}>
            <Input placeholder="admin" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password placeholder="admin123" />
          </Form.Item>
        </Form>
        <div style={{ color: '#999', fontSize: 12 }}>
          开发测试账号: admin / admin123
        </div>
      </Modal>

      <Card
        title={<span>运营商管理 <span style={{ fontSize: 13, color: '#999', fontWeight: 'normal' }}>（超级管理员账户）</span></span>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
            {canOperate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={!profitRateLoaded}>新建运营商</Button>}
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 家运营商` }}
        />
      </Card>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingId ? '编辑运营商' : '新建运营商'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={640}

        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* 顶部：设置登录用户名 */}
          <div style={{
            fontSize: 14, fontWeight: 600, marginBottom: 16,
            padding: '8px 16px', background: '#fafafa', borderLeft: '3px solid #1890ff',
            borderRadius: 2,
          }}>
            设置登录用户名
          </div>
          <Form.Item name="phone" label="登录账号" rules={[{ required: true }, { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' }]}>
            <Input placeholder="请用手机号码注册" style={{ width: 360 }} />
          </Form.Item>
          <div style={{
            fontSize: 14, fontWeight: 600, marginBottom: 16,
            padding: '8px 16px', background: '#fafafa', borderLeft: '3px solid #52c41a',
            borderRadius: 2,
          }}>
            运营商基础信息
          </div>
          <Space size={16}>
            <Form.Item name="name" label="运营商名称" rules={[{ required: true }]}>
              <Input placeholder="运营商名称" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="contact_person" label="联系人" rules={[{ required: true }]}>
              <Input placeholder="联系人姓名" style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="contact_phone" label="联系人手机号" rules={[{ required: true }, { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' }]}>
              <Input placeholder="手机号" style={{ width: 170 }} />
            </Form.Item>
          </Space>
          <Form.Item name="company_name" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}>
            <Input placeholder="公司全称" />
          </Form.Item>
          <Form.Item name="province_path" label="省/市/区" rules={[{ required: true, message: '请选择省市区' }]}>
            <Cascader
              placeholder="请选择省/市/区"
              options={regionOptions}
              changeOnSelect
              fieldNames={{ label: 'label', value: 'value', children: 'children' }}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="company_address" label="详细地址" rules={[{ required: true, message: '请输入详细地址' }]}>
            <Input placeholder="详细地址" />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="bank_name" label="开户行" rules={[{ required: true, message: '请选择或输入开户行' }]}>
              <Select
                placeholder="选择银行"
                style={{ width: 240 }}
                onChange={handleBankChange}
                options={COMMON_BANKS}
                allowClear
              />
            </Form.Item>
            {isOtherBank && (
              <Form.Item label=" " colon={false}>
                <Input
                  placeholder="手动输入银行名称"
                  style={{ width: 220 }}
                  value={otherBankName}
                  onChange={handleOtherBankInput}
                />
              </Form.Item>
            )}
          </Space>
          <Form.Item name="bank_branch" label="支行名称" rules={[{ required: true, message: '请输入支行名称' }]}>
            <Input placeholder="支行名称，如：解放碑支行" style={{ width: 480 }} />
          </Form.Item>
          <Form.Item name="bank_account" label="银行账号" rules={[{ required: true, message: '请输入银行账号' }]}>
            <Input placeholder="银行账号" style={{ width: 480 }} />
          </Form.Item>

          {/* 第三类：分润比例与状态信息 */}
          <div style={{
            fontSize: 14, fontWeight: 600, marginBottom: 16, marginTop: 24,
            padding: '8px 16px', background: '#fafafa', borderLeft: '3px solid #faad14',
            borderRadius: 2,
          }}>
            分润比例与状态信息
          </div>
          <Space size={16}>
            <Form.Item name="profit_share_rate" label="分润比例(%)" rules={[{ required: true }, { type: 'number', min: 0, max: 100, message: '分润比例应在0-100之间' }]}>
              <Select style={{ width: 160 }}
                options={[50, 60, 70, 75, 80, 85, 90].map(v => ({ value: v, label: `${v}%` }))}
                disabled
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select style={{ width: 120 }}
                options={[{ value: 'active', label: '正常' }, { value: 'disabled', label: '禁用' }]}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title="运营商详情"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
      >
        {drawerItem && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="运营商名称">{drawerItem.name}</Descriptions.Item>
            <Descriptions.Item label="联系人">{drawerItem.contact_person}</Descriptions.Item>
            <Descriptions.Item label="联系电话">{drawerItem.phone}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{drawerItem.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="公司名称">{drawerItem.company_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="省份">{drawerItem.province || '-'}</Descriptions.Item>
            <Descriptions.Item label="城市">{drawerItem.city || '-'}</Descriptions.Item>
            <Descriptions.Item label="区县">{drawerItem.district || '-'}</Descriptions.Item>
            <Descriptions.Item label="详细地址">{drawerItem.company_address || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Badge status={drawerItem.status === 'active' ? 'success' : 'error'}
                text={drawerItem.status === 'active' ? '正常' : '已禁用'} />
            </Descriptions.Item>
            <Descriptions.Item label="赛事数">{drawerItem.venue_count}</Descriptions.Item>
            <Descriptions.Item label="累计营收">
              ¥{(drawerItem.total_revenue / 100).toFixed(2)}
            </Descriptions.Item>
            <Descriptions.Item label="分润比例">{drawerItem.profit_share_rate}%</Descriptions.Item>
            <Descriptions.Item label="开户行">{drawerItem.bank_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="银行账号">{drawerItem.bank_account || '-'}</Descriptions.Item>
            <Descriptions.Item label="注册时间">
              {new Date(drawerItem.created_at).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {new Date(drawerItem.updated_at).toLocaleString('zh-CN')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <AccountInfoModal
        open={!!accountInfo}
        account={accountInfo?.account || ''}
        password={accountInfo?.password || ''}
        role="operator"
        onClose={() => setAccountInfo(null)}
      />
    </>
  );
}
