// 运营商端 - API请求封装
var BASE_URL = 'http://127.0.0.1:3000/api/v1';

function request(url, options) {
  var method = (options && options.method) || 'GET';
  var data = options && options.data;
  var header = (options && options.header) || {};
  var showLoading = true;
  if (options && options.showLoading !== undefined) {
    showLoading = options.showLoading;
  }

  if (showLoading) {
    wx.showLoading({ title: '加载中...', mask: true });
  }

  return new Promise(function (resolve, reject) {
    var token = wx.getStorageSync('operator_token');

    var headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    for (var k in header) {
      if (header.hasOwnProperty(k)) {
        headers[k] = header[k];
      }
    }

    wx.request({
      url: BASE_URL + url,
      method: method,
      data: data,
      header: headers,
      success: function (res) {
        wx.hideLoading();
        var body = res.data;
        if (res.statusCode === 200 && body && body.code === 0) {
          resolve(body.data);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('operator_token');
          wx.removeStorageSync('operator_user');
          wx.removeStorageSync('operator_venue_id');
          wx.removeStorageSync('operator_venue_name');
          wx.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2000 });
          reject({ code: 401, message: '登录已过期' });
        } else {
          var errMsg = (body && body.message) || ('请求失败(' + res.statusCode + ')');
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(body || { code: res.statusCode, message: errMsg });
        }
      },
      fail: function (err) {
        wx.hideLoading();
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
