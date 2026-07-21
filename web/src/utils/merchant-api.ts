// 商家端 API 封装 — 使用独立的 merchant_token

import axios from 'axios';

const merchantApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
});

merchantApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('merchant_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

merchantApi.interceptors.response.use(
  (response) => {
    const { data } = response;
    if (data.code !== 0) {
      return Promise.reject(data);
    }
    return data.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('merchant_token');
      localStorage.removeItem('merchant_user');
      window.location.href = '/merchant/login';
    }
    return Promise.reject(error);
  }
);

export default merchantApi;
