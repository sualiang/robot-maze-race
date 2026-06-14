// app.js - 运营商端小程序入口
var storage = require('./utils/storage');

App({
  globalData: {
    userInfo: null,
    token: null,
    venueId: null,
    venueName: '',
    isLoggedIn: false,
    systemInfo: null
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
      var vid = storage.getSync(storage.STORAGE_KEYS.VENUE_ID);
      if (vid) that.globalData.venueId = vid;
      var vname = storage.getSync(storage.STORAGE_KEYS.VENUE_NAME);
      if (vname) that.globalData.venueName = vname;
    }
  },

  setVenue: function (venueId, venueName) {
    this.globalData.venueId = venueId;
    this.globalData.venueName = venueName;
    storage.setSync(storage.STORAGE_KEYS.VENUE_ID, venueId);
    storage.setSync(storage.STORAGE_KEYS.VENUE_NAME, venueName);
  },

  login: function (phone, password) {
    var that = this;
    var request = require('./utils/request');
    return request.post('/operator/login', {
      phone: phone,
      password: password
    }).then(function (data) {
      that.globalData.token = data.token;
      that.globalData.userInfo = data.user;
      that.globalData.isLoggedIn = true;
      storage.setSync(storage.STORAGE_KEYS.TOKEN, data.token);
      storage.setSync(storage.STORAGE_KEYS.USER, data.user);
      if (data.user.venueId) {
        that.setVenue(data.user.venueId, data.user.venueName || '');
      }
      return data;
    });
  },

  logout: function () {
    this.globalData.token = null;
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    this.globalData.venueId = null;
    this.globalData.venueName = '';
    storage.removeSync(storage.STORAGE_KEYS.TOKEN);
    storage.removeSync(storage.STORAGE_KEYS.USER);
    storage.removeSync(storage.STORAGE_KEYS.VENUE_ID);
    storage.removeSync(storage.STORAGE_KEYS.VENUE_NAME);
  }
});
