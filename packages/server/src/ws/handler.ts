import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { getCurrentScreenData } from '../routes/referees';

// 存储所有连接的客户端，按房间分组
const rooms = new Map<string, Set<WebSocket>>();
const clientRooms = new Map<WebSocket, string>();
const screenClients = new Set<WebSocket>();
const refereeClients = new Set<WebSocket>();

// 激活码映射: code → { ws, venueId?, venueName?, createdAt }
const activationCodes = new Map<string, {
  ws: WebSocket;
  venueId?: string;
  venueName?: string;
  createdAt: number;
}>();

const ACTIVATION_CODE_TTL = 60_000; // 60秒

function cleanExpiredCodes() {
  const now = Date.now();
  for (const [code, entry] of activationCodes.entries()) {
    if (now - entry.createdAt > ACTIVATION_CODE_TTL) {
      activationCodes.delete(code);
    }
  }
}

export function validateActivationCode(code: string): { valid: boolean; ws?: WebSocket; venueId?: string; venueName?: string } {
  cleanExpiredCodes();
  const entry = activationCodes.get(code);
  if (!entry) return { valid: false };
  if (Date.now() - entry.createdAt > ACTIVATION_CODE_TTL) {
    activationCodes.delete(code);
    return { valid: false };
  }
  return { valid: true, ws: entry.ws, venueId: entry.venueId, venueName: entry.venueName };
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
    const screenData = getCurrentScreenData ? getCurrentScreenData() : null;
    if (screenData) {
      ws.send(JSON.stringify({ type: 'screen_data', data: screenData }));
    }
  }

  // 裁判客户端单独跟踪（用于推送 venue 状态变更）
  if (REFEREE_PATHS.includes(path)) {
    refereeClients.add(ws);
  }
}

function handleClose(ws: WebSocket) {
  screenClients.delete(ws);
  refereeClients.delete(ws);
  // 清理该 ws 对应的激活码映射
  for (const [code, entry] of activationCodes.entries()) {
    if (entry.ws === ws) activationCodes.delete(code);
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
      // 客户端主动请求当前数据
      const data = getCurrentScreenData();
      ws.send(JSON.stringify({ type: 'screen_data', data }));
      break;
    }

    case 'screen_login': {
      // 大屏生成激活码后注册映射
      const code = msg.activation_code;
      if (!code || typeof code !== 'string') break;
      cleanExpiredCodes();
      activationCodes.set(code, { ws, createdAt: Date.now() });
      ws.send(JSON.stringify({ type: 'login_ack', message: '等待裁判扫码' }));
      break;
    }

    case 'get_activation_code': {
      // 查询有效激活码列表（不暴露 ws 对象）
      cleanExpiredCodes();
      const codes: string[] = [];
      activationCodes.forEach((_entry, c) => codes.push(c));
      ws.send(JSON.stringify({ type: 'activation_codes', codes }));
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

const wssScreen = new WebSocketServer({ noServer: true });
const wssReferee = new WebSocketServer({ noServer: true });

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

/** 向所有大屏客户端 + 所有裁判端客户端广播消息 */
export function broadcastToScreen(data: any) {
  // 已经是 type=screen_data 格式或 event 格式都直接透传
  const isRaw = data.event || data.type === 'screen_data';
  // 注入 venue_status 防止大屏端丢失导致回退到 mock 的 inactive
  if (!isRaw && data.venue_status === undefined) {
    data.venue_status = 'open';
  }
  const msg = JSON.stringify(isRaw ? data : { type: 'screen_data', data });
  let screenCount = 0;
  screenClients.forEach((ws) => {
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
  console.log(`[WS] 已广播 ${isRaw ? data.event : 'screen_data'} 给 ${screenCount} 个大屏 + ${refereeCount} 个裁判客户端`);
}
