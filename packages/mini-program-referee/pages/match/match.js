/** 比赛操作状态 */

// ==================== 内联 WebSocket 逻辑（绕过 Babel require/new 断层） ====================

var DEFAULT_WS_OPTIONS = {
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

WsClient.prototype.connect = function(wsUrl, opts) {
  if (this.task && this.url === wsUrl && this.status === 'connected') {
    return;
  }
  this.close();

  this.url = wsUrl;
  this.options = Object.assign({}, DEFAULT_WS_OPTIONS, opts || {});
  this.intentionalClose = false;
  this.reconnectCount = 0;
  this.setStatus('connecting');

  this.doConnect();
};

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

WsClient.prototype.on = function(event, fn) {
  if (!this.handlers[event]) {
    this.handlers[event] = [];
  }
  this.handlers[event].push(fn);
};

WsClient.prototype.off = function(event, fn) {
  var list = this.handlers[event];
  if (list) {
    this.handlers[event] = list.filter(function(f) { return f !== fn; });
  }
};

WsClient.prototype.send = function(event, data) {
  if (this.task && this.status === 'connected') {
    this.task.send({
      data: JSON.stringify({ event: event, data: data, timestamp: Date.now() })
    });
  } else {
    console.warn('[WS] 未连接，消息未发送', event);
  }
};

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

WsClient.prototype.onStatusChange = function(cb) {
  this.statusCallbacks.push(cb);
};

WsClient.prototype.getStatus = function() {
  return this.status;
};

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

WsClient.prototype.stopHeartbeat = function() {
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
};

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

WsClient.prototype.clearReconnectTimer = function() {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
};

WsClient.prototype.setStatus = function(status) {
  this.status = status;
  this.notifyStatus();
};

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

// 创建全局 WebSocket 客户端实例
var wsClient = new WsClient();

// ==================== 内联 Request 逻辑（不再依赖 require） ====================

var BASE_URL = 'http://192.168.110.136:3000/api/v1';

function apiRequest(url, options) {
  var opts = options || {};
  var method = opts.method || 'GET';
  var data = opts.data;
  var header = opts.header || {};
  var skipAuth = opts.skipAuth;

  return new Promise(function(resolve, reject) {
    var token = skipAuth ? null : wx.getStorageSync('referee_token');

    wx.request({
      url: url.indexOf('http') === 0 ? url : BASE_URL + url,
      method: method,
      data: data,
      header: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        header
      ),
      success: function(res) {
        var statusCode = res.statusCode;
        var body = res.data;

        if (statusCode === 200 && body && body.code === 0) {
          resolve(body.data);
        } else if (statusCode === 401) {
          wx.removeStorageSync('referee_token');
          wx.removeStorageSync('referee_user_info');

          var app = getApp();
          app.globalData.isRefereeCertified = false;
          app.globalData.userInfo = null;

          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('登录已过期，请重新登录'));
        } else {
          var errMsg = (body && body.message) || '请求失败(' + statusCode + ')';
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(body || new Error(errMsg));
        }
      },
      fail: function(err) {
        console.error('[Request] 网络请求失败:', url, err);

        if (opts.offlineFallback && opts.offlineAction) {
          var app = getApp();
          app.globalData.offlineQueue.push({
            action: opts.offlineAction,
            payload: data || {},
            timestamp: Date.now()
          });
          wx.showToast({ title: '网络异常，操作已本地缓存', icon: 'none' });
          resolve({});
          return;
        }

        wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
        reject(err);
      }
    });
  });
}

function apiGet(url, params) {
  var fullUrl = url;
  if (params) {
    var parts = [];
    for (var k in params) {
      if (params[k] !== undefined && params[k] !== null) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
      }
    }
    if (parts.length > 0) fullUrl += '?' + parts.join('&');
  }
  return apiRequest(fullUrl, { method: 'GET', data: params });
}

function apiPost(url, data) {
  return apiRequest(url, { method: 'POST', data: data });
}

// ==================== 内联 login 检查 ====================

function isLoggedIn() {
  try {
    return !!wx.getStorageSync('referee_token') && !!wx.getStorageSync('referee_user_info');
  } catch (e) {
    return false;
  }
}

// ==================== 页面数据 ====================

var TOAST_DURATION = 2500;

