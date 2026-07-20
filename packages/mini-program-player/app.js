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

    // 注：开发环境不再自动清空登录态，开发者手动清缓存即可

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
   *   - options.query.operator_id / venue_id（普通带参链接 / 编译模式）
   *   - options.scene 解析（微信扫码 scene 参数）
   *     scene 格式: o{operatorId前14位无连字符}v{venueId前14位无连字符}
   *     scene 限制 32 字节，前缀 o/v 各 1 字符，UUID 各取前 14 字符 = 30 字符
   * 新参数会覆盖旧的 globalData，实现跨运营商扫码切换
   */
  _parseContextParams: function (options) {
    if (!options) return;

    var operatorId = null;
    var venueId = null;

    // 方式1: query 直接传参（编译模式可用）
    if (options.query) {
      operatorId = options.query.operator_id || options.query.operatorId || null;
      venueId = options.query.venue_id || options.query.venueId || null;
    }

    // 方式2: scene 解析（微信扫码进入）
    if (!operatorId && options.scene) {
      var scene = decodeURIComponent(options.scene);

      // 尝试 o{xx}v{yy} 格式 — 微信小程序码 scene
      if (scene.indexOf('o') === 0) {
        var vIdx = scene.indexOf('v');
        if (vIdx > 1) {
          var opPrefix = scene.substring(1, vIdx);
          var venPrefix = scene.substring(vIdx + 1);
          // 从 localStorage 或缓存中查找完整的 operator_id
          // 由于 scene 只有前 14 位，需后端查询完整 UUID
          // 先存储前缀 → 后端 bind-context 接口会处理完整匹配
          operatorId = opPrefix;
          venueId = venPrefix;
          console.log('[App] scene 解析: opPrefix=' + opPrefix + ', venPrefix=' + venPrefix);
        }
      }

      // 兼容 key=value 格式
      if (!operatorId && scene.indexOf('=') !== -1) {
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
