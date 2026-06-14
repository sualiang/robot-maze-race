// 裁判端 - WebSocket 连接封装
var DEFAULT_OPTIONS = {
  reconnectInterval: 3000,
  maxReconnect: 10,
  heartbeatInterval: 30000,
  autoResubscribe: true
};

function WsClient() {
  this.task = null;
  this.url = '';
  this.options = {};
  this.status = 'disconnected';
  this.handlers = {};
  this.statusCallbacks = [];
  this.reconnectCount = 0;
  this.heartbeatTimer = null;
  this.reconnectTimer = null;
  this.intentionalClose = false;
}

// 连接 WebSocket
WsClient.prototype.connect = function(wsUrl, opts) {
  if (this.task && this.url === wsUrl && this.status === 'connected') {
    return;
  }
  this.close();

  this.url = wsUrl;
  this.options = Object.assign({}, DEFAULT_OPTIONS, opts || {});
  this.intentionalClose = false;
  this.reconnectCount = 0;
  this.setStatus('connecting');

  this.doConnect();
};

// 执行连接
WsClient.prototype.doConnect = function() {
  var that = this;

  if (this.task) {
    this.task.close({});
  }

  this.setStatus('connecting');

  var task = wx.connectSocket({
    url: this.url,
    header: {
      'content-type': 'application/json'
    }
  });

  this.task = task;

  task.onOpen(function() {
    console.log('[WS] 连接成功');
    that.setStatus('connected');
    that.reconnectCount = 0;
    that.startHeartbeat();

    var token = wx.getStorageSync('referee_token');
    if (token) {
      that.send('auth', { token: token });
    }
  });

  task.onMessage(function(res) {
    try {
      var msg = JSON.parse(res.data);
      that.handleMessage(msg);
    } catch (e) {
      // 非 JSON 消息，跳过
    }
  });

  task.onClose(function(res) {
    console.log('[WS] 连接关闭', res.code, res.reason);
    that.stopHeartbeat();
    that.setStatus('closed');

    if (!that.intentionalClose && that.options.maxReconnect !== undefined) {
      that.scheduleReconnect();
    }
  });

  task.onError(function(err) {
    console.error('[WS] 连接错误', err);
    that.stopHeartbeat();
    that.setStatus('disconnected');

    if (!that.intentionalClose && that.options.maxReconnect !== undefined) {
      that.scheduleReconnect();
    }
  });
};

// 订阅消息事件
WsClient.prototype.on = function(event, fn) {
  if (!this.handlers[event]) {
    this.handlers[event] = [];
  }
  this.handlers[event].push(fn);
};

// 取消订阅
WsClient.prototype.off = function(event, fn) {
  var list = this.handlers[event];
  if (list) {
    this.handlers[event] = list.filter(function(f) { return f !== fn; });
  }
};

// 发送消息
WsClient.prototype.send = function(event, data) {
  if (this.task && this.status === 'connected') {
    this.task.send({
      data: JSON.stringify({ event: event, data: data, timestamp: Date.now() })
    });
  } else {
    console.warn('[WS] 未连接，消息未发送', event);
  }
};

// 关闭连接
WsClient.prototype.close = function() {
  this.intentionalClose = true;
  this.stopHeartbeat();
  this.clearReconnectTimer();

  if (this.task) {
    this.task.close({});
    this.task = null;
  }

  this.setStatus('disconnected');
};

// 监听连接状态变化
WsClient.prototype.onStatusChange = function(cb) {
  this.statusCallbacks.push(cb);
};

// 获取当前连接状态
WsClient.prototype.getStatus = function() {
  return this.status;
};

// 处理接收到的消息
WsClient.prototype.handleMessage = function(msg) {
  var event = msg.event;
  var data = msg.data;
  var eventHandlers = this.handlers[event] || [];
  for (var i = 0; i < eventHandlers.length; i++) {
    try {
      eventHandlers[i](data);
    } catch (e) {
      console.error('[WS] 消息处理错误', event, e);
    }
  }
};

// 开始心跳
WsClient.prototype.startHeartbeat = function() {
  this.stopHeartbeat();
  var interval = this.options.heartbeatInterval || 30000;
  var that = this;
  this.heartbeatTimer = setInterval(function() {
    if (that.status === 'connected') {
      that.send('ping', {});
    } else {
      that.stopHeartbeat();
    }
  }, interval);
};

// 停止心跳
WsClient.prototype.stopHeartbeat = function() {
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
};

// 调度重连
WsClient.prototype.scheduleReconnect = function() {
  var maxReconnect = this.options.maxReconnect || 0;
  if (maxReconnect > 0 && this.reconnectCount >= maxReconnect) {
    console.warn('[WS] 达到最大重连次数，停止重连');
    return;
  }

  var delay = this.options.reconnectInterval || 3000;
  this.reconnectCount++;
  console.log('[WS] ' + delay + 'ms 后进行第 ' + this.reconnectCount + ' 次重连');

  var that = this;
  this.reconnectTimer = setTimeout(function() {
    if (!that.intentionalClose && that.status !== 'connected') {
      that.doConnect();
    }
  }, delay);
};

// 清除重连定时器
WsClient.prototype.clearReconnectTimer = function() {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
};

// 更新状态并通知
WsClient.prototype.setStatus = function(status) {
  this.status = status;
  this.notifyStatus();
};

// 通知状态回调
WsClient.prototype.notifyStatus = function() {
  var status = this.status;
  for (var i = 0; i < this.statusCallbacks.length; i++) {
    try {
      this.statusCallbacks[i](status);
    } catch (e) {
      // 忽略回调错误
    }
  }
};

// 全局单例
var wsClient = new WsClient();

// 便捷函数
function connect(url) {
  wsClient.connect(url);
}

function on(event, fn) {
  wsClient.on(event, fn);
}

function off(event, fn) {
  wsClient.off(event, fn);
}

function send(event, data) {
  wsClient.send(event, data);
}

function close() {
  wsClient.close();
}

function onStatusChange(cb) {
  wsClient.onStatusChange(cb);
}

function getStatus() {
  return wsClient.getStatus();
}

// 工厂函数：创建新实例（绕过 Babel 编译构造函数问题）
function createWsClient() {
  return new WsClient();
}

module.exports = {
  WsClient: WsClient,
  createWsClient: createWsClient
};
