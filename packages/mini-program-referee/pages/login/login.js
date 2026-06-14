// 裁判端小程序 - 登录页

// ==================== 内联 Storage 逻辑（绕过 require 不稳定） ====================

var STORAGE_KEYS = {
  TOKEN: 'referee_token',
  USER_INFO: 'referee_user_info'
};

function saveLogin(token, userInfo) {
  try { wx.setStorageSync(STORAGE_KEYS.TOKEN, token); } catch (e) {}
  try { wx.setStorageSync(STORAGE_KEYS.USER_INFO, userInfo); } catch (e) {}
}

function isLoggedIn() {
  try {
    return !!wx.getStorageSync(STORAGE_KEYS.TOKEN) && !!wx.getStorageSync(STORAGE_KEYS.USER_INFO);
  } catch (e) {
    return false;
  }
}

// ==================== 内联请求方法（避免模块导入兼容性问题） ====================

var BASE_URL = 'http://192.168.110.136:3000/api/v1';

function post(url, data) {
  return new Promise(function(resolve, reject) {
    wx.request({
      url: url.indexOf('http') === 0 ? url : BASE_URL + url,
      method: 'POST',
      data: data,
      header: { 'Content-Type': 'application/json' },
      success: function(res) {
        var statusCode = res.statusCode;
        var body = res.data;
        if (statusCode === 200 && body && body.code === 0) {
          resolve(body.data);
        } else {
          var errMsg = (body && body.message) || '请求失败(' + statusCode + ')';
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(body || new Error(errMsg));
        }
      },
      fail: function(err) {
        console.error('[Request] 网络请求失败:', url, err);
        wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
        reject(err);
      }
    });
  });
}

// ==================== 页面定义 ====================

Page({
  data: {
    phone: '',
    password: '',
    loading: false
  },

  onLoad: function() {
    // 检查是否已登录
    if (isLoggedIn()) {
      wx.switchTab({ url: '/pages/match/match' });
    }
  },

  onPhoneInput: function(e) {
    this.setData({ phone: e.detail.value });
  },

  onPasswordInput: function(e) {
    this.setData({ password: e.detail.value });
  },

  handleLogin: function() {
    var that = this;
    var phone = that.data.phone;
    var password = that.data.password;

    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    that.setData({ loading: true });

    post('/auth/login', {
      phone: phone,
      password: password
    }).then(function(res) {
      saveLogin(res.token, res.user);
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(function() {
        wx.switchTab({ url: '/pages/match/match' });
      }, 500);
    }).catch(function(err) {
      wx.showToast({ title: '登录失败，请检查账号密码', icon: 'none' });
    }).then(function() {
      that.setData({ loading: false });
    });
  }
});
