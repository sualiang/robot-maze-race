// app.js - 玩家端小程序入口
var storage = require('./utils/storage');
var auth = require('./utils/auth');
var request = require('./utils/request');

App({
  globalData: {
    userInfo: null,
    token: null,
    isLoggedIn: false,
    systemInfo: null,
    scanData: null,   // 存储扫码结果，用于跨页面传递
    operatorId: null, // 运营商 ID（从扫码/启动参数解析）
    venueId: null,    // 赛场 ID
  },

  onLaunch: function (options) {
    var that = this;
    try {
      var info = wx.getSystemInfoSync();
      that.globalData.systemInfo = info;
    } catch (e) {}

    // 开发版/体验版自动清空登录态，方便本地调试（正式版不受影响）
    try {
      var accountInfo = wx.getAccountInfoSync();
      if (accountInfo && accountInfo.miniProgram &&
          (accountInfo.miniProgram.envVersion === 'develop' || accountInfo.miniProgram.envVersion === 'trial')) {
        storage.removeSync(storage.STORAGE_KEYS.TOKEN);
        storage.removeSync(storage.STORAGE_KEYS.USER);
      }
    } catch (e) {}

    var token = storage.getSync(storage.STORAGE_KEYS.TOKEN);
    if (token) {
      that.globalData.token = token;
      that.globalData.isLoggedIn = true;
      var user = storage.getSync(storage.STORAGE_KEYS.USER);
      if (user) that.globalData.userInfo = user;
    }

    // 解析冷启动参数（扫码/带参进入）
    that._parseContextParams(options);
    // 已登录状态立即同步运营商上下文
    if (that.globalData.isLoggedIn && that.globalData.operatorId) {
      that._syncOperatorContext();
    }
  },

  onShow: function (options) {
    // 热启动：已打开小程序 → 扫码进入（覆盖旧上下文）
    this._parseContextParams(options);
    // 已登录且带参，同步后端上下文
    if (this.globalData.isLoggedIn && this.globalData.operatorId) {
      this._syncOperatorContext();
    }
  },

  /**
   * 解析小程序启动/切入参数，提取 operator_id 和 venue_id
   * 支持方式：
   *   - options.query.operator_id / venue_id（普通带参链接）
   *   - options.scene 解析（扫码 scene 参数，格式: operator_id=XXX&venue_id=YYY）
   * 新参数会覆盖旧的 globalData，实现跨运营商扫码切换
   */
  _parseContextParams: function (options) {
    if (!options) return;

    var operatorId = null;
    var venueId = null;

    // 方式1: query 直接传参
    if (options.query) {
      operatorId = options.query.operator_id || options.query.operatorId || null;
      venueId = options.query.venue_id || options.query.venueId || null;
    }

    // 方式2: scene 字符串解析（微信扫码进入时 scene 字段可见）
    if (!operatorId && options.scene) {
      var scene = decodeURIComponent(options.scene);
      // 支持 key=value 键值对格式，用 & 分隔
      var parts = scene.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        var key = kv[0];
        var val = kv.length > 1 ? kv.slice(1).join('=') : '';
        if (key === 'operator_id' || key === 'operatorId') {
          operatorId = val;
        } else if (key === 'venue_id' || key === 'venueId') {
          venueId = val;
        }
      }
    }

    if (operatorId) {
      // 跨运营商扫码切换：新值覆盖旧值
      console.log('[App] 检测到运营商上下文: operatorId=' + operatorId + ', venueId=' + (venueId || '无'));
      this.globalData.operatorId = operatorId;
      this.globalData.venueId = venueId || null;
      // 持久化到本地存储，防止冷启动丢失
      storage.setSync('player_operator_id', operatorId);
      if (venueId) {
        storage.setSync('player_venue_id', venueId);
      } else {
        storage.removeSync('player_venue_id');
      }
    }
  },

  /**
   * 同步运营商上下文到后端 Redis（需已登录）
   * 后端接口 POST /api/v1/player/context/set
   */
  _syncOperatorContext: function () {
    var that = this;
    var operatorId = that.globalData.operatorId;
    var venueId = that.globalData.venueId;

    if (!operatorId) return;

    var payload = { operatorId: operatorId };
    if (venueId) payload.venueId = venueId;

    request.silentPost('/player/context/set', payload)
      .then(function () {
        console.log('[App] 运营商上下文已同步: ' + operatorId);
      })
      .catch(function (err) {
        console.warn('[App] 运营商上下文同步失败:', err);
      });
  },

  wxLogin: function () {
    return auth.wxLogin();
  },

  checkLogin: function () {
    return auth.checkLogin();
  },

  logout: function () {
    auth.logout();
  }
});
