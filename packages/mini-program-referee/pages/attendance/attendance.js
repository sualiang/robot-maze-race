

var locationUtils = require('../../utils/location');
var getCurrentLocationWithAddress = locationUtils.getCurrentLocationWithAddress;
var calcDistance = locationUtils.calcDistance;
var requestAndGetLocation = locationUtils.requestAndGetLocation;

var storage = require('../../utils/storage');

// ==================== 内联请求方法（避免模块导入兼容性问题） ====================
var BASE_URL = 'http://192.168.110.136:3000/api/v1';

function _request(url, options) {
  var opts = options || {};
  var method = opts.method || 'GET';
  var data = opts.data;
  var header = opts.header || {};

  return new Promise(function(resolve, reject) {
    var token = wx.getStorageSync('referee_token');
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
        wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
        reject(err);
      }
    });
  });
}

function get(url, params) {
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
  return _request(fullUrl, { method: 'GET', data: params });
}

function post(url, data) {
  return _request(url, { method: 'POST', data: data });
}
var getVenue = storage.getVenue;
var saveVenue = storage.saveVenue;

Page({
  data: {
    status: 'unchecked',
    actionLoading: false,
    locationReady: false,
    location: null,
    venueInfo: null,
    checkInTime: '',
    durationText: '',
    records: [],
    pageLoading: true,
    distanceFromVenue: null,
    withinRange: false,
  },

  /** 签到计时器 */
  _checkInTimer: null,
  /** 是否已销毁 */
  _destroyed: false,

  // ==================== 生命周期 ====================

  onLoad() {
    this.initPage();
  },

  onShow() {
    this._destroyed = false;
    this.refreshLocation();
  },

  onHide() {
    // 停止 UI 更新但不影响签到状态
    this.stopCheckInTimer();
  },

  onUnload() {
    this._destroyed = true;
    this.stopCheckInTimer();
  },

  // ==================== 初始化 ====================

  /**
   * 页面初始化：获取定位 → 检查签到状态 → 拉取记录
   */
  initPage() {
    var self = this;
    self.setData({ pageLoading: true });

    return self.acquireLocation().catch(function(err) {
      console.warn('[Attendance] 定位未就绪:', err);
    }).then(function() {
      // ② 检查远程签到状态
      return self.checkAttendanceStatus();
    }).then(function() {
      // ③ 拉取今日记录
      return self.fetchRecords();
    }).then(function() {
      // ④ 恢复本地赛场信息
      var cachedVenue = getVenue();
      if (cachedVenue) {
        self.setData({
          venueInfo: cachedVenue,
        });
        self.checkDistance(cachedVenue.latitude, cachedVenue.longitude);
      }

      self.setData({ pageLoading: false });
    });
  },

  /**
   * 刷新定位
   */
  refreshLocation() {
    return this.acquireLocation().catch(function() {
      // 静默处理
    });
  },

  /**
   * 获取定位
   */
  acquireLocation() {
    var self = this;
    return getCurrentLocationWithAddress().then(function(location) {
      location.accuracyText = location.accuracy.toFixed(1);
      self.setData({
        location: location,
        locationReady: true,
      });

      // 如果有赛场信息，计算距离
      if (self.data.venueInfo) {
        self.checkDistance(self.data.venueInfo.latitude, self.data.venueInfo.longitude);
      }
    }).catch(function(err) {
      self.setData({ locationReady: false });
      throw err;
    });
  },

  /**
   * 请求定位权限（用户触发）
   */
  requestLocationPermission() {
    var self = this;
    return requestAndGetLocation().then(function(location) {
      self.setData({
        location: location,
        locationReady: true,
      });

      // 重新检查距离
      if (self.data.venueInfo) {
        self.checkDistance(self.data.venueInfo.latitude, self.data.venueInfo.longitude);
      }
    }).catch(function(err) {
      wx.showToast({
        title: '定位失败，请检查GPS权限',
        icon: 'none',
        duration: 2500,
      });
    });
  },

  /**
   * 检查与赛场的距离
   */
  checkDistance(venueLat, venueLng) {
    if (!this.data.location) return;

    var distance = calcDistance(
      this.data.location.latitude,
      this.data.location.longitude,
      venueLat,
      venueLng
    );

    this.setData({
      distanceFromVenue: Math.round(distance),
      withinRange: distance <= 500,
    });
  },

  // ==================== 远程状态 ====================

  /**
   * 检查远程签到状态
   */
  checkAttendanceStatus() {
    var self = this;
    return get('/referees/attendance/status').then(function(res) {
      if (res.isCheckedIn && res.venueInfo) {
        self.setData({
          status: 'checked',
          venueInfo: res.venueInfo,
          checkInTime: res.checkInTime,
        });

        // 更新全局赛场 ID
        var app = getApp();
        app.globalData.activeVenueId = res.venueInfo.id;
        app.globalData.activeVenueName = res.venueInfo.name;

        // 缓存赛场信息
        saveVenue({
          id: res.venueInfo.id,
          name: res.venueInfo.name,
          address: res.venueInfo.address,
          latitude: res.venueInfo.latitude,
          longitude: res.venueInfo.longitude,
        });

        // 启动签到计时器（显示已签到时长）
        self.startCheckInTimer();

        // 检查距离
        self.checkDistance(res.venueInfo.latitude, res.venueInfo.longitude);
      }
    }).catch(function(err) {
      console.error('[Attendance] 获取签到状态失败:', err);
    });
  },

  // ==================== 签到操作 ====================

  /**
   * 📍 签到激活赛场
   */
  checkIn() {
    if (!this.data.locationReady || !this.data.location) {
      wx.showToast({ title: '请等待GPS定位完成', icon: 'none' });
      return;
    }

    // 距离校验
    if (this.data.distanceFromVenue !== null && !this.data.withinRange) {
      wx.showModal({
        title: '不在赛场范围',
        content: `您当前位置距离赛场约 ${this.data.distanceFromVenue} 米，超过签到范围。请移动到赛场附近再签到。`,
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }

    var self = this;
    self.setData({ actionLoading: true, status: 'loading' });

    return post(
      '/referees/attendance/check-in',
      {
        latitude: self.data.location.latitude,
        longitude: self.data.location.longitude,
        address: self.data.location.address,
      }
    ).then(function(res) {
      self.setData({
        status: 'checked',
        venueInfo: res.venueInfo,
        checkInTime: res.checkInTime,
      });

      // 更新全局状态
      var app = getApp();
      app.globalData.activeVenueId = res.venueInfo.id;
      app.globalData.activeVenueName = res.venueInfo.name;

      // 缓存赛场
      saveVenue({
        id: res.venueInfo.id,
        name: res.venueInfo.name,
        address: res.venueInfo.address,
        latitude: res.venueInfo.latitude,
        longitude: res.venueInfo.longitude,
      });

      // 启动计时
      self.startCheckInTimer();

      // 振动反馈
      wx.vibrateShort({ type: 'medium' });

      wx.showToast({
        title: '✅ 签到成功！赛场已激活',
        icon: 'none',
        duration: 2000,
      });

      self.fetchRecords();
    }).catch(function() {
      self.setData({ status: 'unchecked' });
    }).finally(function() {
      self.setData({ actionLoading: false });
    });
  },

  /**
   * 🏁 签退暂停赛场
   */
  checkOut() {
    var self = this;
    self.setData({ actionLoading: true });

    return post('/referees/attendance/check-out', {
      latitude: (self.data.location || {}).latitude,
      longitude: (self.data.location || {}).longitude,
    }).then(function() {
      self.stopCheckInTimer();

      self.setData({
        status: 'unchecked',
        venueInfo: null,
        checkInTime: '',
        durationText: '',
      });

      var app = getApp();
      app.globalData.activeVenueId = null;
      app.globalData.activeVenueName = null;

      wx.vibrateShort({ type: 'medium' });

      wx.showToast({
        title: '🏁 签退成功！赛场已暂停',
        icon: 'none',
        duration: 2000,
      });

      self.fetchRecords();
    }).catch(function() {
      // 离线回退：本地记录签退
      var app = getApp();
      app.globalData.offlineQueue.push({
        action: 'check_out',
        payload: {
          latitude: (self.data.location || {}).latitude,
          longitude: (self.data.location || {}).longitude,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });

      self.setData({
        status: 'unchecked',
        venueInfo: null,
        checkInTime: '',
        durationText: '',
      });

      wx.showToast({
        title: '网络异常，签退已本地缓存',
        icon: 'none',
      });
    }).finally(function() {
      self.setData({ actionLoading: false });
    });
  },

  // ==================== 计时器 ====================

  /**
   * 启动签到计时器（显示已签到时长）
   */
  startCheckInTimer() {
    this.stopCheckInTimer();

    var self = this;
    this._checkInTimer = setInterval(function() {
      if (self._destroyed) {
        self.stopCheckInTimer();
        return;
      }

      if (self.data.status !== 'checked' || !self.data.checkInTime) {
        return;
      }

      var startTime = new Date(self.data.checkInTime).getTime();
      var elapsed = Date.now() - startTime;
      var hours = Math.floor(elapsed / 3600000);
      var minutes = Math.floor((elapsed % 3600000) / 60000);

      self.setData({
        durationText: hours > 0
          ? hours + ' 小时 ' + minutes + ' 分钟'
          : minutes + ' 分钟',
      });
    }, 30000); // 每 30 秒更新一次即可
  },

  /**
   * 停止签到计时器
   */
  stopCheckInTimer() {
    if (this._checkInTimer) {
      clearInterval(this._checkInTimer);
      this._checkInTimer = null;
    }
  },

  // ==================== 记录 ====================

  /**
   * 拉取今日考勤记录
   */
  fetchRecords() {
    var self = this;
    var today = new Date().toISOString().split('T')[0];
    return get('/referees/attendance/records', { date: today }).then(function(res) {
      self.setData({ records: res.records || [] });
    }).catch(function() {
      // 静默处理，不覆盖已有数据
    });
  },

  // ==================== 格式化 ====================

  /**
   * 格式化坐标显示
   */
  formatCoord(coord) {
    return coord.toFixed(6);
  },

  /**
   * 格式化距离
   */
  formatDistance(meters) {
    if (meters >= 1000) {
      return (meters / 1000).toFixed(1) + 'km';
    }
    return meters + 'm';
  },

  // ==================== 下拉刷新 ====================

  onPullDownRefresh() {
    var self = this;
    Promise.all([
      self.acquireLocation().catch(function() {}),
      self.fetchRecords(),
    ]).then(function() { wx.stopPullDownRefresh(); });
  },
});
