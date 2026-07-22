import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { getCurrentScreenData, broadcastAfterUpdate, getCachedVenueId, getCachedVenueName, fetchLeaderboardFromDb, fetchScreenDataFromDb } from '../routes/referees';
import { setTempToken, getTempToken, listTempTokensWithData, deleteTempToken } from '../utils/temp-token';

// 存储所有连接的客户端，按房间分组
const rooms = new Map<string, Set<WebSocket>>();
const clientRooms = new Map<WebSocket, string>();
const screenClients = new Set<WebSocket>();
// 大屏 WebSocket → venueId 映射（解决跨运营商 screen_data 串数据问题）
const screenVenueMap = new Map<WebSocket, string>();
const refereeClients = new Set<WebSocket>();

// 激活码关联的 WebSocket（用于激活后回推通知）
// Redis 存 data，内存存 ws 引用（ws 不能序列化）
const activationCodeWs = new Map<string, WebSocket>();

export async function validateActivationCode(code: string): Promise<{ valid: boolean; ws?: WebSocket; venueId?: string; venueName?: string }> {
  const data = await getTempToken<{ venueId?: string; venueName?: string }>('activation_code', code);
  if (!data) return { valid: false };
  const ws = activationCodeWs.get(code);
  return { valid: true, ws, venueId: data.venueId, venueName: data.venueName };
}

function handleConnection(ws: WebSocket, req: IncomingMessage) {
  console.log('[WS] 客户端已连接:', req.url);

  // 发送连接成功消息
  ws.send(JSON.stringify({
    event: 'connected',
    data: { status: 'ok', timestamp: new Date().toISOString() }
  }));

  const path = req.url || '';

  // 如果是大屏客户端，立即发送当前赛场数据
  if (path.includes('/ws/screen')) {
    screenClients.add(ws);
    // 不在这里推送 screen_data——需要等大屏发 screen_login 带 venueId
    // 以该 venueId 为准查询对应赛场数据，避免全局 cachedVenueId 串数据
  }

  // 裁判客户端单独跟踪（用于推送 venue 状态变更）
  if (REFEREE_PATHS.includes(path)) {
    refereeClients.add(ws);
  }
}

async function handleClose(ws: WebSocket) {
  screenClients.delete(ws);
  screenVenueMap.delete(ws);
  refereeClients.delete(ws);
  // 清理内存 ws 映射，但保留 Redis 激活码（靠 TTL 自然过期）
  // 大屏 WS 重连后会重新发 screen_login 注册新的
  for (const [code, storedWs] of activationCodeWs.entries()) {
    if (storedWs === ws) {
      activationCodeWs.delete(code);
    }
  }
  const room = clientRooms.get(ws);
  if (room) {
    const clients = rooms.get(room);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) rooms.delete(room);
    }
    clientRooms.delete(ws);
  }
  console.log('[WS] 客户端断开');
}

