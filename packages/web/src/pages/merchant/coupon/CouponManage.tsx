import { useState, useEffect, useCallback } from 'react';
import { Modal, message } from 'antd';
import merchantApi from '../../../utils/merchant-api';
import './styles.css';

// ============================================================
// 后端 audit_status 枚举 (与后端一致)
// ============================================================
enum AuditStatus {
  DRAFT = 0,       // 草稿
  PENDING = 1,     // 待审核
  PASSED = 2,      // 审核通过（可上架）
  REJECTED = 3,    // 审核驳回
  OFFLINE_REQ = 4, // 待下架审核
}

// ============================================================
// 后端 coupon_type 枚举 (折扣券已取消)
// ============================================================
enum CouponType {
  NO_THRESHOLD = 1, // 无门槛立减券
  FULL_REDUCE = 3,  // 满减券
  EXCHANGE = 4,     // 兑换券
}

// ============================================================
// ListStatus
// ============================================================
enum ListStatus {
  OFF = 0,
  ON = 1,
}

// ============================================================
// 类型映射
// ============================================================
const typeLabels: Record<number, string> = {
  [CouponType.NO_THRESHOLD]: '无门槛立减券',
  [CouponType.FULL_REDUCE]: '满减券',
  [CouponType.EXCHANGE]: '兑换券',
};

const typeClassMap: Record<number, string> = {
  [CouponType.NO_THRESHOLD]: 'mch-coupon-type-reduce',
  [CouponType.FULL_REDUCE]: 'mch-coupon-type-full',
  [CouponType.EXCHANGE]: 'mch-coupon-type-nothreshold',
};

const typeSelectOptions = [
  { value: String(CouponType.FULL_REDUCE), label: '满减券' },
  { value: String(CouponType.NO_THRESHOLD), label: '无门槛立减券' },
  { value: String(CouponType.EXCHANGE), label: '兑换券' },
];

// ============================================================
// 状态信息映射
// ============================================================
function getStatusInfo(auditStatus: number, listStatus: number, offlineRequest = 0): { text: string; className: string } {
  switch (auditStatus) {
    case AuditStatus.DRAFT: return { text: '草稿', className: 'mch-coupon-status-pending' };
    case AuditStatus.PENDING: return { text: '待审核', className: 'mch-coupon-status-pending' };
    case AuditStatus.REJECTED:
      return offlineRequest === 1
        ? { text: '申请下架已驳回', className: 'mch-coupon-status-offline-rejected' }
        : { text: '申请上架已驳回', className: 'mch-coupon-status-rejected' };
    case AuditStatus.OFFLINE_REQ: return { text: '待下架审核', className: 'mch-coupon-status-pending' };
    case AuditStatus.PASSED:
      return listStatus === ListStatus.ON
        ? { text: '已上架', className: 'mch-coupon-status-active' }
        : { text: '已下架', className: 'mch-coupon-status-offline' };
    default: return { text: '未知', className: '' };
  }
}

const tabConfigs = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'pending', label: '待审核' },
  { key: 'active', label: '已上架' },
  { key: 'rejected', label: '已驳回' },
  { key: 'offline', label: '已下架' },
] as const;
type TabKey = (typeof tabConfigs)[number]['key'];

// ============================================================
// 界面
// ============================================================

interface CouponItem {
  id: string;
  name: string;
  description: string;
  denominationCents: number;
  minConsumeCents: number;
  totalCount: number;
  remainCount: number;
  couponType: number;
  maxPerUser: number;
  putChannels: string[];
  status: number;
  auditStatus: number;
  auditRemark: string;
  offlineRequest: number;
  validStart: string | null;
  validEnd: string | null;
  createdAt: number;
}

