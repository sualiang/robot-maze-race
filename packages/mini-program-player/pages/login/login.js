// pages/login/login.js - 微信一键登录
// 深色主题，支持 QR 回跳（redirect 参数）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    loading: false,
    redirect: null,
    redirectParams: null
  },

  onLoad: function (options) {
    var app = getApp();

    // 如果已登录则直接跳转
    if (app.globalData.isLoggedIn) {
      this.handleRedirect();
      return;
    }

    // 解析 redirect 参数
    var redirect = options.redirect || '';
    var params = {};
    if (redirect) {
      for (var key in options) {
        if (key !== 'redirect' && options.hasOwnProperty(key)) {
          params[key] = options[key];
        }
      }
    }

    this.setData({
      redirect: redirect || null,
      redirectParams: params
    });
  },

  // ===== 保存登录态 =====
  _saveLogin: function (token, user) {
    var userData = Object.assign({}, user || {}, {
      gender: (user && user.gender) || '',
      phone: (user && user.phone) || ''
    });

    storage.setSync(storage.STORAGE_KEYS.TOKEN, token);
    storage.setSync(storage.STORAGE_KEYS.USER, userData);

    var app = getApp();
    app.globalData.token = token;
    app.globalData.userInfo = user || {};
    app.globalData.isLoggedIn = true;
  },

  // ===== 微信一键登录 =====
  doWxLogin: function () {
    var that = this;
    if (that.data.loading) return;

    that.setData({ loading: true });

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          that.setData({ loading: false });
          wx.showToast({ title: '获取微信授权失败', icon: 'none' });
          return;
        }

        // POST /auth/wx-login 用 code 换取 token
        request.post('/auth/wx-login', {
          code: loginRes.code
        }).then(function (d) {
          that.setData({ loading: false });

          if (!d || !d.token) {
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
            return;
          }

          // 保存登录态
          that._saveLogin(d.token, d.user);

          wx.showToast({ title: '登录成功', icon: 'success', duration: 1500 });

          // 判断是否已完善个人信息：有 nickname 表示已完善
          var hasProfile = d.user && d.user.nickname && d.user.nickname.trim() !== '';

          setTimeout(function () {
            if (!hasProfile) {
              // 新用户 → 跳编辑个人信息页
              wx.redirectTo({ url: '/pages/edit-profile/edit-profile' });
            } else {
              // 老用户 → 直接跳首页
              that.handleRedirect();
            }
          }, 1500);
        }).catch(function (err) {
          that.setData({ loading: false });
          var msg = (err && err.message) || '登录失败，请重试';
          wx.showToast({ title: msg, icon: 'none', duration: 2000 });
        });
      },
      fail: function () {
        that.setData({ loading: false });
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
      }
    });
  },

  // ===== 根据 redirect 参数跳转 =====
  handleRedirect: function () {
    var redirect = this.data.redirect;
    var params = this.data.redirectParams;

    if (redirect) {
      var url = '/pages/' + redirect + '/' + redirect;

      var queryParts = [];
      for (var key in params) {
        if (params.hasOwnProperty(key)) {
          queryParts.push(key + '=' + encodeURIComponent(String(params[key])));
        }
      }
      if (queryParts.length > 0) {
        url += '?' + queryParts.join('&');
      }

      wx.redirectTo({
        url: url,
        fail: function () {
          // 如果 redirect 页面不存在，降级到首页
          wx.switchTab({ url: '/pages/index/index' });
        }
      });
    } else {
      // 无 redirect 参数，跳首页（Tab 页）
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  // ===== 注册入口 → 微信登录后跳编辑资料页 =====
  doRegister: function () {
    var that = this;
    if (that.data.loading) return;

    that.setData({ loading: true });

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          that.setData({ loading: false });
          wx.showToast({ title: '获取微信授权失败', icon: 'none' });
          return;
        }

        request.post('/auth/wx-login', {
          code: loginRes.code
        }).then(function (d) {
          that.setData({ loading: false });

          if (!d || !d.token) {
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
            return;
          }

          that._saveLogin(d.token, d.user);

          // 注册模式：始终跳编辑资料页
          wx.redirectTo({ url: '/pages/edit-profile/edit-profile' });
        }).catch(function (err) {
          that.setData({ loading: false });
          var msg = (err && err.message) || '登录失败，请重试';
          wx.showToast({ title: msg, icon: 'none', duration: 2000 });
        });
      },
      fail: function () {
        that.setData({ loading: false });
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
      }
    });
  }
});