function handleMessage(ws: WebSocket, msg: any) {
  // 兼容大屏端的 { type: 'xxx' } 格式
  const event = msg.event || msg.type || '';
  if (!event) return;

  switch (event) {
    case 'ping':
      ws.send(JSON.stringify({ event: 'pong', data: { timestamp: Date.now() } }));
      break;

    case 'subscribe':
    case 'sub': // 兼容简写
      const oldRoom = clientRooms.get(ws);
      if (oldRoom) {
        const oldClients = rooms.get(oldRoom);
        if (oldClients) {
          oldClients.delete(ws);
          if (oldClients.size === 0) rooms.delete(oldRoom);
        }
      }

      const newRoom = msg.data?.room || msg.channel || 'default';
      if (!rooms.has(newRoom)) rooms.set(newRoom, new Set());
      rooms.get(newRoom)!.add(ws);
      clientRooms.set(ws, newRoom);
      ws.send(JSON.stringify({ event: 'subscribed', data: { room: newRoom } }));
      break;

    case 'get_screen_data': {
      // 客户端主动请求当前数据，从 DB 恢复状态
      (async () => {
        const data = getCurrentScreenData();
        const cachedVId = data.venue_id || getCachedVenueId();
        // 检查该大屏是否已通过 screen_login 注册了 venueId
        const screenVenueId = screenVenueMap.get(ws);
        // 如果大屏的 venueId 跟全局缓存的不匹配，返回 inactive 状态
        if (screenVenueId && cachedVId !== screenVenueId) {
          data.venue_id = screenVenueId;
          data.venue_status = 'inactive';
          data.leaderboard = [];
        } else if (cachedVId) {
          try {
            // 并行查 leaderboard 和赛场状态（racing/paused/finished）
            const [leaderboard, screenData] = await Promise.all([
              fetchLeaderboardFromDb(cachedVId),
              fetchScreenDataFromDb(cachedVId),
            ]);
            data.leaderboard = leaderboard.map((e: any) => ({
              rank: e.rank,
              nickname: e.name,
              finish_time_ms: e.elapsed,
              status: e.status,
              avatar_url: e.avatar || undefined,
            }));
            // 用 DB 中的真实状态覆盖 getCurrentScreenData 的默认值
            data.race_status = screenData.race_status;
            data.current_racer = screenData.current_racer;
            data.elapsed_ms = screenData.elapsed_ms;
            data.start_time = screenData.start_time;
            data.next_racer = screenData.next_racer;
            data.queue = screenData.queue;
            data.last_result = screenData.last_result;
          } catch (e: any) {
            console.error('[WS] get_screen_data fetch error:', e.message);
          }
        }
        ws.send(JSON.stringify({ type: 'screen_data', data }));
      })();
      break;
    }

    case 'screen_login': {
      // 大屏生成激活码后注册到 Redis + 内存 ws 引用
      const code = msg.activation_code;
      if (!code || typeof code !== 'string') break;
      const venueId = msg.venueId || undefined;
      let venueName = msg.venueName || undefined;
      // 记录 ws → venueId 映射，解决跨运营商大屏数据串问题
      if (venueId) {
        screenVenueMap.set(ws, venueId);
        // 用 IIFE 包裹异步逻辑
        (async () => {
          // 如果 URL 没传 venueName，尝试从全局缓存取（裁判已签到的情况下）
          if (!venueName && venueId === getCachedVenueId()) {
            venueName = getCachedVenueName();
          }
          // 大屏注册时 venueId 是在 URL 传过来的，用它拉对应赛场数据
          // 避免使用全局 cachedVenueId（那是裁判操作设置的，可能指向其他赛场）
          const screenData = getCurrentScreenData();
          const screenVenue = screenData?.venue_id;
          if (screenVenue !== venueId) {
            // 全局 cachedVenueId 跟当前大屏不匹配，用正确的 venueId 构造初始数据
            const initialData = {
              race_status: 'idle',
              venue_status: 'inactive',
              current_racer: null,
              elapsed_ms: 0,
              start_time: null,
              next_racer: null,
              queue: [],
              venue_name: venueName || '',
              venue_id: venueId,
              leaderboard: [],
              last_result: null,
              timestamp: new Date().toISOString(),
            };
            ws.send(JSON.stringify({ type: 'screen_data', data: initialData }));
          } else {
            // venueId 匹配，直接推送当前数据
            ws.send(JSON.stringify({ type: 'screen_data', data: screenData }));
          }
          // 异步拉 DB 排行榜 + 赛场状态，覆盖 getCurrentScreenData 的 inactive 默认值
          setImmediate(() => {
            Promise.all([
              fetchLeaderboardFromDb(venueId),
              fetchScreenDataFromDb(venueId),
            ]).then(([leaderboard, statusData]) => {
              const data = {
                ...(screenData || {}),
                leaderboard: leaderboard || [],
                venue_id: venueId,
                venue_name: venueName || '',
                race_status: statusData.race_status,
                current_racer: statusData.current_racer,
                elapsed_ms: statusData.elapsed_ms,
                start_time: statusData.start_time,
                next_racer: statusData.next_racer,
                queue: statusData.queue,
                last_result: statusData.last_result,
              };
              ws.send(JSON.stringify({ type: 'screen_data', data }));
            }).catch(() => {});
          });
        })();
      }
      setTempToken('activation_code', code, { venueId, venueName }, 300).catch((err) =>
        console.error('[WS] setTempToken error:', err.message),
      );
      activationCodeWs.set(code, ws);
      ws.send(JSON.stringify({ type: 'login_ack', message: '等待裁判扫码', venue_name: venueName || '', venue_id: venueId || '' }));
      break;
    }

    case 'get_activation_code': {
      // 查询有效激活码列表
      listTempTokensWithData('activation_code').then((codeData) => {
        const codes: string[] = [];
        codeData.forEach((_data, c) => codes.push(c));
        ws.send(JSON.stringify({ type: 'activation_codes', codes }));
      }).catch(() => {
        ws.send(JSON.stringify({ type: 'activation_codes', codes: [] }));
      });
      break;
    }

    default:
      const room = clientRooms.get(ws);
      if (room) {
        const clients = rooms.get(room);
        if (clients) {
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(msg.event ? msg : { event, data: msg.data }));
            }
          });
        }
      }
      break;
  }
}

