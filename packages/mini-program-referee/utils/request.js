// 裁判端 - API 请求封装
var BASE_URL = 'http://127.0.0.1:3000/api/v1';

function request(url, options) {
  var opts = options || {};
  var method = opts.method || 'GET';
  var data = opts.data;
  var header = opts.header || {};
  var skipAuth = opts.skipAuth;

  return new Promise(function(resolve, reject) {
    var token = skipAuth ? null : wx.getStorageSync('referee_token');

    wx.request({
      url: url.indexOf('http') === 0 ? url : BASE_URL + url,
      method: method,
      data: data,
      header: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        header
      ),
      success: function(res) {
        var statusCode = res.statusCode;
        var body = res.data;

        if (statusCode === 200 && body && body.code === 0) {
          resolve(body.data);
        } else if (statusCode === 401) {
          wx.removeStorageSync('referee_token');
          wx.removeStorageSync('referee_user_info');

          var app = getApp();
          app.globalData.isRefereeCertified = false;
          app.globalData.userInfo = null;

          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('登录已过期，请重新登录'));
        } else {
          var errMsg = (body && body.message) || '请求失败(' + statusCode + ')';
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(body || new Error(errMsg));
        }
      },
      fail: function(err) {
        console.error('[Request] 网络请求失败:', url, err);

        if (opts.offlineFallback && opts.offlineAction) {
          var app = getApp();
          app.globalData.offlineQueue.push({
            action: opts.offlineAction,
            payload: data || {},
            timestamp: Date.now()
          });
          wx.showToast({ title: '网络异常，操作已本地缓存', icon: 'none' });
          resolve({});
          return;
        }

        wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
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
  return request(fullUrl, { method: 'GET', data: params });
}

function post(url, data) {
  return request(url, { method: 'POST', data: data });
}

function put(url, data) {
  return request(url, { method: 'PUT', data: data });
}

function del(url, data) {
  return request(url, { method: 'DELETE', data: data });
}

function getPaginated(url, page, pageSize) {
  pageSize = pageSize || 20;
  return request(url, {
    method: 'GET',
    data: { page: page, pageSize: pageSize }
  });
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del,
  getPaginated: getPaginated
};
