import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useOperatorContext } from '../../hooks/useOperatorContext';
import NoContextBanner from '../../components/NoContextBanner';

interface RecordItem {
  id: string;
  rank: number | null;
  nickname: string;
  robotName: string;
  finishTimeMs: number | null;
  scoreText: string;
  status: string;
  statusText: string;
  statusClass: string;
  startedAt: string;
  finishedAt: string;
  durationText: string;
}

function padZero(n: number): string { return n < 10 ? '0' + n : String(n); }

function formatRaceTime(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 0) return '-';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return padZero(min) + ':' + padZero(sec) + '.' + padZero(cs);
}

function getStatusText(status: string): string {
  const map: Record<string, string> = { finished: '🏁 完成', timeout: '⏰ 超时', fault: '🤖 故障', racing: '▶️ 进行中' };
  return map[status] || status;
}

function getStatusClass(status: string): string {
  const map: Record<string, string> = { finished: 'referee-tag-success', timeout: 'referee-tag-warning', fault: 'referee-tag-danger', racing: 'referee-tag-info' };
  return map[status] || '';
}

function getDurationText(startedAt: string, finishedAt: string): string {
  if (!startedAt) return '-';
  if (!finishedAt) return '进行中...';
  try {
    const diffMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    if (diffMs < 0) return '-';
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return seconds + '秒';
    return Math.floor(seconds / 60) + '分' + (seconds % 60) + '秒';
  } catch { return '-'; }
}

function formatDateTime(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return padZero(d.getMonth() + 1) + '-' + padZero(d.getDate()) + ' ' + padZero(d.getHours()) + ':' + padZero(d.getMinutes());
  } catch { return iso; }
}

function mapToDisplay(list: any[]): RecordItem[] {
  return list.map((item) => {
    const fms = item.finishTimeMs ?? item.finish_time_ms ?? null;
    const startedAt = item.startedAt || item.started_at || '';
    const finishedAt = item.finishedAt || item.finished_at || '';
    return {
      id: item.id,
      rank: item.rank ?? null,
      nickname: item.nickname || item.userName || '未知选手',
      robotName: item.robotName || '-',
      finishTimeMs: fms,
      scoreText: formatRaceTime(fms),
      status: item.status,
      statusText: getStatusText(item.status),
      statusClass: getStatusClass(item.status),
      startedAt, finishedAt,
      durationText: getDurationText(startedAt, finishedAt),
    };
  });
}

function getTodayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate());
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [total, setTotal] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null);
  const { hasContext, loading: contextLoading } = useOperatorContext();
  const pageSize = 20;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/referee/login', { replace: true }); return; }
    loadRecords(true);
  }, []);

  const loadRecords = useCallback(async (reset: boolean) => {
    if (!reset && loadingMore) return;
    const currentPage = reset ? 1 : page;
    if (!reset) setLoadingMore(true);
    else { setPageLoading(true); setPage(1); setHasMore(true); }
    try {
      const res: any = await api.get('/api/referee/match/results', { params: { page: currentPage, pageSize, ...(filterDate ? { date: filterDate } : {}) } });
      const displayRecords = mapToDisplay(res.list || []);
      if (reset) setRecords(displayRecords);
      else setRecords((prev) => [...prev, ...displayRecords]);
      setPage(currentPage + 1);
      setHasMore((reset ? 0 : records.length) + displayRecords.length < (res.total || 0));
      setTotal(res.total || 0);
    } catch { if (reset) setRecords([]); }
    finally { setPageLoading(false); setLoadingMore(false); }
  }, [page, loadingMore, filterDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterDate(e.target.value);
    setRecords([]);
    setPage(1);
    setHasMore(true);
    setPageLoading(true);
    api.get('/api/referee/match/results', { params: { page: 1, pageSize, date: e.target.value } })
      .then((res: any) => {
        const d = mapToDisplay(res.list || []);
        setRecords(d); setPage(2); setHasMore(d.length < (res.total || 0)); setTotal(res.total || 0);
      }).catch(() => setRecords([]))
      .finally(() => setPageLoading(false));
  };

  const handleClearFilter = () => {
    setFilterDate('');
    setRecords([]);
    setPage(1);
    setHasMore(true);
    setPageLoading(true);
    api.get('/api/referee/match/results', { params: { page: 1, pageSize } })
      .then((res: any) => {
        const d = mapToDisplay(res.list || []);
        setRecords(d); setPage(2); setHasMore(d.length < (res.total || 0)); setTotal(res.total || 0);
      }).catch(() => setRecords([]))
      .finally(() => setPageLoading(false));
  };

  const handleRecordTap = (recordId: string) => {
    const record = records.find((r) => r.id === recordId);
    if (record) setSelectedRecord(record);
  };

  const handleCloseDetail = () => setSelectedRecord(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 50 && hasMore && !loadingMore) loadRecords(false);
  };

  if (pageLoading && records.length === 0) {
    return <div className="referee-loading-mask"><div className="referee-loading-spinner">加载中...</div></div>;
  }

  // 无运营商上下文：不显示历史成绩
  if (!hasContext && !contextLoading) {
    return (
      <div className="referee-page">
        <NoContextBanner />
        <div className="referee-card" style={{ marginBottom: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ref-text)', marginBottom: 8 }}>历史成绩暂不可查看</div>
          <div style={{ fontSize: 14, color: 'var(--ref-text-dim)', lineHeight: 1.6 }}>
            请前往线下赛场扫描官方小程序码<br />查看运营商专属比赛历史成绩
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="referee-page" onScroll={handleScroll} style={{ overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: '#fff', marginBottom: 1, borderRadius: '0 0 12px 12px' }}>
        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#e94560' }}>{total}</div><div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>总记录</div></div>
        <div style={{ width: 1, height: 32, background: '#f5f5f5' }} />
        <div style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }} onClick={handleClearFilter}><div style={{ fontSize: 16, fontWeight: 600, color: '#e94560' }}>{filterDate || '全部'}</div><div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>日期筛选{filterDate ? ' ✕' : ''}</div></div>
      </div>

      <div style={{ padding: '12px 16px', background: '#fff', marginTop: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px', background: '#f5f5f5', borderRadius: 8, cursor: 'pointer' }}>
          <span style={{ marginRight: 8 }}>📅</span>
          <input type="date" value={filterDate} onChange={handleDateChange} max={getTodayStr()} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: '#333', outline: 'none', fontFamily: 'inherit' }} placeholder="选择日期筛选" />
          <span style={{ fontSize: 12, color: '#999' }}>▼</span>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: '0 4px' }}>
        {records.length === 0 && !pageLoading ? (
          <div className="referee-empty"><span className="referee-empty-icon">📋</span><span className="referee-empty-text">{filterDate ? '该日期暂无比赛记录' : '暂无比赛记录'}</span></div>
        ) : (
          records.map((item) => (
            <div key={item.id} className="referee-card" style={{ display: 'flex', alignItems: 'center', padding: 16, margin: '0 0 8px 0', cursor: 'pointer' }} onClick={() => handleRecordTap(item.id)}>
              <div style={{ marginRight: 12, flexShrink: 0 }}>
                {item.rank && item.rank <= 3 ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: 'linear-gradient(135deg, #ffd700, #ffa500)', color: '#fff' }}>🏆</span> : null}
              </div>
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nickname}</span>
                  <span className={'referee-tag ' + item.statusClass}>{item.statusText}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#999' }}>{item.robotName}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{formatDateTime(item.startedAt)}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', marginLeft: 12, flexShrink: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'SF Mono', Menlo, monospace", color: '#e94560' }}>{item.scoreText}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{item.durationText}</div>
              </div>
              <div style={{ fontSize: 22, color: '#ccc', marginLeft: 6, flexShrink: 0 }}>›</div>
            </div>
          ))
        )}
      </div>

      {loadingMore && <div style={{ textAlign: 'center', padding: 20, fontSize: 13, color: '#999' }}>加载中...</div>}
      {!hasMore && records.length > 0 && <div style={{ textAlign: 'center', padding: 20, fontSize: 13, color: '#ccc' }}>—— 共 {total} 条记录 ——</div>}

      {selectedRecord && (
        <div className="referee-overlay" onClick={handleCloseDetail}>
          <div className="referee-detail-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 20 }}>比赛详情</div>
            <div style={{ marginBottom: 20 }}>
              <div className="referee-row-line"><span className="referee-row-label">选手</span><span className="referee-row-value">{selectedRecord.nickname}</span></div>
              <div className="referee-row-line"><span className="referee-row-label">机器狗</span><span className="referee-row-value">{selectedRecord.robotName}</span></div>
              <div className="referee-row-line"><span className="referee-row-label">成绩</span><span className="referee-row-value" style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 16, fontWeight: 700, color: '#e94560' }}>{selectedRecord.scoreText}</span></div>
              <div className="referee-row-line"><span className="referee-row-label">状态</span><span className={'referee-tag ' + selectedRecord.statusClass}>{selectedRecord.statusText}</span></div>

              <div className="referee-row-line"><span className="referee-row-label">开始时间</span><span className="referee-row-value">{formatDateTime(selectedRecord.startedAt)}</span></div>
              {selectedRecord.finishedAt && <div className="referee-row-line"><span className="referee-row-label">结束时间</span><span className="referee-row-value">{formatDateTime(selectedRecord.finishedAt)}</span></div>}
              <div className="referee-row-line"><span className="referee-row-label">用时</span><span className="referee-row-value">{selectedRecord.durationText}</span></div>
            </div>
            <button className="referee-btn referee-btn-primary" onClick={handleCloseDetail}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}
