// 玩家端 - API请求封装
// 对齐 @robot-race/shared/dist/types/enums 中的 ApiResponse<T> 规范

const BASE_URL = 'https://api.example.com/api/v1';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  header?: Record<string, string>;
  showLoading?: boolean;
}

interface ApiResponseBody<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/**
 * 基础请求方法
 * 返回 data 字段，自动处理 code !== 0 的情况
 */
export function request<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', data, header = {}, showLoading = true } = options;

  if (showLoading) {
    wx.showLoading({ title: '加载中...', mask: true });
  }

  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('player_token');

    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...header,
      },
      success(res) {
        wx.hideLoading();
        const { statusCode } = res;
        const body = res.data as ApiResponseBody<T>;

        if (statusCode === 200 && body?.code === 0) {
          resolve(body.data);
        } else if (statusCode === 401) {
          // token 过期，清除并提示重新登录
          wx.removeStorageSync('player_token');
          wx.removeStorageSync('player_user');
          wx.showToast({ title: '登录已过期，请重新进入', icon: 'none', duration: 2000 });
          reject({ code: 401, message: '登录已过期' });
        } else {
          // 业务错误
          const errMsg = body?.message || `请求失败(${statusCode})`;
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(body || { code: statusCode, message: errMsg });
        }
      },
      fail(err) {
        wx.hideLoading();
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        reject(err);
      },
    });
  });
}

/**
 * GET 请求
 */
export function get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
  // 将 params 拼接到 url
  let fullUrl = url;
  if (params) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (query) {
      fullUrl += `?${query}`;
    }
  }
  return request<T>(fullUrl, { method: 'GET', showLoading: true });
}

/**
 * POST 请求
 */
export function post<T = unknown>(url: string, data?: Record<string, unknown>): Promise<T> {
  return request<T>(url, { method: 'POST', data, showLoading: true });
}

/**
 * PUT 请求
 */
export function put<T = unknown>(url: string, data?: Record<string, unknown>): Promise<T> {
  return request<T>(url, { method: 'PUT', data, showLoading: true });
}

/**
 * DELETE 请求
 */
export function del<T = unknown>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE', showLoading: true });
}

/**
 * 静默请求（不显示 loading）
 */
export function silentGet<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
  let fullUrl = url;
  if (params) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (query) {
      fullUrl += `?${query}`;
    }
  }
  return request<T>(fullUrl, { method: 'GET', showLoading: false });
}

export function silentPost<T = unknown>(url: string, data?: Record<string, unknown>): Promise<T> {
  return request<T>(url, { method: 'POST', data, showLoading: false });
}
