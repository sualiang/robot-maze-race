import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { message } from 'antd';
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

interface VerifyResult {
  coupon_name: string;
  user_nickname: string;
  value: number;
  verify_time: string;
}

export default function VerifyPage() {
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');
  // 手动核销
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  // 核销结果弹窗
  const [resultOpen, setResultOpen] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultData, setResultData] = useState<VerifyResult | null>(null);
  const [resultError, setResultError] = useState('');
  // 最近核销记录
  const [recentLog, setRecentLog] = useState<VerifyLogItem[]>([]);

  const fetchRecentLog = useCallback(async () => {
    try {
      const data: any = await merchantApi.get('/merchant/verify/log', { params: { page_size: 5 } });
      setRecentLog(data?.list ?? data ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchRecentLog(); }, [fetchRecentLog]);

  const showResult = (success: boolean, data?: VerifyResult, error?: string) => {
    setResultSuccess(success);
    setResultData(data ?? null);
    setResultError(error ?? '');
    setResultOpen(true);
  };

  const handleManualVerify = async () => {
    if (!verifyCode || verifyCode.length < 16) {
      message.error('请输入完整的16位核销码');
      return;
    }
    setVerifying(true);
    try {
      const res: any = await merchantApi.post('/merchant/verify/manual', { code: verifyCode });
      showResult(true, res as VerifyResult);
      setVerifyCode('');
      fetchRecentLog();
    } catch (err: any) {
      const msg = err?.message || '核销失败';
      showResult(false, undefined, msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleScanVerify = async () => {
    // 当前实现：先弹输入框输二维码内容
    // 后续可扩展 wx.scanQRCode 或 navigator.mediaDevices
    const code = prompt('请输入/扫描核销码：');
    if (!code || code.length < 16) {
      message.error('核销码无效');
      return;
    }
    setVerifying(true);
    try {
      const res: any = await merchantApi.post('/merchant/verify/scan', { code });
      showResult(true, res as VerifyResult);
      fetchRecentLog();
    } catch (err: any) {
      const msg = err?.message || '核销失败';
      showResult(false, undefined, msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mch-verify-page">
      {/* Tab 切换 */}
      <div className="mch-verify-tabs">
        <button
          className={`mch-verify-tab ${activeTab === 'scan' ? 'mch-tab-active' : ''}`}
          onClick={() => setActiveTab('scan')}
        >
          扫码核销
        </button>
        <button
          className={`mch-verify-tab ${activeTab === 'manual' ? 'mch-tab-active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          手动核销
        </button>
      </div>

      {activeTab === 'scan' ? (
        <div className="mch-scan-area">
          <button className="mch-scan-button" onClick={handleScanVerify} disabled={verifying}>
            <span className="mch-scan-icon">📷</span>
            <span>{verifying ? '核销中...' : '扫码核销'}</span>
          </button>
          <div className="mch-scan-hint">
            点击扫码按钮，扫描用户出示的核销码
          </div>
        </div>
      ) : (
        <div className="mch-manual-area">
          <input
            className="mch-manual-input"
            placeholder="请输入16位核销码"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.toUpperCase())}
            maxLength={16}
            onKeyDown={(e) => e.key === 'Enter' && handleManualVerify()}
          />
          <button
            className="mch-verify-confirm-btn"
            onClick={handleManualVerify}
            disabled={verifying || verifyCode.length < 16}
          >
            {verifying ? '核销中...' : '确认核销'}
          </button>
        </div>
      )}

      {/* 最近核销记录 */}
      <div className="mch-recent-title">最近核销记录</div>
      {recentLog.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
          暂无核销记录
        </div>
      ) : (
        <div className="mch-recent-list">
          {recentLog.slice(0, 5).map((item) => (
            <div key={item.id} className="mch-recent-item">
              <div className="mch-recent-left">
                <span className="mch-recent-coupon">{item.coupon_name}</span>
                <span className="mch-recent-user">{item.user_nickname || '未知用户'}</span>
              </div>
              <div className="mch-recent-right">
                <div className="mch-recent-value">¥{item.value}</div>
                <div className="mch-recent-time">
                  {item.verify_time?.slice(11, 19) || ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to="/merchant/verify/log" className="mch-verify-view-all">
        查看全部核销记录 &gt;
      </Link>

      {/* 核销结果弹窗 */}
      {resultOpen && (
        <div className="mch-result-overlay" onClick={() => setResultOpen(false)}>
          <div className="mch-result-card" onClick={(e) => e.stopPropagation()}>
            {resultSuccess ? (
              <>
                <div className="mch-result-icon">✅</div>
                <div className="mch-result-title">核销成功</div>
                {resultData && (
                  <div className="mch-result-body">
                    <div className="mch-result-row">
                      <span className="mch-result-label">优惠券</span>
                      <span className="mch-result-value">{resultData.coupon_name}</span>
                    </div>
                    <div className="mch-result-row">
                      <span className="mch-result-label">用户</span>
                      <span className="mch-result-value">{resultData.user_nickname || '未知'}</span>
                    </div>
                    <div className="mch-result-row">
                      <span className="mch-result-label">面值</span>
                      <span className="mch-result-value">¥{resultData.value}</span>
                    </div>
                    <div className="mch-result-row">
                      <span className="mch-result-label">核销时间</span>
                      <span className="mch-result-value">{resultData.verify_time?.slice(0, 19) || ''}</span>
                    </div>
                  </div>
                )}
                <button className="mch-result-btn" onClick={() => setResultOpen(false)}>
                  知道了
                </button>
              </>
            ) : (
              <>
                <div className="mch-result-icon">❌</div>
                <div className="mch-result-title">核销失败</div>
                <div className="mch-result-error">{resultError}</div>
                <button className="mch-result-btn" onClick={() => setResultOpen(false)}>
                  知道了
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
