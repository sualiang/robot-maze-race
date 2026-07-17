// pages/login/login.js — 微信登录（手机号 + wx.login → /auth/mp-login）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    loading: false,
    phone: ''
  },

  onLoad: function (options) {
    var app = getApp();
    this._from = options.from || '';
    if (app.globalData.isLoggedIn) {
      var dest = this._from === 'profile' ? '/pages/profile/profile' : '/pages/index/index';
      wx.switchTab({ url: dest });
    }
  },

  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value });
  },

  // 保存登录态
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
    var phone = that.data.phone;

    // 校验手机号
    if (!phone || !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
      return;
    }

    that.setData({ loading: true });

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          that.setData({ loading: false });
          wx.showToast({ title: '微信登录失败', icon: 'none' });
          return;
        }

        // /auth/mp-login: code + phone
        request.post('/auth/mp-login', {
          code: loginRes.code,
          phone: phone
        }).then(function (d) {
          that.setData({ loading: false });

          if (!d || !d.token) {
            wx.showToast({ title: (d && d.message) || '登录失败', icon: 'none' });
            return;
          }

          that._saveLogin(d.token, d.user || {});

          // 新用户 → 跳转完善资料，老用户 → 进首页
          var isNewUser = d.is_new_user;

          if (isNewUser) {
            wx.redirectTo({ url: '/pages/edit-profile/edit-profile' });
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
