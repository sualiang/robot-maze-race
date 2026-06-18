import { useState, useEffect, useCallback } from 'react';
import { Modal, message } from 'antd';
import merchantApi from '../../../utils/merchant-api';
import './styles.css';

// 临时定义类型
interface CouponItem {
  id: string;
  name: string;
  type: 'full_reduce' | 'direct_reduce' | 'no_threshold' | 'discount';
  value: number;
  discount: number;
  min_amount: number;
  total_stock: number;
  limit_per_user: number;
  expiry_type: 'fixed' | 'days';
  expiry_start: string;
  expiry_end: string;
  expiry_days: number;
  channels: string[];
  usage_rule: string;
  status: 'pending' | 'active' | 'rejected' | 'offline';
  reject_reason: string;
  used_count: number;
  created_at: string;
}

type TabKey = 'all' | 'pending' | 'active' | 'rejected' | 'offline';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'active', label: '已上架' },
  { key: 'rejected', label: '已驳回' },
  { key: 'offline', label: '已下架' },
];

const typeLabels: Record<string, string> = {
  full_reduce: '满减券',
  direct_reduce: '立减券',
  no_threshold: '无门槛券',
  discount: '折扣券',
};

const typeClassMap: Record<string, string> = {
  full_reduce: 'mch-coupon-type-full',
  direct_reduce: 'mch-coupon-type-reduce',
  no_threshold: 'mch-coupon-type-nothreshold',
  discount: 'mch-coupon-type-discount',
};

const statusLabels: Record<string, string> = {
  pending: '待审核',
  active: '已上架',
  rejected: '已驳回',
  offline: '已下架',
};

const statusClassMap: Record<string, string> = {
  pending: 'mch-coupon-status-pending',
  active: 'mch-coupon-status-active',
  rejected: 'mch-coupon-status-rejected',
  offline: 'mch-coupon-status-offline',
};

