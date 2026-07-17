// pages/login/login.js — 手动登录（手机号 + 微信 code → /auth/mp-login）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    phone: '',
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

  // 手机号输入
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

  // 登录
  onLogin: function () {
    var that = this;
    var phone = this.data.phone.trim();

    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    that.setData({ loading: true });

    // 第一步: wx.login 拿 code
    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          that.setData({ loading: false });
          wx.showToast({ title: '微信登录失败', icon: 'none' });
          return;
        }

        // 第二步: /auth/mp-login 用 code + 手机号登录
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

          // 判断是否新用户：没有昵称或没有头像 → 新用户
          var user = d.user || {};
          var isNewUser = !user.nickname || !user.avatar_url;

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
