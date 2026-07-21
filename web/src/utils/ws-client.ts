// 裁判端 - WebSocket 客户端

export interface WsOptions {
  reconnectInterval?: number;
  maxReconnect?: number;
  heartbeatInterval?: number;
  autoResubscribe?: boolean;
}

type MessageHandler = (data: unknown) => void;
type StatusCallback = (status: string) => void;

export const DEFAULT_WS_OPTIONS: WsOptions = {
  reconnectInterval: 3000,
  maxReconnect: 10,
  heartbeatInterval: 30000,
  autoResubscribe: true,
};

export class WsClient {
  private ws: WebSocket | null = null;
  private url = '';
  private options: WsOptions = {};
  private status: string = 'disconnected';
  private handlers: Record<string, MessageHandler[]> = {};
  private statusCallbacks: StatusCallback[] = [];
  private reconnectCount = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  connect(wsUrl: string, opts?: WsOptions): void {
    if (this.ws && this.url === wsUrl && this.status === 'connected') {
      return;
    }
    this.close();

    this.url = wsUrl;
    this.options = { ...DEFAULT_WS_OPTIONS, ...opts };
    this.intentionalClose = false;
    this.reconnectCount = 0;
    this.setStatus('connecting');

    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error('[WS] 创建 WebSocket 失败', err);
      this.setStatus('disconnected');
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] 连接成功');
      this.setStatus('connected');
      this.reconnectCount = 0;
      this.startHeartbeat();

      const token = localStorage.getItem('referee_token');
      if (token) {
        this.send('auth', { token });
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // 非 JSON 消息，跳过
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log('[WS] 连接关闭', event.code, event.reason);
      this.stopHeartbeat();
      this.setStatus('closed');

      if (!this.intentionalClose && this.options.maxReconnect !== undefined) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err: Event) => {
      console.error('[WS] 连接错误', err);
      this.stopHeartbeat();
      this.setStatus('disconnected');

      if (!this.intentionalClose && this.options.maxReconnect !== undefined) {
        this.scheduleReconnect();
      }
    };
  }

  on(event: string, fn: MessageHandler): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event]!.push(fn);
  }

  off(event: string, fn: MessageHandler): void {
    const list = this.handlers[event];
    if (list) {
      this.handlers[event] = list.filter((f) => f !== fn);
    }
  }

  send(event: string, data: unknown): void {
    if (this.ws && this.status === 'connected') {
      this.ws.send(JSON.stringify({ event, data, timestamp: Date.now() }));
    } else {
      console.warn('[WS] 未连接，消息未发送', event);
    }
  }

  close(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setStatus('disconnected');
  }

  onStatusChange(cb: StatusCallback): void {
    this.statusCallbacks.push(cb);
  }

  getStatus(): string {
    return this.status;
  }

  private handleMessage(msg: { event?: string; data?: unknown }): void {
    const event = msg.event;
    const data = msg.data;
    const eventHandlers = this.handlers[event ?? ''] || [];
    for (const handler of eventHandlers) {
      try {
        handler(data);
      } catch (e) {
        console.error('[WS] 消息处理错误', event, e);
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.options.heartbeatInterval || 30000;
    this.heartbeatTimer = setInterval(() => {
      if (this.status === 'connected') {
        this.send('ping', {});
      } else {
        this.stopHeartbeat();
      }
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const maxReconnect = this.options.maxReconnect || 0;
    if (maxReconnect > 0 && this.reconnectCount >= maxReconnect) {
      console.warn('[WS] 达到最大重连次数，停止重连');
      return;
    }

    const delay = this.options.reconnectInterval || 3000;
    this.reconnectCount++;
    console.log(`[WS] ${delay}ms 后进行第 ${this.reconnectCount} 次重连`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionalClose && this.status !== 'connected') {
        this.doConnect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: string): void {
    this.status = status;
    this.notifyStatus();
  }

  private notifyStatus(): void {
    const status = this.status;
    for (const cb of this.statusCallbacks) {
      try {
        cb(status);
      } catch {
        // 忽略回调错误
      }
    }
  }
}

// 全局单例
export const wsClient = new WsClient();