export default function CouponManage() {
  const [list, setList] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单状态
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('full_reduce');
  const [formValue, setFormValue] = useState<number | undefined>(undefined);
  const [formDiscount, setFormDiscount] = useState<number | undefined>(undefined);
  const [formMinAmount, setFormMinAmount] = useState<number | undefined>(undefined);
  const [formTotalStock, setFormTotalStock] = useState<number | undefined>(undefined);
  const [formLimitPerUser, setFormLimitPerUser] = useState(1);
  const [formExpiryType, setFormExpiryType] = useState<'fixed' | 'days'>('fixed');
  const [formExpiryStart, setFormExpiryStart] = useState('');
  const [formExpiryEnd, setFormExpiryEnd] = useState('');
  const [formExpiryDays, setFormExpiryDays] = useState<number | undefined>(undefined);
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [formUsageRule, setFormUsageRule] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await merchantApi.get('/merchant/coupon/list');
      setList(data?.list ?? data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const filteredList = activeTab === 'all' ? list : list.filter((c) => c.status === activeTab);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormType('full_reduce');
    setFormValue(undefined);
    setFormDiscount(undefined);
    setFormMinAmount(undefined);
    setFormTotalStock(undefined);
    setFormLimitPerUser(1);
    setFormExpiryType('fixed');
    setFormExpiryStart('');
    setFormExpiryEnd('');
    setFormExpiryDays(undefined);
    setFormChannels([]);
    setFormUsageRule('');
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (item: CouponItem) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormType(item.type);
    setFormValue(item.value);
    setFormDiscount(item.discount);
    setFormMinAmount(item.min_amount);
    setFormTotalStock(item.total_stock);
    setFormLimitPerUser(item.limit_per_user);
    setFormExpiryType(item.expiry_type);
    setFormExpiryStart(item.expiry_start || '');
    setFormExpiryEnd(item.expiry_end || '');
    setFormExpiryDays(item.expiry_days);
    setFormChannels(item.channels || []);
    setFormUsageRule(item.usage_rule || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    // 基础校验
    if (!formName.trim()) { message.error('请输入券名称'); return; }
    if (formType === 'discount') {
      if (!formDiscount || formDiscount < 1 || formDiscount > 99) { message.error('请输入正确的折扣（1-99）'); return; }
    } else {
      if (!formValue || formValue <= 0) { message.error('请输入面值'); return; }
    }
    if ((formType === 'full_reduce' || formType === 'direct_reduce') && (!formMinAmount || formMinAmount <= 0)) {
      message.error('请输入最低消费金额');
      return;
    }
    if (!formTotalStock || formTotalStock <= 0) { message.error('请输入总库存'); return; }
    if (formExpiryType === 'fixed' && (!formExpiryStart || !formExpiryEnd)) { message.error('请选择有效期范围'); return; }
    if (formExpiryType === 'days' && (!formExpiryDays || formExpiryDays <= 0)) { message.error('请输入有效天数'); return; }

    const payload: Record<string, unknown> = {
      name: formName.trim(),
      type: formType,
      total_stock: formTotalStock,
      limit_per_user: formLimitPerUser,
      expiry_type: formExpiryType,
      channels: formChannels,
      usage_rule: formUsageRule.trim(),
    };

    if (formType === 'discount') {
      payload.discount = formDiscount;
    } else {
      payload.value = formValue;
    }
    if (formType === 'full_reduce' || formType === 'direct_reduce') {
      payload.min_amount = formMinAmount;
    }
    if (formExpiryType === 'fixed') {
      payload.expiry_start = formExpiryStart;
      payload.expiry_end = formExpiryEnd;
    } else {
      payload.expiry_days = formExpiryDays;
    }

    setSaving(true);
    try {
      if (editingId) {
        await merchantApi.put(`/merchant/coupon/${editingId}`, payload);
        message.success('优惠券已更新');
      } else {
        await merchantApi.post('/merchant/coupon/create', payload);
        message.success('优惠券已创建');
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确定删除该优惠券？',
      content: '删除后不可恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await merchantApi.delete(`/merchant/coupon/${id}`);
          message.success('已删除');
          fetchList();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleToggleStatus = async (id: string, targetStatus: string) => {
    try {
      await merchantApi.post(`/merchant/coupon/${id}/${targetStatus === 'active' ? 'online' : 'offline'}`);
      message.success(targetStatus === 'active' ? '已上架' : '已下架');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const getTypeClass = (type: string) => typeClassMap[type] || '';
  const getStatusClass = (status: string) => statusClassMap[status] || '';

  const handleChannelToggle = (channel: string) => {
    setFormChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  return (
    <div className="mch-coupon-page">
      {/* 顶部Tab */}
      <div className="mch-coupon-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`mch-coupon-tab-item ${activeTab === tab.key ? 'mch-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 创建按钮 */}
      <div className="mch-coupon-actions">
        <button className="mch-coupon-create-btn" onClick={openCreateModal}>
          创建新优惠券
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>加载中...</div>
      ) : filteredList.length === 0 ? (
        <div className="mch-empty-state">
          <div>暂无优惠券</div>
        </div>
      ) : (
        filteredList.map((coupon) => (
          <div key={coupon.id} className="mch-coupon-card">
            <div className="mch-coupon-card-header">
              <span className="mch-coupon-name">{coupon.name}</span>
              <span className={`mch-coupon-type-tag ${getTypeClass(coupon.type)}`}>
                {typeLabels[coupon.type] || coupon.type}
              </span>
            </div>

            <div className="mch-coupon-card-body">
              <div className="mch-coupon-info-item">
                面值: <strong>{coupon.type === 'discount' ? `${coupon.discount}折` : `¥${coupon.value}`}</strong>
              </div>
              <div className="mch-coupon-info-item">
                库存: <strong>{coupon.used_count || 0}/{coupon.total_stock}</strong>
              </div>
              <div className="mch-coupon-info-item">
                有效期: <strong>{coupon.expiry_type === 'fixed'
                  ? `${coupon.expiry_start?.slice(0, 10) || ''}~${coupon.expiry_end?.slice(0, 10) || ''}`
                  : `领取后${coupon.expiry_days}天`}
                </strong>
              </div>
              <div className="mch-coupon-info-item">
                每人限领: <strong>{coupon.limit_per_user}张</strong>
              </div>
            </div>

            <div className="mch-coupon-card-footer">
              <span className={`mch-coupon-status-tag ${getStatusClass(coupon.status)}`}>
                {statusLabels[coupon.status] || coupon.status}
                {coupon.status === 'rejected' && coupon.reject_reason && (
                  <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.6 }} title={coupon.reject_reason}>
                    ⓘ
                  </span>
                )}
              </span>

              <div className="mch-coupon-actions-row">
                {(coupon.status === 'pending' || coupon.status === 'rejected') && (
                  <>
                    <button
                      className="mch-coupon-action-btn mch-coupon-action-edit"
                      onClick={() => openEditModal(coupon)}
                    >
                      编辑
                    </button>
                    <button
                      className="mch-coupon-action-btn mch-coupon-action-delete"
                      onClick={() => handleDelete(coupon.id)}
                    >
                      删除
                    </button>
                  </>
                )}
                {coupon.status === 'active' && (
                  <button
                    className="mch-coupon-action-btn mch-coupon-action-offline"
                    onClick={() => handleToggleStatus(coupon.id, 'offline')}
                  >
                    下架
                  </button>
                )}
                {coupon.status === 'offline' && (
                  <button
                    className="mch-coupon-action-btn mch-coupon-action-online"
                    onClick={() => handleToggleStatus(coupon.id, 'active')}
                  >
                    上架
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* 创建/编辑 Modal */}
      {modalOpen && (
        <div className="mch-modal-overlay">
          <div className="mch-modal-content">
            <div className="mch-modal-title">{editingId ? '编辑优惠券' : '创建优惠券'}</div>

            <div className="mch-form-group">
              <label className="mch-form-label">券名称</label>
              <input
                className="mch-form-input"
                placeholder="请输入优惠券名称"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">券类型</label>
              <select
                className="mch-form-select"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="full_reduce">满减券</option>
                <option value="direct_reduce">立减券</option>
                <option value="no_threshold">无门槛券</option>
                <option value="discount">折扣券</option>
              </select>
            </div>

            {formType === 'discount' ? (
              <div className="mch-form-group">
                <label className="mch-form-label">折扣 (1-99)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="mch-form-input"
                    type="number"
                    min={1}
                    max={99}
                    placeholder="如 85 表示85折"
                    value={formDiscount ?? ''}
                    onChange={(e) => setFormDiscount(e.target.value ? Number(e.target.value) : undefined)}
                  />
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>折</span>
                </div>
              </div>
            ) : (
              <div className="mch-form-group">
                <label className="mch-form-label">面值（元）</label>
                <input
                  className="mch-form-input"
                  type="number"
                  min={0.01}
                  step={0.01}
                  placeholder="请输入面值"
                  value={formValue ?? ''}
                  onChange={(e) => setFormValue(e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
            )}

            {(formType === 'full_reduce' || formType === 'direct_reduce') && (
              <div className="mch-form-group">
                <label className="mch-form-label">最低消费金额（元）</label>
                <input
                  className="mch-form-input"
                  type="number"
                  min={0.01}
                  step={0.01}
                  placeholder="请输入最低消费金额"
                  value={formMinAmount ?? ''}
                  onChange={(e) => setFormMinAmount(e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
            )}

            <div className="mch-form-row">
              <div className="mch-form-group">
                <label className="mch-form-label">总库存</label>
                <input
                  className="mch-form-input"
                  type="number"
                  min={1}
                  placeholder="库存数量"
                  value={formTotalStock ?? ''}
                  onChange={(e) => setFormTotalStock(e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
              <div className="mch-form-group">
                <label className="mch-form-label">每人限领</label>
                <input
                  className="mch-form-input"
                  type="number"
                  min={1}
                  placeholder="默认1"
                  value={formLimitPerUser}
                  onChange={(e) => setFormLimitPerUser(Number(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">有效期</label>
              <div className="mch-expiry-options">
                <div
                  className={`mch-expiry-option ${formExpiryType === 'fixed' ? 'mch-expiry-active' : ''}`}
                  onClick={() => setFormExpiryType('fixed')}
                >
                  固定日期
                </div>
                <div
                  className={`mch-expiry-option ${formExpiryType === 'days' ? 'mch-expiry-active' : ''}`}
                  onClick={() => setFormExpiryType('days')}
                >
                  领取后N天
                </div>
              </div>

              {formExpiryType === 'fixed' ? (
                <div className="mch-form-row">
                  <div className="mch-form-group">
                    <input
                      className="mch-form-input"
                      type="date"
                      value={formExpiryStart}
                      onChange={(e) => setFormExpiryStart(e.target.value)}
                    />
                  </div>
                  <div className="mch-form-group">
                    <input
                      className="mch-form-input"
                      type="date"
                      value={formExpiryEnd}
                      onChange={(e) => setFormExpiryEnd(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="mch-form-input"
                    type="number"
                    min={1}
                    placeholder="有效天数"
                    value={formExpiryDays ?? ''}
                    onChange={(e) => setFormExpiryDays(e.target.value ? Number(e.target.value) : undefined)}
                    style={{ width: 120 }}
                  />
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>天</span>
                </div>
              )}
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">投放渠道</label>
              <div className="mch-form-checkbox-group">
                <label className="mch-form-checkbox">
                  <input
                    type="checkbox"
                    checked={formChannels.includes('lottery')}
                    onChange={() => handleChannelToggle('lottery')}
                  />
                  积分抽奖池
                </label>
                <label className="mch-form-checkbox">
                  <input
                    type="checkbox"
                    checked={formChannels.includes('package')}
                    onChange={() => handleChannelToggle('package')}
                  />
                  参赛包赠送
                </label>
                <label className="mch-form-checkbox">
                  <input
                    type="checkbox"
                    checked={formChannels.includes('checkin')}
                    onChange={() => handleChannelToggle('checkin')}
                  />
                  签到赠送
                </label>
              </div>
            </div>

            <div className="mch-form-group">
              <label className="mch-form-label">使用规则说明</label>
              <textarea
                className="mch-form-textarea"
                placeholder="请输入使用规则说明（选填）"
                value={formUsageRule}
                onChange={(e) => setFormUsageRule(e.target.value)}
                maxLength={500}
              />
            </div>

            <div className="mch-modal-buttons">
              <button className="mch-modal-btn mch-modal-btn-cancel" onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button className="mch-modal-btn mch-modal-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
