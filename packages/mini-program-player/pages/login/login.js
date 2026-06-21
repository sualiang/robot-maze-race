// pages/login/login.js - 手机号+密码登录
// 深色主题，支持 QR 回跳（redirect 参数）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    phone: '',
    password: '',
    showPwd: false,
    loading: false,
    canSubmit: false,
    focusPhone: false,
    focusPwd: false,
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
      // 收集其他 options 作为跳转参数（排除 redirect 自身）
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

  // ===== 手机号输入 =====
  onPhoneInput: function (e) {
    var phone = e.detail.value;
    this.setData({ phone: phone });
    this.updateSubmitState();
  },

  onPhoneFocus: function () {
    this.setData({ focusPhone: true });
  },

  onPhoneBlur: function () {
    this.setData({ focusPhone: false });
  },

  clearPhone: function () {
    this.setData({ phone: '', canSubmit: false });
  },

  // ===== 密码输入 =====
  onPwdInput: function (e) {
    var pwd = e.detail.value;
    this.setData({ password: pwd });
    this.updateSubmitState();
  },

  onPwdFocus: function () {
    this.setData({ focusPwd: true });
  },

  onPwdBlur: function () {
    this.setData({ focusPwd: false });
  },

  togglePwd: function () {
    this.setData({ showPwd: !this.data.showPwd });
  },

  // ===== 更新登录按钮状态 =====
  updateSubmitState: function () {
    var phone = this.data.phone.trim();
    var password = this.data.password;
    // 手机号必须 11 位纯数字，密码至少 1 位
    this.setData({
      canSubmit: /^\d{11}$/.test(phone) && password.length > 0
    });
  },

  // ===== 执行登录 =====
  doLogin: function () {
    var that = this;
    var phone = that.data.phone.trim();
    var password = that.data.password;

    if (!/^\d{11}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' });
      return;
    }

    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    that.setData({ loading: true });

    // POST /api/v1/auth/wx-login 使用手机号+密码，模拟 code=phone_login
    request.post('/auth/wx-login', {
      phone: phone,
      password: password,
      code: 'dev-test-code'
    }).then(function (d) {
      that.setData({ loading: false });

      if (!d || !d.token) {
        wx.showToast({ title: '登录失败，请检查账号密码', icon: 'none' });
        return;
      }

      // 整理用户信息（含默认字段）
      var userData = Object.assign({}, d.user || {}, {
        gender: (d.user && d.user.gender) || '',
        phone: (d.user && d.user.phone) || ''
      });

      // 保存 token 和用户信息
      storage.setSync(storage.STORAGE_KEYS.TOKEN, d.token);
      storage.setSync(storage.STORAGE_KEYS.USER, userData);

      // 设置 globalData
      var app = getApp();
      app.globalData.token = d.token;
      app.globalData.userInfo = d.user || {};
      app.globalData.isLoggedIn = true;

      wx.showToast({ title: '登录成功', icon: 'success', duration: 1500 });

      // 判断是否已完善个人信息：有 nickname 表示已完善
      var hasProfile = d.user && d.user.nickname && d.user.nickname.trim() !== '';

      setTimeout(function () {
        if (!hasProfile) {
          // 新用户 → 跳编辑个人信息页
          wx.redirectTo({ url: '/pages/edit-profile/edit-profile' });
        } else {
          // 老用户 → 直接跳首页
          wx.switchTab({ url: '/pages/index/index' });
        }
      }, 1500);
    }).catch(function (err) {
      that.setData({ loading: false });
      var msg = (err && err.message) || '登录失败，请重试';
      wx.showToast({ title: msg, icon: 'none', duration: 2000 });
    });
  },

  // ===== 根据 redirect 参数跳转 =====
  handleRedirect: function () {
    var redirect = this.data.redirect;
    var params = this.data.redirectParams;

    if (redirect) {
      var url = '/pages/' + redirect + '/' + redirect;

      // 拼接 query 参数
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

  // ===== 注册（暂无注册页，提示引导） =====
  doRegister: function () {
    var that = this;
    var raw = that.data.phone;
    var phone = String(raw || '').replace(/\D/g, '');
    var phoneValid = phone && phone.length === 11;
    console.log('[注册] raw:', raw, 'strip:', phone, 'valid:', phoneValid);

    wx.showModal({
      title: '快速注册',
      content: phoneValid
        ? '将用手机号 ' + phone + ' 进行注册，密码默认 admin123，是否继续？'
        : '请输入11位手机号后点击注册',
      confirmText: phoneValid ? '立即注册' : '我知道了',
      confirmColor: '#e94560',
      success: function (res) {
        if (res.confirm && phoneValid) {
          that.doRegisterSubmit(phone);
        }
      }
    });
  },

  // ===== 执行注册请求 =====
  doRegisterSubmit: function (phone) {
    var that = this;
    that.setData({ loading: true });

    request.post('/auth/register', {
      phone: phone,
      password: 'admin123',
      nickname: '玩家_' + phone.slice(-4),
      code: 'phone_register'
    }).then(function (d) {
      that.setData({ loading: false });

      if (!d || !d.token) {
        wx.showToast({ title: '注册失败，请重试', icon: 'none' });
        return;
      }

      // 注册成功后自动登录
      storage.setSync(storage.STORAGE_KEYS.TOKEN, d.token);
      storage.setSync(storage.STORAGE_KEYS.USER, d.user || {});

      var app = getApp();
      app.globalData.token = d.token;
      app.globalData.userInfo = d.user || {};
      app.globalData.isLoggedIn = true;

      wx.showToast({ title: '注册成功', icon: 'success', duration: 1500 });

      setTimeout(function () {
        that.handleRedirect();
      }, 1500);
    }).catch(function (err) {
      that.setData({ loading: false });
      var msg = (err && err.message) || '注册失败';
      wx.showToast({ title: msg, icon: 'none', duration: 2000 });
    });
  }
});
