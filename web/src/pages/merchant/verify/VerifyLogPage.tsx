import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import merchantApi from '../../../utils/merchant-api';
import './styles.css';

interface VerifyLogItem {
  id: string;
  coupon_name: string;
  user_nickname: string;
  value: number;
  verify_time: string;
  method: 'scan' | 'manual';
}

export default function VerifyLogPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<VerifyLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (searchText.trim()) params.keyword = searchText.trim();
      if (dateStart) params.date_start = dateStart;
      if (dateEnd) params.date_end = dateEnd;
      const data: any = await merchantApi.get('/merchant/verify/log', { params });
      setList(data?.list ?? data ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [searchText, dateStart, dateEnd]);

  useEffect(() => { fetchList(); }, [fetchList]);

  return (
    <div className="mch-log-page">
      <div className="mch-log-header">
        <div className="mch-log-title">核销记录</div>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: '#00d4ff',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          返回
        </button>
      </div>

      {/* 搜索 */}
      <input
        className="mch-log-search"
        placeholder="搜索优惠券名称或用户昵称..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />

      {/* 日期筛选 */}
      <div className="mch-log-date-filter">
        <input
          type="date"
          className="mch-log-date-input"
          value={dateStart}
          onChange={(e) => setDateStart(e.target.value)}
        />
        <span style={{ color: 'rgba(255,255,255,0.3)', alignSelf: 'center' }}>~</span>
        <input
          type="date"
          className="mch-log-date-input"
          value={dateEnd}
          onChange={(e) => setDateEnd(e.target.value)}
        />
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>加载中...</div>
      ) : list.length === 0 ? (
        <div className="mch-log-empty">
          <div>暂无核销记录</div>
        </div>
      ) : (
        list.map((item) => (
          <div key={item.id} className="mch-log-item">
            <div className="mch-log-item-left">
              <div className="mch-log-item-coupon">{item.coupon_name}</div>
              <div className="mch-log-item-user">用户: {item.user_nickname || '未知'}</div>
              <div className="mch-log-item-meta">{item.verify_time?.slice(0, 19) || ''}</div>
            </div>
            <div className="mch-log-item-right">
              <div className="mch-log-item-value">¥{item.value}</div>
              <span className={`mch-log-item-method ${item.method === 'scan' ? 'mch-log-method-scan' : 'mch-log-method-manual'}`}>
                {item.method === 'scan' ? '扫码' : '手动'}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
