// 玩家端 - 登录逻辑（Mock模式，跳过微信登录）
var request = require('./request');

// Mock用户列表（开发调试用）
var MOCK_USERS = [
  { phone: '13800138000', name: '测试玩家A', avatar: '' },
  { phone: '13900139000', name: '测试玩家B', avatar: '' },
  { phone: '13700137000', name: '测试玩家C', avatar: '' },
];

function wxLogin() {
  // 开发环境：直接走手机号 Mock 登录，跳过 wx.login
  return new Promise(function (resolve, reject) {
    // 尝试 wx.login（生产环境用），失败直接降级
    tryWxLogin(resolve, reject);
  });
}

function tryWxLogin(resolve, reject) {
  if (typeof wx.getStorageSync !== 'function') {
    showPhoneLogin(resolve, reject);
    return;
  }
  wx.login({
    success: function (res) {
      if (res.code) {
        request.post('/auth/wx-login', { code: res.code }).then(function (d) {
          saveUser(d);
          resolve(d);
        }).catch(function (err) {
          console.warn('[Auth] wx-login 失败，降级到Mock登录:', err);
          showPhoneLogin(resolve, reject);
        });
      } else {
        showPhoneLogin(resolve, reject);
      }
    },
    fail: function (err) {
      console.warn('[Auth] wx.login 失败，降级到Mock登录:', err);
      showPhoneLogin(resolve, reject);
    }
  });
}

function showPhoneLogin(resolve, reject) {
  wx.showModal({
    title: '登录',
    content: '请输入手机号登录（开发模式）',
    editable: true,
    placeholderText: '输入手机号，如13800138000',
    success: function (res) {
      if (res.confirm && res.content) {
        var phone = res.content.trim();
        // 用手机号调用Mock登录API
        request.post('/auth/login', { phone: phone, password: '***' }).then(function (d) {
          saveUser(d);
          resolve(d);
        }).catch(function (err) {
          wx.showToast({ title: '登录失败', icon: 'none' });
          reject(err);
        });
      } else {
        // 用户取消
        reject({ errMsg: 'user cancel' });
      }
    }
  });
}

function saveUser(d) {
  wx.setStorageSync('player_token', d.token);
  wx.setStorageSync('player_user', d.user);
  var app = getApp();
  app.globalData.token = d.token;
  app.globalData.userInfo = d.user;
  app.globalData.isLoggedIn = true;
}

function checkLogin() {
  var token = wx.getStorageSync('player_token');
  return !!token;
}

function logout() {
  wx.removeStorageSync('player_token');
  wx.removeStorageSync('player_user');
  var app = getApp();
  app.globalData.token = null;
  app.globalData.userInfo = null;
  app.globalData.isLoggedIn = false;
}

module.exports = {
  wxLogin: wxLogin,
  checkLogin: checkLogin,
  logout: logout
};

function checkLogin() {
  var token = wx.getStorageSync('player_token');
  return !!token;
}

function logout() {
  wx.removeStorageSync('player_token');
  wx.removeStorageSync('player_user');
  var app = getApp();
  app.globalData.token = null;
  app.globalData.userInfo = null;
  app.globalData.isLoggedIn = false;
}

module.exports = {
  wxLogin: wxLogin,
  checkLogin: checkLogin,
  logout: logout
};