function setupWSS(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const path = req.url || '';
    if (path.includes('/ws/screen')) {
      screenClients.add(ws);
    }
    if (REFEREE_PATHS.includes(path)) {
      refereeClients.add(ws);
    }
    handleConnection(ws, req);
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (e) {
        console.error('[WS] 消息解析失败');
      }
    });
    ws.on('close', (code, reason) => { console.log(`[WS] 关闭: code=${code} reason=${reason?.toString() || ''}`); handleClose(ws); });
    ws.on('error', (err) => console.error('[WS] 连接错误:', err.message));
  });
}

const SCREEN_PATH = '/ws/screen';
const REFEREE_PATHS = ['/ws/referee', '/api/v1/ws/referee'];

const wssScreen = new WebSocketServer({ noServer: true, pingInterval: 10000 });
const wssReferee = new WebSocketServer({ noServer: true, pingInterval: 30000 });

setupWSS(wssScreen);
setupWSS(wssReferee);

export function setupWebSocket(server: Server) {
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = req.url || '';
    if (url === SCREEN_PATH) {
      wssScreen.handleUpgrade(req, socket, head, (ws) => {
        wssScreen.emit('connection', ws, req);
      });
    } else if (REFEREE_PATHS.includes(url)) {
      wssReferee.handleUpgrade(req, socket, head, (ws) => {
        wssReferee.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  console.log('[WS] WebSocket 服务已启动 (路径: /ws/screen, /ws/referee, /api/v1/ws/referee)');
  return [wssScreen, wssReferee];
}

/** 向指定 venueId 的大屏 + 所有裁判端广播消息 */
export function broadcastToScreen(venueId: string, data: any) {
  // 已经是 type=screen_data 格式或 event 格式都直接透传
  const isRaw = data.event || data.type === 'screen_data';
  // 注入 venue_status 防止大屏端丢失导致回退到 mock 的 inactive
  if (!isRaw && data.venue_status === undefined) {
    data.venue_status = 'open';
  }
  const msg = JSON.stringify(isRaw ? data : { type: 'screen_data', data });
  let screenCount = 0;
  screenClients.forEach((ws) => {
    // venueId 隔离：只发给匹配的大屏（未指定时广播所有，兼容旧调用）
    if (venueId && screenVenueMap.get(ws) !== venueId) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      screenCount++;
    }
  });
  // 也发给所有裁判客户端（用于 venue 状态同步）
  let refereeCount = 0;
  refereeClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      refereeCount++;
    }
  });
  console.log(`[WS] 已广播 ${isRaw ? data.event : 'screen_data'} venueId=${venueId || 'all'} 给 ${screenCount} 个大屏 + ${refereeCount} 个裁判客户端`);
}
