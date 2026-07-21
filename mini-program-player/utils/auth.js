// 玩家端 - 登录逻辑
var request = require('./request');

function wxLogin() {
  return new Promise(function (resolve, reject) {
    // 开发阶段：跳转到手机号+密码登录页
    var app = getApp();
    var pages = getCurrentPages();
    var currentPage = pages[pages.length - 1];

    if (currentPage && currentPage.route === 'pages/login/login') {
      // 已经在登录页，不重复跳转
      reject({ errMsg: 'already on login page' });
      return;
    }

    wx.navigateTo({
      url: '/pages/login/login',
      success: function () {
        // 等待登录页完成登录后 resolve
        // 登录页会设置 globalData.isLoggedIn = true
        var checkTimer = setInterval(function () {
          if (app.globalData.isLoggedIn) {
            clearInterval(checkTimer);
            resolve();
          }
        }, 500);
        // 5分钟超时
        setTimeout(function () {
          clearInterval(checkTimer);
          reject({ errMsg: 'login timeout' });
        }, 300000);
      },
      fail: function () {
        reject({ errMsg: 'navigate fail' });
      }
    });
  });
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
