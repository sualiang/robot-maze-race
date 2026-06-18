// pages/login/login.js - 手机号登录（免密，开发阶段）
var request = require('../../utils/request');

Page({
  data: {
    phone: '',
    loading: false,
    canSubmit: false
  },

  onLoad: function () {
    var app = getApp();
    if (app.globalData.isLoggedIn) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onPhoneInput: function (e) {
    var phone = e.detail.value;
    this.setData({ phone: phone, canSubmit: phone.trim().length >= 11 });
  },

  doLogin: function () {
    var that = this;
    var phone = that.data.phone.trim();

    if (phone.length < 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    that.setData({ loading: true });

    request.post('/auth/login', { phone: phone, password: '***' }).then(function (d) {
      that.setData({ loading: false });
      if (!d || !d.token) {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        return;
      }
      wx.setStorageSync('player_token', d.token);
      wx.setStorageSync('player_user', d.user);
      var app = getApp();
      var userData = d.user || {};
      app.globalData.token = d.token;
      app.globalData.userInfo = userData;
      app.globalData.isLoggedIn = true;
      console.log('[登录] userInfo:', JSON.stringify(userData));

      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(function () {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1000);
    }).catch(function (err) {
      that.setData({ loading: false });
      var msg = (err && err.message) || '登录失败';
      wx.showToast({ title: msg, icon: 'none' });
    });
  },

  doRegister: function () {
    var that = this;
    var phone = that.data.phone.trim();

    if (phone.length < 11) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }

    that.setData({ loading: true });

    request.post('/auth/register', {
      phone: phone,
      password: 'admin123',
      nickname: '玩家_' + phone.slice(-4)
    }).then(function (d) {
      that.setData({ loading: false });
      if (!d || !d.token) {
        wx.showToast({ title: '注册失败', icon: 'none' });
        return;
      }
      wx.setStorageSync('player_token', d.token);
      wx.setStorageSync('player_user', d.user);
      var app = getApp();
      app.globalData.token = d.token;
      app.globalData.userInfo = d.user;
      app.globalData.isLoggedIn = true;

      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(function () {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1000);
    }).catch(function (err) {
      that.setData({ loading: false });
      var msg = (err && err.message) || '注册失败';
      wx.showToast({ title: msg, icon: 'none' });
    });
  }
});
