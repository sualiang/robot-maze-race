import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Tag,
  Typography,
  Spin,
  Row,
  Col,
  Button,
  Space,
  Modal,
  message,
} from 'antd';
import {
  PauseCircleOutlined,
  CaretRightOutlined,
  StopOutlined,
} from '@ant-design/icons';
import api from '../../../utils/api';

const { Text, Title } = Typography;

interface RaceDetail {
  name: string;
  status: string;
  statusText: string;
  statusClass: string;
  startTime: string;
  timeText: string;
  description: string;
  playerCount: number;
}

interface Player {
  id: number;
  nickname?: string;
  name?: string;
  playerId?: string;
  rank: number;
  score: number;
  finished: boolean;
  scoreText: string;
  rankText: string;
  finishText: string;
  finishClass: string;
  _formatted?: boolean;
}

const STATUS_MAP: Record<string, string> = {
  pending: '未开始',
  running: '进行中',
  paused: '已暂停',
  finished: '已结束',
  cancelled: '已取消',
};

const CLASS_MAP: Record<string, string> = {
  pending: 'info',
  running: 'success',
  paused: 'warning',
  finished: 'processing',
  cancelled: 'error',
};

function formatScore(score: number): string {
  if (score === undefined || score === null || score <= 0) return '--';
  // 成绩单位可能是秒也可能是毫秒，统一按毫秒格式化 mm:ss.ms
  const ms = score < 1000 ? Math.round(score * 1000) : Math.round(score);
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
}

function formatRank(rank: number): string {
  if (!rank || rank <= 0) return '--';
  return `#${rank}`;
}

const OperatorRaceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [race, setRace] = useState<RaceDetail>({
    name: '',
    status: '',
    statusText: '',
    statusClass: '',
    startTime: '',
    timeText: '',
    description: '',
    playerCount: 0,
  });
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [playerPage, setPlayerPage] = useState(1);
  const [playerHasMore, setPlayerHasMore] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRaceDetail = useCallback(async () => {
    try {
      const data: any = await api.get(`/operator/races/${id}`);
      const r = data.race || data;
      const status = r.status;
      const d = new Date(r.startTime);
      const timeText = isNaN(d.getTime())
        ? r.startTime || ''
        : `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      setRace({
        name: r.name || '',
        status,
        statusText: STATUS_MAP[status] || status,
        statusClass: CLASS_MAP[status] || '',
        startTime: r.startTime || '',
        timeText,
        description: r.description || '',
        playerCount: r.playerCount || 0,
      });
    } catch (err) {
      console.error('获取赛事详情失败', err);
      message.error('获取赛事详情失败');
    }
  }, [id]);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await api.get(`/operator/races/${id}/players`, {
        params: { page: playerPage, pageSize: 20 },
      });
      const list: any[] = data.list || data.players || [];

      const formatted = list.map((p) => {
        if (!p._formatted) {
          return {
            ...p,
            scoreText: formatScore(p.score),
            rankText: formatRank(p.rank),
            finishText: p.finished ? '已完成' : '未完成',
            finishClass: p.finished ? 'success' : 'warning',
            _formatted: true,
          };
        }
        return p;
      });

      setPlayers((prev) => {
        if (playerPage === 1) return formatted;
        return [...prev, ...formatted];
      });
      setIsEmpty(playerPage === 1 && formatted.length === 0);
      setPlayerHasMore(list.length >= 20);
    } catch (err) {
      console.error('获取参赛选手失败', err);
      setIsEmpty(true);
    } finally {
      setLoading(false);
    }
  }, [id, playerPage]);

  useEffect(() => {
    if (id) {
      fetchRaceDetail();
      setPlayerPage(1);
      setPlayers([]);
      setPlayerHasMore(true);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchPlayers();
    }
  }, [id, playerPage]);

  const loadMorePlayers = () => {
    if (playerHasMore && !loading) {
      setPlayerPage((p) => p + 1);
    }
  };

  // 赛事操作
  const confirmRaceAction = (action: string, title: string, content: string) => {
    const isFinish = action === 'finish';
    Modal.confirm({
      title,
      content,
      okText: '确认',
      okButtonProps: { danger: isFinish },
      onOk: () => doRaceAction(action),
    });
  };

  const doRaceAction = async (action: string) => {
    setActionLoading(true);
    const statusMap: Record<string, string> = {
      pause: 'paused',
      resume: 'running',
      finish: 'finished',
    };
    const statusTextMap: Record<string, string> = {
      paused: '已暂停',
      running: '进行中',
      finished: '已结束',
    };
    const classMap: Record<string, string> = {
      paused: 'warning',
      running: 'success',
      finished: 'processing',
    };

    try {
      await api.put(`/operator/races/${id}/status`, { action });
      message.success(
        action === 'pause' ? '已暂停' : action === 'resume' ? '已恢复' : '已结束'
      );
      const newStatus = statusMap[action];
      setRace((prev) => ({
        ...prev,
        status: newStatus,
        statusText: statusTextMap[newStatus] || newStatus,
        statusClass: classMap[newStatus] || '',
      }));
    } catch {
      message.error('操作失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const getRankDisplay = (player: Player) => {
    if (player.rank && player.rank <= 3) {
      const medals = ['🥇', '🥈', '🥉'];
      return (
        <span style={{ fontSize: 18 }}>{medals[player.rank - 1]}</span>
      );
    }
    return (
      <Text type="secondary" style={{ fontSize: 13 }}>
        {player.rankText}
      </Text>
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* 赛事头部 */}
      <Card
        style={{
          background: 'linear-gradient(135deg, #0f3460, #1a508b)',
          color: '#fff',
          marginBottom: 16,
          border: 'none',
        }}
        bodyStyle={{ padding: 24 }}
      >
        <Row justify="space-between" align="top" style={{ marginBottom: 8 }}>
          <Col flex="auto">
            <Text
              strong
              style={{
                color: '#fff',
                fontSize: 20,
                display: 'block',
                marginBottom: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {race.name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              🕐 {race.timeText}
            </Text>
          </Col>
          <Col flex="none">
            <Tag color={race.statusClass} style={{ padding: '4px 16px', borderRadius: 20 }}>
              {race.statusText}
            </Tag>
          </Col>
        </Row>
        {race.description && (
          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.6 }}>
              {race.description}
            </Text>
          </div>
        )}
      </Card>

      {/* 操作按钮 */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        {race.status === 'running' && (
          <Col span={12}>
            <Button
              block
              icon={<PauseCircleOutlined />}
              onClick={() =>
                confirmRaceAction('pause', '暂停赛事', '确认暂停当前赛事？选手将无法继续参赛。')
              }
              style={{
                height: 44,
                background: '#faad14',
                borderColor: '#faad14',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              暂停赛事
            </Button>
          </Col>
        )}
        {race.status === 'paused' && (
          <Col span={12}>
            <Button
              block
              icon={<CaretRightOutlined />}
              onClick={() =>
                confirmRaceAction('resume', '恢复赛事', '确认恢复当前赛事？选手可以继续参赛。')
              }
              style={{
                height: 44,
                background: '#52c41a',
                borderColor: '#52c41a',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              恢复赛事
            </Button>
          </Col>
        )}
        {(race.status === 'running' || race.status === 'paused') && (
          <Col span={12}>
            <Button
              block
              danger
              icon={<StopOutlined />}
              onClick={() =>
                confirmRaceAction('finish', '结束赛事', '确认结束当前赛事？结束后无法恢复。')
              }
              style={{ height: 44, fontWeight: 700 }}
            >
              结束赛事
            </Button>
          </Col>
        )}
      </Row>

      {/* 统计 */}
      <Card
        bodyStyle={{ padding: '16px 24px', textAlign: 'center' }}
        style={{ marginBottom: 16 }}
      >
        <div>
          <Text
            strong
            style={{ fontSize: 28, color: '#1890ff', display: 'block', marginBottom: 4 }}
          >
            {race.playerCount}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            参赛总人数
          </Text>
        </div>
      </Card>

      {/* 选手列表标题 */}
      <Title level={5} style={{ marginBottom: 16 }}>
        🏃 参赛选手
      </Title>

      {/* 选手列表 */}
      {players.length > 0 && (
        <Card
          bodyStyle={{ padding: 0 }}
          style={{ marginBottom: 16, overflow: 'hidden' }}
        >
          {/* 表头 */}
          <Row
            style={{
              padding: '8px 16px',
              background: '#f5f6f8',
              fontSize: 12,
              color: '#8c8c8c',
              fontWeight: 700,
            }}
          >
            <Col span={10}>选手</Col>
            <Col span={7} style={{ textAlign: 'right' }}>
              成绩
            </Col>
            <Col span={7} style={{ textAlign: 'right' }}>
              状态
            </Col>
          </Row>

          {/* 选手行 */}
          <Space direction="vertical" style={{ width: '100%' }} size={0}>
            {players.map((player) => (
              <Row
                key={player.id}
                align="middle"
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <Col span={2} style={{ textAlign: 'center' }}>
                  {player.rank && player.rank <= 3 ? ['🥇','🥈','🥉'][player.rank - 1] : ''}
                </Col>
                <Col span={8}>
                  <Text
                    strong
                    style={{
                      fontSize: 13,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {player.nickname || player.name || `选手${player.id}`}
                  </Text>
                  {player.playerId && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {player.playerId}
                    </Text>
                  )}
                </Col>
                <Col span={6} style={{ textAlign: 'right' }}>
                  <Text strong style={{ color: '#1890ff', fontSize: 13 }}>
                    {player.scoreText}
                  </Text>
                </Col>
                <Col span={6} style={{ textAlign: 'right' }}>
                  <Tag
                    color={player.finishClass}
                    style={{ fontSize: 11, borderRadius: 12, margin: 0 }}
                  >
                    {player.finishText}
                  </Tag>
                </Col>
              </Row>
            ))}
          </Space>

          {/* 加载更多 */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 16, background: '#fff' }}>
              <Spin />
            </div>
          )}
          {!playerHasMore && players.length > 0 && (
            <div style={{ textAlign: 'center', padding: 16, color: '#8c8c8c' }}>
              — 已加载全部 —
            </div>
          )}
          {playerHasMore && !loading && (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Button type="link" onClick={loadMorePlayers}>
                加载更多
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* 空状态 */}
      {isEmpty && !loading && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 64, opacity: 0.4, marginBottom: 16 }}>👤</div>
          <Text type="secondary" style={{ fontSize: 14 }}>
            暂无参赛选手
          </Text>
        </div>
      )}

      {actionLoading && <Spin style={{ position: 'fixed', top: '50%', left: '50%' }} />}
    </div>
  );
};

export default OperatorRaceDetail;
