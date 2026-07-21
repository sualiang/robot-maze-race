import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tag,
  Typography,
  Spin,
  Row,
  Col,
  Space,
} from 'antd';
import {
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../../utils/api';

const { Text } = Typography;

interface Race {
  id: number;
  name: string;
  status: string;
  statusText: string;
  statusClass: string;
  timeText: string;
  description: string;
  startTime: string;
  playerCount: number;
  _formatted?: boolean;
}

const STATUS_MAP: Record<string, string> = {
  pending: '未开始',
  running: '进行中',
  paused: '已暂停',
  finished: '已结束',
  cancelled: '已取消',
};

const STATUS_CLASS_MAP: Record<string, string> = {
  pending: 'info',
  running: 'success',
  paused: 'warning',
  finished: 'processing',
  cancelled: 'error',
};

const STATUS_LIST = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '未开始' },
  { key: 'running', label: '进行中' },
  { key: 'paused', label: '已暂停' },
  { key: 'finished', label: '已结束' },
];

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

const OperatorRaces: React.FC = () => {
  const navigate = useNavigate();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const venueName = localStorage.getItem('venueName') || '';

  const fetchRaces = useCallback(async () => {
    const venueId = localStorage.getItem('venueId');
    if (!venueId) {
      setLoading(false);
      setIsEmpty(true);
      return;
    }

    setLoading(true);
    try {
      const params: Record<string, any> = {
        venueId,
        page,
        pageSize: 20,
      };
      if (activeTab !== 'all') {
        params.status = activeTab;
      }

      const data: any = await api.get('/operator/races', { params });
      const list: any[] = data.list || data.races || [];

      const formatted = list.map((r) => {
        if (!r._formatted) {
          return {
            ...r,
            statusText: STATUS_MAP[r.status] || r.status || '未知',
            statusClass: STATUS_CLASS_MAP[r.status] || '',
            timeText: formatTime(r.startTime),
            _formatted: true,
          };
        }
        return r;
      });

      setRaces((prev) => {
        if (page === 1) return formatted;
        return [...prev, ...formatted];
      });
      setIsEmpty(page === 1 && formatted.length === 0);
      setHasMore(list.length >= 20);
    } catch (err) {
      console.error('获取赛事列表失败', err);
      setIsEmpty(true);
    } finally {
      setLoading(false);
    }
  }, [page, activeTab]);

  useEffect(() => {
    setPage(1);
    setRaces([]);
    setHasMore(true);
  }, [activeTab]);

  useEffect(() => {
    fetchRaces();
  }, [fetchRaces]);

  const switchTab = (tab: string) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  const goToDetail = (id: number) => {
    navigate(`/operator/races/${id}`);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 50 && hasMore && !loading) {
      setPage((p) => p + 1);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* 场馆信息 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #0f3460, #1890ff)',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginRight: 8 }}>
          当前场馆：
        </Text>
        <Text strong style={{ color: '#fff', fontSize: 13 }}>
          {venueName}
        </Text>
      </div>

      {/* Tab 筛选 */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          background: '#fff',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 16,
          border: '1px solid #f0f0f0',
        }}
      >
        {STATUS_LIST.map((tab) => (
          <div
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px 0',
              cursor: 'pointer',
              fontSize: 13,
              color: activeTab === tab.key ? '#1890ff' : '#8c8c8c',
              fontWeight: activeTab === tab.key ? 700 : 400,
              borderBottom: activeTab === tab.key ? '3px solid #1890ff' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* 赛事列表 */}
      <div
        style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}
        onScroll={handleScroll}
      >
        {races.length > 0 && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {races.map((race) => (
              <Card
                key={race.id}
                hoverable
                onClick={() => goToDetail(race.id)}
                bodyStyle={{ padding: 16 }}
              >
                <Row justify="space-between" align="top" style={{ marginBottom: 8 }}>
                  <Col flex="auto">
                    <Text
                      strong
                      style={{
                        fontSize: 16,
                        display: 'block',
                        marginBottom: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {race.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      🕐 {race.timeText}
                    </Text>
                  </Col>
                  <Col flex="none">
                    <Tag color={race.statusClass}>{race.statusText}</Tag>
                  </Col>
                </Row>
                {race.description && (
                  <div
                    style={{
                      padding: '8px 0',
                      marginBottom: 8,
                      borderTop: '1px solid #f0f0f0',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <Text
                      type="secondary"
                      style={{
                        fontSize: 13,
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 2,
                        overflow: 'hidden',
                      }}
                    >
                      {race.description}
                    </Text>
                  </div>
                )}
                <Row justify="space-between" align="middle">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    参赛人数：{race.playerCount || 0}
                  </Text>
                  <Text style={{ color: '#1890ff', fontSize: 14 }}>
                    查看详情 <RightOutlined />
                  </Text>
                </Row>
              </Card>
            ))}
          </Space>
        )}

        {/* 加载中 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin />
          </div>
        )}

        {/* 已加载全部 */}
        {!hasMore && races.length > 0 && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Text type="secondary">— 已加载全部 —</Text>
          </div>
        )}
      </div>

      {/* 空状态 */}
      {isEmpty && !loading && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 64, opacity: 0.4, marginBottom: 16 }}>📋</div>
          <Text type="secondary" style={{ fontSize: 14, display: 'block' }}>
            暂无赛事
          </Text>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            请在管理后台创建赛事
          </Text>
        </div>
      )}
    </div>
  );
};

export default OperatorRaces;
