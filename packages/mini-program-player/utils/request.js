// 玩家端 - API请求封装
const BASE_URL = 'http://175.24.200.63/api/v1';

var loadingCount = 0;

function hideLoadingSafe() {
  loadingCount--;
  if (loadingCount <= 0) {
    loadingCount = 0;
    wx.hideLoading({});
  }
}

function request(url, options) {
  const { method = 'GET', data, header = {}, showLoading = true } = options || {};

  if (showLoading) {
    loadingCount++;
    wx.showLoading({ title: '加载中...', mask: true });
  }

  return new Promise(function (resolve, reject) {
    const token = wx.getStorageSync('player_token');

    wx.request({
      url: BASE_URL + url,
      method: method,
      data: data,
      enableHttp2: true,
      header: Object.assign({
        'Content-Type': 'application/json'
      }, token ? { Authorization: 'Bearer ' + token } : {}, header),
      success(res) {
        if (showLoading) hideLoadingSafe();
        var body = res.data;
        if (res.statusCode === 200 && body && body.code === 0) {
          resolve(body.data);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('player_token');
          wx.removeStorageSync('player_user');
          wx.showToast({ title: '登录已过期，请重新进入', icon: 'none', duration: 2000 });
          reject({ code: 401, message: '登录已过期' });
        } else {
          var errMsg = (body && body.message) || '请求失败(' + res.statusCode + ')';
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(body || { code: res.statusCode, message: errMsg });
        }
      },
      fail(err) {
        if (showLoading) hideLoadingSafe();
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        reject(err);
      }
    });
  });
}

function get(url, params) {
  var fullUrl = url;
  if (params) {
    var parts = [];
    for (var k in params) {
      if (params[k] !== undefined && params[k] !== null) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
      }
    }
    if (parts.length > 0) fullUrl += '?' + parts.join('&');
  }
  return request(fullUrl, { method: 'GET', showLoading: true });
}

function post(url, data) {
  return request(url, { method: 'POST', data: data, showLoading: true });
}

function put(url, data) {
  return request(url, { method: 'PUT', data: data, showLoading: true });
}

function del(url) {
  return request(url, { method: 'DELETE', showLoading: true });
}

function silentGet(url, params) {
  var fullUrl = url;
  if (params) {
    var parts = [];
    for (var k in params) {
      if (params[k] !== undefined && params[k] !== null) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
      }
    }
    if (parts.length > 0) fullUrl += '?' + parts.join('&');
  }
  return request(fullUrl, { method: 'GET', showLoading: false });
}

function silentPost(url, data) {
  return request(url, { method: 'POST', data: data, showLoading: false });
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del,
  silentGet: silentGet,
  silentPost: silentPost
};