export default function CouponManage() {
  const [list, setList] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false); // true=编辑, false=新建
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单状态
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState(String(CouponType.FULL_REDUCE));
  const [formValue, setFormValue] = useState<number | undefined>(undefined);  // 元
  const [formMinAmount, setFormMinAmount] = useState<number | undefined>(undefined); // 元
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
      setList(Array.isArray(data?.list) ? data.list : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 筛选
  const filteredList = list.filter((item) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'draft') return item.auditStatus === AuditStatus.DRAFT;
    if (activeTab === 'pending') return item.auditStatus === AuditStatus.PENDING;
    if (activeTab === 'active') return item.auditStatus === AuditStatus.PASSED && item.status === ListStatus.ON;
    if (activeTab === 'rejected') return item.auditStatus === AuditStatus.REJECTED;
    if (activeTab === 'offline') {
      return item.auditStatus === AuditStatus.PASSED && item.status === ListStatus.OFF;
    }
    return true;
  });

  const resetForm = () => {
    setEditing(false);
    setEditingId(null);
    setFormName('');
    setFormType(String(CouponType.FULL_REDUCE));
    setFormValue(undefined);
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
    setEditing(true);
    setEditingId(item.id);
    setFormName(item.name);
    setFormType(String(item.couponType));
    setFormValue(item.denominationCents ? item.denominationCents / 100 : undefined);
    setFormMinAmount(item.minConsumeCents ? item.minConsumeCents / 100 : undefined);
    setFormTotalStock(item.totalCount);
    setFormLimitPerUser(item.maxPerUser || 1);
    setFormExpiryType(item.validStart && item.validEnd ? 'fixed' : 'days');
    setFormExpiryStart(item.validStart ? new Date(item.validStart).toISOString().split('T')[0] : '');
    setFormExpiryEnd(item.validEnd ? new Date(item.validEnd).toISOString().split('T')[0] : '');
    setFormExpiryDays(undefined);
    setFormChannels(Array.isArray(item.putChannels) ? item.putChannels : []);
    setFormUsageRule(item.description || '');
    setModalOpen(true);
  };

  const handleSubmitAudit = async (id: string) => {
    try {
      const res = await merchantApi.post(`/merchant/coupon/${id}/submit-audit`);
      console.log('[提交审核] 成功:', res);
      message.success('已提交审核');
      fetchList();
    } catch (e: any) {
      console.error('[提交审核] 失败:', e);
      message.error(e?.message || '提交失败');
    }
  };

  const handleRequestOffline = async (id: string) => {
    try {
      await merchantApi.post(`/merchant/coupon/${id}/request-offline`);
      message.success('已申请下架');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleCancelOffline = async (id: string) => {
    try {
      await merchantApi.post(`/merchant/coupon/${id}/cancel-offline`);
      message.success('已撤销下架申请');
      fetchList();
    } catch {
      message.error('操作失败');
    }
  };

  const handleOnline = async (id: string) => {
    try {
      await merchantApi.post(`/merchant/coupon/${id}/online`);
      message.success('已上架');
      fetchList();
    } catch {
      message.error('上架失败');
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

  const handleSave = async () => {
    // 校验
    if (!formName.trim()) { message.error('请输入券名称'); return; }
    const couponTypeNum = parseInt(formType, 10);
    if (couponTypeNum === CouponType.FULL_REDUCE || couponTypeNum === CouponType.NO_THRESHOLD) {
      if (!formValue || formValue <= 0) { message.error('请输入面值'); return; }
    }
    if (couponTypeNum === CouponType.FULL_REDUCE && (!formMinAmount || formMinAmount <= 0)) {
      message.error('请输入最低消费金额'); return;
    }
    if (!formTotalStock || formTotalStock <= 0) { message.error('请输入总库存'); return; }
    if (formExpiryType === 'fixed' && (!formExpiryStart || !formExpiryEnd)) { message.error('请选择有效期'); return; }
    if (formExpiryType === 'days' && (!formExpiryDays || formExpiryDays <= 0)) { message.error('请输入有效天数'); return; }

    const payload: Record<string, unknown> = {
      name: formName.trim(),
      description: formUsageRule.trim(),
      totalCount: formTotalStock,
      couponType: couponTypeNum,
      maxPerUser: formLimitPerUser,
      putChannels: JSON.stringify(formChannels || []),
    };

    // 面值
    if (couponTypeNum === CouponType.EXCHANGE) {
      payload.denominationCents = 0;
    } else {
      payload.denominationCents = Math.round((formValue || 0) * 100);
    }
    if (couponTypeNum === CouponType.FULL_REDUCE) {
      payload.minConsumeCents = Math.round((formMinAmount || 0) * 100);
    }
    // 有效期
    if (formExpiryType === 'fixed') {
      payload.validStart = formExpiryStart ? new Date(formExpiryStart).toISOString() : null;
      payload.validEnd = formExpiryEnd ? new Date(formExpiryEnd).toISOString() : null;
    } else if (formExpiryDays && formExpiryDays > 0) {
      const end = new Date();
      end.setDate(end.getDate() + formExpiryDays);
      payload.validStart = new Date().toISOString();
      payload.validEnd = end.toISOString();
    }

    setSaving(true);
    try {
      if (editing && editingId) {
        await merchantApi.put(`/merchant/coupon/${editingId}`, payload);
        message.success('已修改');
      } else {
        await merchantApi.post('/merchant/coupon/create', payload);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchList();
    } catch {
      message.error('操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChannelToggle = (channel: string) => {
    setFormChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const getTypeClass = (t: number) => typeClassMap[t] || '';
  const formatPrice = (cents: number) => `¥${((cents || 0) / 100).toFixed(2)}`;

  // ============================================================
  // 渲染操作按钮
  // ============================================================
  const renderActions = (coupon: CouponItem) => {
    const { auditStatus, status, id } = coupon;
    const btns: React.ReactNode[] = [];

    // 草稿：编辑、删除、提交审核
    if (auditStatus === AuditStatus.DRAFT) {
      btns.push(
        <button key="edit" className="mch-coupon-action-btn mch-coupon-action-edit" onClick={() => openEditModal(coupon)}>编辑</button>,
        <button key="del" className="mch-coupon-action-btn mch-coupon-action-delete" onClick={() => handleDelete(id)}>删除</button>,
        <button key="submit" className="mch-coupon-action-btn mch-coupon-action-online" onClick={() => handleSubmitAudit(id)}>提交审核</button>,
      );
    }

    // 待审核：无操作按钮
    if (auditStatus === AuditStatus.PENDING) {
      // 无操作
    }

    // 审核通过 + 已下架：编辑、删除、上架
    if (auditStatus === AuditStatus.PASSED && status === ListStatus.OFF) {
      btns.push(
        <button key="edit" className="mch-coupon-action-btn mch-coupon-action-edit" onClick={() => openEditModal(coupon)}>编辑</button>,
        <button key="del" className="mch-coupon-action-btn mch-coupon-action-delete" onClick={() => handleDelete(id)}>删除</button>,
        <button key="online" className="mch-coupon-action-btn mch-coupon-action-online" onClick={() => handleOnline(id)}>上架</button>,
      );
    }

    // 审核通过 + 已上架：申请下架
    if (auditStatus === AuditStatus.PASSED && status === ListStatus.ON) {
      btns.push(
        <button key="offline" className="mch-coupon-action-btn mch-coupon-action-offline" onClick={() => handleRequestOffline(id)}>申请下架</button>,
      );
    }

    // 待下架审核：撤销申请
    if (auditStatus === AuditStatus.OFFLINE_REQ) {
      btns.push(
        <button key="cancel" className="mch-coupon-action-btn mch-coupon-action-edit" onClick={() => handleCancelOffline(id)}>撤销下架申请</button>,
      );
    }

    // 已驳回：编辑、删除、提交审核
    if (auditStatus === AuditStatus.REJECTED) {
      btns.push(
        <button key="edit" className="mch-coupon-action-btn mch-coupon-action-edit" onClick={() => openEditModal(coupon)}>编辑</button>,
        <button key="del" className="mch-coupon-action-btn mch-coupon-action-delete" onClick={() => handleDelete(id)}>删除</button>,
        <button key="resubmit" className="mch-coupon-action-btn mch-coupon-action-online" onClick={() => handleSubmitAudit(id)}>重新提交审核</button>,
      );
    }

    return btns;
  };

  // ============================================================
  // 渲染表单
  // ============================================================
  const renderFormFields = () => {
    const couponTypeNum = parseInt(formType, 10);
    const isExchange = couponTypeNum === CouponType.EXCHANGE;

    return (
      <>
        <div className="mch-form-group">
          <label className="mch-form-label">券名称</label>
          <input className="mch-form-input" placeholder="请输入优惠券名称" value={formName}
            onChange={(e) => setFormName(e.target.value)} maxLength={50} />
        </div>

        <div className="mch-form-group">
          <label className="mch-form-label">券类型</label>
          <select className="mch-form-select" value={formType} onChange={(e) => setFormType(e.target.value)}>
            {typeSelectOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {!isExchange && (
          <div className="mch-form-group">
            <label className="mch-form-label">面值（元）</label>
            <input className="mch-form-input" type="number" min={0.01} step={0.01} placeholder="请输入面值"
              value={formValue ?? ''} onChange={(e) => setFormValue(e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        )}

        {couponTypeNum === CouponType.FULL_REDUCE && (
          <div className="mch-form-group">
            <label className="mch-form-label">最低消费金额（元）</label>
            <input className="mch-form-input" type="number" min={0.01} step={0.01} placeholder="满多少可用"
              value={formMinAmount ?? ''} onChange={(e) => setFormMinAmount(e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        )}

        {isExchange && (
          <div className="mch-form-group">
            <label className="mch-form-label">兑换价值（元）</label>
            <input className="mch-form-input" type="number" min={0.01} step={0.01} placeholder="凭券可兑换价值多少的商品"
              value={formValue ?? ''} onChange={(e) => setFormValue(e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        )}

        <div className="mch-form-row">
          <div className="mch-form-group">
            <label className="mch-form-label">总库存</label>
            <input className="mch-form-input" type="number" min={1} placeholder="数量"
              value={formTotalStock ?? ''} onChange={(e) => setFormTotalStock(e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="mch-form-group">
            <label className="mch-form-label">每人限领</label>
            <input className="mch-form-input" type="number" min={1} placeholder="默认1"
              value={formLimitPerUser} onChange={(e) => setFormLimitPerUser(Number(e.target.value) || 1)} />
          </div>
        </div>

        <div className="mch-form-group">
          <label className="mch-form-label">有效期</label>
          <div className="mch-expiry-options">
            <div className={`mch-expiry-option ${formExpiryType === 'fixed' ? 'mch-expiry-active' : ''}`}
              onClick={() => setFormExpiryType('fixed')}>固定日期</div>
            <div className={`mch-expiry-option ${formExpiryType === 'days' ? 'mch-expiry-active' : ''}`}
              onClick={() => setFormExpiryType('days')}>领取后N天</div>
          </div>
          {formExpiryType === 'fixed' ? (
            <div className="mch-form-row">
              <div className="mch-form-group">
                <input className="mch-form-input" type="date" value={formExpiryStart}
                  onChange={(e) => setFormExpiryStart(e.target.value)} />
              </div>
              <div className="mch-form-group">
                <input className="mch-form-input" type="date" value={formExpiryEnd}
                  onChange={(e) => setFormExpiryEnd(e.target.value)} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="mch-form-input" type="number" min={1} placeholder="有效天数" style={{ width: 120 }}
                value={formExpiryDays ?? ''} onChange={(e) => setFormExpiryDays(e.target.value ? Number(e.target.value) : undefined)} />
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>天</span>
            </div>
          )}
        </div>

        <div className="mch-form-group">
          <label className="mch-form-label">投放渠道</label>
          <div className="mch-form-checkbox-group">
            {['package', 'points_shop'].map((ch) => (
              <label key={ch} className="mch-form-checkbox">
                <input type="checkbox" checked={formChannels.includes(ch)}
                  onChange={() => handleChannelToggle(ch)} />
                {ch === 'package' ? '参赛包赠送' : '积分商城'}
              </label>
            ))}
          </div>
        </div>

        <div className="mch-form-group">
          <label className="mch-form-label">使用规则说明</label>
          <textarea className="mch-form-textarea" placeholder="请输入使用规则说明（选填）"
            value={formUsageRule} onChange={(e) => setFormUsageRule(e.target.value)} maxLength={500} />
        </div>
      </>
    );
  };

  return (
    <div className="mch-coupon-page">
      {/* 顶部Tab */}
      <div className="mch-coupon-tabs">
        {tabConfigs.map((tab) => (
          <button key={tab.key}
            className={`mch-coupon-tab-item ${activeTab === tab.key ? 'mch-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </div>

      {/* 创建按钮 */}
      <div className="mch-coupon-actions">
        <button className="mch-coupon-create-btn" onClick={openCreateModal}>创建新优惠券</button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>加载中...</div>
      ) : filteredList.length === 0 ? (
        <div className="mch-empty-state"><div>暂无优惠券</div></div>
      ) : (
        filteredList.map((coupon) => {
          const statusInfo = getStatusInfo(coupon.auditStatus, coupon.status, coupon.offlineRequest);
          return (
            <div key={coupon.id} className="mch-coupon-card">
              <div className="mch-coupon-card-header">
                <span className="mch-coupon-name">{coupon.name}</span>
                <span className={`mch-coupon-type-tag ${getTypeClass(coupon.couponType)}`}>
                  {typeLabels[coupon.couponType] || '未知'}
                </span>
              </div>

              <div className="mch-coupon-card-body">
                <div className="mch-coupon-info-item">
                  {coupon.couponType === CouponType.EXCHANGE
                    ? '价值:'
                    : coupon.couponType === CouponType.FULL_REDUCE
                      ? `满${formatPrice(coupon.minConsumeCents)}减`
                      : '面值:'}
                  <strong>{formatPrice(coupon.denominationCents)}</strong>
                </div>
                <div className="mch-coupon-info-item">
                  库存: <strong>{coupon.remainCount}/{coupon.totalCount}</strong>
                </div>
                <div className="mch-coupon-info-item">
                  有效期: <strong>
                    {coupon.validStart && coupon.validEnd
                      ? `${new Date(coupon.validStart).toISOString().slice(0, 10)}~${new Date(coupon.validEnd).toISOString().slice(0, 10)}`
                      : '长期有效'}
                  </strong>
                </div>
                <div className="mch-coupon-info-item">
                  每人限领: <strong>{coupon.maxPerUser}张</strong>
                </div>
              </div>

              <div className="mch-coupon-card-footer">
                <span className={`mch-coupon-status-tag ${statusInfo.className}`}>
                  {statusInfo.text}
                </span>
                <div className="mch-coupon-actions-row">
                  {renderActions(coupon)}
                </div>
              </div>

              {coupon.auditStatus === AuditStatus.REJECTED && coupon.auditRemark && (
                <div style={{
                  margin: '0 -16px -12px -16px',
                  padding: '10px 16px',
                  background: 'rgba(255,77,79,0.1)',
                  borderTop: '1px solid rgba(255,77,79,0.2)',
                  borderRadius: '0 0 12px 12px',
                  fontSize: 13,
                  color: '#ff7875',
                  lineHeight: 1.5,
                }}>
                  <span style={{ fontWeight: 600, marginRight: 6 }}>⚠ 驳回原因：</span>
                  {coupon.auditRemark.indexOf('下架') >= 0 ? (
                    <span>下架申请被驳回 — {coupon.auditRemark}</span>
                  ) : (
                    <span>{coupon.auditRemark}</span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* 创建/编辑 Modal */}
      {modalOpen && (
        <div className="mch-modal-overlay">
          <div className="mch-modal-content">
            <div className="mch-modal-title">{editing ? '编辑优惠券' : '创建优惠券'}</div>
            {renderFormFields()}
            {editing && (
              <div style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                编辑后需重新提交审核
              </div>
            )}
            <div className="mch-modal-buttons">
              <button className="mch-modal-btn mch-modal-btn-cancel" onClick={() => setModalOpen(false)}>取消</button>
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
