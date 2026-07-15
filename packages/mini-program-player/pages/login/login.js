// pages/login/login.js — 微信登录（三步流程，WeUI 白底风格）
// 步骤: getPhoneNumber → wx.login → /auth/wx-login → /auth/decrypt-phone → /auth/me
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

  // ===== 保存登录态 =====
  _saveLogin: function (token, user) {
    storage.setSync(storage.STORAGE_KEYS.TOKEN, token);
    storage.setSync(storage.STORAGE_KEYS.USER, user || {});
    var app = getApp();
    app.globalData.token = token;
    app.globalData.userInfo = user || {};
    app.globalData.isLoggedIn = true;
  },

  // ===== 微信登录按钮（open-type="getPhoneNumber" 回调） =====
  onGetPhoneNumber: function (e) {
    var that = this;
    var detail = e.detail;

    // 用户拒绝授权
    if (detail.errMsg && detail.errMsg.indexOf(':ok') === -1) {
      return;
    }

    if (!detail.code) {
      wx.showToast({ title: '获取手机号失败', icon: 'none' });
      return;
    }

    that.setData({ loading: true });

    var phoneCode = detail.code;

    // 第一步: wx.login 拿 code
    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          that.setData({ loading: false });
          wx.showToast({ title: '微信登录失败', icon: 'none' });
          return;
        }

        // 第二步: /auth/wx-login 用微信 code 换 token
        request.post('/auth/wx-login', {
          code: loginRes.code
        }).then(function (d) {
          if (!d || !d.token) {
            that.setData({ loading: false });
            wx.showToast({ title: '登录失败', icon: 'none' });
            return;
          }

          // 保存 token
          that._saveLogin(d.token, d.user || {});

          // 第三步: /auth/decrypt-phone 解密手机号
          request.post('/auth/decrypt-phone', {
            code: phoneCode
          }).then(function (phoneRes) {
            var phone = (phoneRes && phoneRes.phone) || '';

            // 第四步: /auth/me 查用户完整信息
            request.silentGet('/auth/me').then(function (me) {
              that.setData({ loading: false });
              var user = me || {};

              // 判断新老用户：有昵称 且 有头像 → 老用户
              var isNewUser = !user.nickname || !user.avatar_url;

              if (phone) {
                user.phone = phone;
                storage.setSync(storage.STORAGE_KEYS.USER, user);
                getApp().globalData.userInfo = user;
              }

              if (isNewUser) {
                wx.redirectTo({ url: '/pages/edit-profile/edit-profile' });
              } else {
                wx.showToast({ title: '登录成功', icon: 'success', duration: 1000 });
                var dest = that._from === 'profile' ? '/pages/profile/profile' : '/pages/index/index';
                setTimeout(function () {
                  wx.switchTab({ url: dest });
                }, 1000);
              }
            }).catch(function () {
              that.setData({ loading: false });
              // /auth/me 失败，按新用户处理
              wx.redirectTo({ url: '/pages/edit-profile/edit-profile' });
            });
          }).catch(function (err) {
            that.setData({ loading: false });
            var msg = (err && err.message) || '获取手机号失败';
            wx.showToast({ title: msg, icon: 'none' });
          });
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
