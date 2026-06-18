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
    scanData: null  // 存储扫码结果，用于跨页面传递
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
      if (user) that.globalData.userInfo = user;
    }
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