Page({
  data: {
    queue: [],
    currentRacer: null,
    status: 'idle',
    elapsed: 0,
    pausedElapsed: 0,
    startTime: 0,
    maxTimeout: 180,
    actionLoading: false,
    pageLoading: true,
    wsConnected: false
  },

  _timer: null,
  _destroyed: false,

  // ==================== 生命周期 ====================

  onLoad: function() {
    if (!isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    this.setupWebSocket();
    this.loadQueue();
  },

  onShow: function() {
    this._destroyed = false;
    if (!this.data.pageLoading) {
      this.loadQueue();
    }
    this.restoreTimerIfNeeded();
  },

  onHide: function() {
    // 后台时计时器继续运行
  },

  onUnload: function() {
    this._destroyed = true;
    this.clearTimer();
  },

  // ==================== WebSocket ====================

  setupWebSocket: function() {
    var self = this;

    wsClient.onStatusChange(function(status) {
      if (self._destroyed) return;
      self.setData({ wsConnected: status === 'connected' });
    });

    // 排队更新推送
    wsClient.on('queue_update', function(data) {
      if (self._destroyed) return;
      self.setData({
        queue: data.queue || [],
        currentRacer: data.currentRacer || null
      });
    });

    // 远程计时同步
    wsClient.on('timer_sync', function(data) {
      if (self._destroyed) return;
      var elapsed = data.elapsed;
      var status = data.status;
      if (typeof elapsed === 'number' && status) {
        self.setData({ elapsed: elapsed, status: status });
      }
    });

    // 成绩推送
    wsClient.on('result_push', function(data) {
      if (self._destroyed) return;
      var nickname = data.nickname;
      var finishTimeMs = data.finishTimeMs;
      var isTimeout = data.isTimeout;
      wx.showToast({
        title: nickname + ': ' + self.formatFullTime(finishTimeMs) + (isTimeout ? ' (超时)' : ''),
        icon: 'none',
        duration: TOAST_DURATION
      });
      self.loadQueue();
    });

    // 选手就位通知
    wsClient.on('racer_ready', function(data) {
      if (self._destroyed) return;
      var nickname = data.nickname;
      wx.showToast({
        title: nickname + ' 已就位',
        icon: 'none'
      });
    });

    // 初始状态
    this.setData({ wsConnected: wsClient.getStatus() === 'connected' });
  },

  // ==================== 数据加载 ====================

  loadQueue: function() {
    var self = this;
    self.setData({ pageLoading: true });
    return apiGet('/referees/match/queue').then(function(res) {
      self.setData({
        queue: res.queue || [],
        currentRacer: res.currentRacer || null,
        pageLoading: false
      });
    }).catch(function() {
      self.setData({ pageLoading: false });
      wx.showToast({ title: '加载失败，下拉刷新重试', icon: 'none' });
    });
  },

  // ==================== 选手操作 ====================

  selectRacer: function(e) {
    var racerId = e.currentTarget.dataset.id;
    if (!racerId) return;

    var racer = this.data.queue.find(function(r) { return r.id === racerId; });
    if (!racer) return;

    var self = this;
    self.setData({ actionLoading: true });
    return apiPost('/referees/match/select-racer', { racerId: racerId }).then(function() {
      var racerObj = racer;
      var updatedQueue = self.data.queue.map(function(r) {
        var obj = Object.assign({}, r);
        obj.isCurrent = r.id === racerId;
        obj.queueNumber = r.id === racerId ? 0 : (r.queueNumber > racerObj.queueNumber ? r.queueNumber - 1 : r.queueNumber);
        return obj;
      });

      self.setData({
        queue: updatedQueue,
        currentRacer: racer,
        status: 'idle',
        elapsed: 0,
        pausedElapsed: 0,
        actionLoading: false
      });

      wx.showToast({ title: '已叫号: ' + racer.nickname, icon: 'none' });
    }).catch(function() {
      self.setData({ actionLoading: false });
    });
  },

  // ==================== 秒表计时 ====================

  startRace: function() {
    if (!this.data.currentRacer) {
      wx.showToast({ title: '请先选择比赛选手', icon: 'none' });
      return;
    }
    if (this.data.status === 'running') {
      wx.showToast({ title: '比赛已在进行中', icon: 'none' });
      return;
    }

    var self = this;
    var currentRacerId = this.data.currentRacer.id;
    self.setData({ actionLoading: true });

    return apiPost('/referees/match/start', {
      racerId: currentRacerId
    }).then(function() {
      self.clearTimer();

      var now = Date.now();
      var baseElapsed = self.data.status === 'paused' ? self.data.pausedElapsed : self.data.elapsed;

      self.setData({
        status: 'running',
        elapsed: baseElapsed,
        pausedElapsed: 0,
        startTime: now,
        actionLoading: false
      });

      self.startTimerInternal(baseElapsed, now);
      self.vibrate('short');
    }).catch(function() {
      self.setData({ actionLoading: false });
    });
  },

  pauseRace: function() {
    if (this.data.status !== 'running') return;

    this.clearTimer();
    var currentElapsed = this.data.elapsed;

    this.setData({
      status: 'paused',
      pausedElapsed: currentElapsed
    });

    // 通知服务端
    apiPost('/referees/match/pause', {
      racerId: (this.data.currentRacer || {}).id,
      elapsed: currentElapsed
    }).catch(function() {});

    wx.showToast({ title: '⏸ 已暂停', icon: 'none' });
    this.vibrate('short');
  },

  endRace: function() {
    if (this.data.status !== 'running' && this.data.status !== 'paused') return;

    this.clearTimer();
    var finalTime = this.data.elapsed;
    var isTimeout = this.data.maxTimeout > 0 && finalTime >= this.data.maxTimeout * 1000;
    var raceStatus = isTimeout ? 'timeout' : 'finished';
    var self = this;
    var currentRacerId = (self.data.currentRacer || {}).id;

    self.setData({ actionLoading: true });

    return apiPost('/referees/match/end', {
      racerId: currentRacerId,
      finishTimeMs: finalTime,
      status: raceStatus
    }).then(function() {
      wx.showToast({
        title: isTimeout
          ? '⏰ 超时！' + self.formatFullTime(finalTime)
          : '🏁 ' + self.formatFullTime(finalTime),
        icon: 'none',
        duration: TOAST_DURATION
      });

      self.resetMatch();
      self.loadQueue();
    }).catch(function() {
      self.cacheOfflineResult(finalTime, raceStatus);
      self.resetMatch();
    }).finally(function() {
      self.setData({ actionLoading: false });
    });
  },

  startTimerInternal: function(baseElapsed, startTimestamp) {
    var self = this;
    var maxTimeout = this.data.maxTimeout;

    this._timer = setInterval(function() {
      if (self._destroyed) {
        self.clearTimer();
        return;
      }

      var elapsed = baseElapsed + (Date.now() - startTimestamp);

      if (maxTimeout > 0 && elapsed >= maxTimeout * 1000) {
        self.setData({ elapsed: elapsed });
        self.clearTimer();
        self.setData({ status: 'running' });
        self.endRace();
        return;
      }

      self.setData({ elapsed: elapsed });
    }, 10);
  },

  clearTimer: function() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  restoreTimerIfNeeded: function() {
    if (this.data.status === 'running' && this._timer === null) {
      var baseElapsed = this.data.elapsed;
      var now = Date.now();
      this.setData({ startTime: now });
      this.startTimerInternal(baseElapsed, now);
    }
  },

  // ==================== 异常处理 ====================

  handleMalfunction: function() {
    if (!this.data.currentRacer) return;

    var self = this;
    var racerName = this.data.currentRacer.nickname;
    var currentElapsed = this.data.elapsed;
    var currentRacerId = this.data.currentRacer.id;

    this.clearTimer();
    this.setData({ status: 'paused', pausedElapsed: currentElapsed });

    wx.showModal({
      title: '机器狗故障确认',
      content: racerName + ' 的机器狗发生故障？\n\n• 选手保留参赛次数\n• 选手将重新排队\n• 当前计时作废',
      confirmText: '确认故障',
      cancelText: '取消',
      confirmColor: '#e74c3c',
      success: (function(page, _currentElapsed, _racerName, _racerId) {
        return function(res) {
          if (!res.confirm) {
            if (!page._destroyed) {
              var now = Date.now();
              page.setData({ status: 'running', startTime: now });
              page.startTimerInternal(_currentElapsed, now);
            }
            return;
          }

          page.setData({ actionLoading: true });
          return apiPost('/referees/match/malfunction', {
            racerId: _racerId,
            elapsed: _currentElapsed
          }).then(function() {
            wx.showToast({
              title: '🤖 故障已登记，' + _racerName + '重新排队',
              icon: 'none',
              duration: TOAST_DURATION
            });

            page.resetMatch();
            page.loadQueue();
          }).catch(function() {
            var app = getApp();
            app.globalData.offlineQueue = app.globalData.offlineQueue || [];
            app.globalData.offlineQueue.push({
              action: 'malfunction',
              payload: {
                racerId: _racerId,
                elapsed: _currentElapsed,
                timestamp: Date.now()
              },
              timestamp: Date.now()
            });

            wx.showToast({
              title: '网络异常，操作已本地缓存',
              icon: 'none'
            });

            page.resetMatch();
          }).finally(function() {
            page.setData({ actionLoading: false });
          });
        };
      })(this, currentElapsed, racerName, currentRacerId)
    });
  },

  handleForfeit: function() {
    if (!this.data.currentRacer) return;

    var self = this;
    var racerName = this.data.currentRacer.nickname;
    var currentRacerId = this.data.currentRacer.id;

    this.clearTimer();

    wx.showModal({
      title: '选手弃赛确认',
      content: '确认 ' + racerName + ' 弃赛？\n\n将消耗一次参赛次数。',
      confirmText: '确认弃赛',
      confirmColor: '#e74c3c',
      success: (function(page, _racerName, _racerId) {
        return function(res) {
          if (!res.confirm) {
            if (page.data.status === 'running' && !page._destroyed) {
              var now = Date.now();
              page.setData({ startTime: now });
              page.startTimerInternal(page.data.elapsed, now);
            }
            return;
          }

          page.setData({ actionLoading: true });
          return apiPost('/referees/match/forfeit', {
            racerId: _racerId
          }).then(function() {
            wx.showToast({ title: _racerName + ' 弃赛', icon: 'none' });
            page.resetMatch();
            page.loadQueue();
          }).catch(function() {
            var app = getApp();
            app.globalData.offlineQueue = app.globalData.offlineQueue || [];
            app.globalData.offlineQueue.push({
              action: 'forfeit',
              payload: {
                racerId: _racerId,
                timestamp: Date.now()
              },
              timestamp: Date.now()
            });
            wx.showToast({ title: '网络异常，操作已缓存', icon: 'none' });
            page.resetMatch();
          }).finally(function() {
            page.setData({ actionLoading: false });
          });
        };
      })(this, racerName, currentRacerId)
    });
  },

  // ==================== 离线缓存 ====================

  cacheOfflineResult: function(elapsed, status) {
    var app = getApp();
    app.globalData.offlineQueue = app.globalData.offlineQueue || [];
    app.globalData.offlineQueue.push({
      action: 'end_race',
      payload: {
        racerId: (this.data.currentRacer || {}).id,
        finishTimeMs: elapsed,
        status: status,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });

    wx.showToast({
      title: '网络异常，结果已本地缓存',
      icon: 'none',
      duration: TOAST_DURATION
    });
  },

  // ==================== 重置 ====================

  resetMatch: function() {
    this.clearTimer();
    this.setData({
      status: 'idle',
      elapsed: 0,
      pausedElapsed: 0,
      startTime: 0,
      currentRacer: null,
      actionLoading: false
    });
  },

  // ==================== 格式化 ====================

  formatFullTime: function(ms) {
    if (ms < 0) ms = 0;
    var totalSec = Math.floor(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    var cs = Math.floor((ms % 1000) / 10);
    return String(min).padStart(2, '0') + ':' +
           String(sec).padStart(2, '0') + '.' +
           String(cs).padStart(2, '0');
  },

  formatTime: function(ms) {
    var totalSec = Math.floor(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  },

  formatMs: function(ms) {
    var cs = Math.floor((ms % 1000) / 10);
    return String(cs).padStart(2, '0');
  },

  getTimeoutPercent: function(ms) {
    if (this.data.maxTimeout <= 0) return 0;
    return Math.min(100, (ms / (this.data.maxTimeout * 1000)) * 100);
  },

  isTimeoutDanger: function(ms) {
    if (this.data.maxTimeout <= 0) return false;
    return ms >= (this.data.maxTimeout - 10) * 1000;
  },

  // ==================== 下拉刷新 ====================

  onPullDownRefresh: function() {
    var self = this;
    this.loadQueue().then(function() {
      wx.stopPullDownRefresh();
    });
  },

  // ==================== 振动反馈 ====================

  vibrate: function(type) {
    if (type === 'short') {
      wx.vibrateShort({ type: 'light' });
    } else {
      wx.vibrateLong();
    }
  }
});
