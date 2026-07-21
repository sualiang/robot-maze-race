// API 请求封装

import axios from 'axios';

/** 运营商上下文（从后端 Redis/JWT 获取） */
export interface OperatorContext {
  operatorId: string;
  venueId: string | null;
  source: 'jwt' | 'redis';
}

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
      // 非登录页和裁判页才清除 token 并跳转
      const path = window.location.pathname;
      if (path.startsWith('/operator/login') || path.startsWith('/referee')) {
        // 裁判页面不自动跳转运营商登录
        return Promise.reject(error);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      window.location.href = '/operator/login';
    } else if (error.response?.status === 403) {
      const msg = error.response?.data?.message || '无权限操作';
      console.warn('[API] 403 禁止:', msg);
    }
    return Promise.reject(error);
  }
);

export default api;

/**
 * 获取当前玩家的运营商上下文
 * GET /api/v1/player/context/current
 * 后端从 Redis 或 JWT 中读取 operator_id
 */
export function getCurrentContext(): Promise<OperatorContext | null> {
  return api.get<any, OperatorContext | null>('/player/context/current').then((data) => {
    if (data && (data as any).operatorId) {
      return data;
    }
    return null;
  }).catch(() => null);
}
