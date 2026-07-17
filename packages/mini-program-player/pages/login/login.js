// pages/login/login.js — 微信登录（wx.login → /auth/mp-login）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    loading: false
  },

  onLoad: function (options) {
    var app = getApp();
    this._from = options.from || '';
    if (app.globalData.isLoggedIn) {
      var dest = this._from === 'profile' ? '/pages/profile/profile' : '/pages/index/index';
      wx.switchTab({ url: dest });
    }
  },

  _saveLogin: function (token, user) {
    storage.setSync(storage.STORAGE_KEYS.TOKEN, token);
    storage.setSync(storage.STORAGE_KEYS.USER, user || {});
    var app = getApp();
    app.globalData.token = token;
    app.globalData.userInfo = user || {};
    app.globalData.isLoggedIn = true;
  },

  // 微信登录
  onLogin: function () {
    var that = this;
    that.setData({ loading: true });

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          that.setData({ loading: false });
          wx.showToast({ title: '微信登录失败', icon: 'none' });
          return;
        }

        // /auth/mp-login: 只传 code
        request.post('/auth/mp-login', {
          code: loginRes.code
        }).then(function (d) {
          that.setData({ loading: false });

          if (!d || !d.token) {
            wx.showToast({ title: (d && d.message) || '登录失败', icon: 'none' });
            return;
          }

          that._saveLogin(d.token, d.user || {});

          // 同步运营商上下文（从编译模式/扫码获取的 operator_id/venue_id）
          getApp()._syncOperatorContext();

          // 新用户（无 nickname） → 注册页，老用户 → 进首页
          if (d.is_new_user || !d.user || !d.user.nickname) {
            wx.redirectTo({ url: '/pages/register/register' });
          } else {
            wx.showToast({ title: '登录成功', icon: 'success', duration: 1000 });
            var dest = that._from === 'profile' ? '/pages/profile/profile' : '/pages/index/index';
            setTimeout(function () {
              wx.switchTab({ url: dest });
            }, 1000);
          }
        }).catch(function (err) {
          that.setData({ loading: false });
          var msg = (err && err.message) || '登录失败';
          wx.showToast({ title: msg, icon: 'none' });
        });
      },
      fail: function () {
        that.setData({ loading: false });
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      }
    });
  }
});
