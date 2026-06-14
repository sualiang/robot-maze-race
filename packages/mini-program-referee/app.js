// app.js - 裁判端小程序入口
var storage = require('./utils/storage');
var request = require('./utils/request');

App({
  globalData: {
    refereeInfo: null,
    token: null,
    isLoggedIn: false,
    systemInfo: null,
    currentMatchId: null,
    currentAttendanceId: null
  },

  onLaunch: function () {
    var that = this;
    try {
      var info = wx.getSystemInfoSync();
      that.globalData.systemInfo = info;
    } catch (e) {}

    var token = storage.getSync(storage.STORAGE_KEYS.TOKEN);
    if (token) {
      that.globalData.token = token;
      that.globalData.isLoggedIn = true;
      var user = storage.getSync(storage.STORAGE_KEYS.USER);
      if (user) that.globalData.refereeInfo = user;
    }
  },

  // 手机号+密码登录
  login: function (phone, password) {
    return request.post('/auth/referee-login', {
      phone: phone,
      password: password
    });
  },

  checkLogin: function () {
    var token = storage.getSync(storage.STORAGE_KEYS.TOKEN);
    return !!token;
  },

  logout: function () {
    storage.removeSync(storage.STORAGE_KEYS.TOKEN);
    storage.removeSync(storage.STORAGE_KEYS.USER);
    this.globalData.token = null;
    this.globalData.refereeInfo = null;
    this.globalData.isLoggedIn = false;
  }
});
