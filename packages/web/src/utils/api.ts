// API 请求封装

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const { data } = response;
    if (data.code !== 0) {
      return Promise.reject(data);
    }
    return data.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[API] 401 未授权');
      // 非登录页才清除 token 并跳转
      if (!window.location.pathname.startsWith('/operator/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        window.location.href = '/operator/login';
      }
    } else if (error.response?.status === 403) {
      const msg = error.response?.data?.message || '无权限操作';
      console.warn('[API] 403 禁止:', msg);
    }
    return Promise.reject(error);
  }
);

export default api;
