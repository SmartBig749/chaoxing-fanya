import axios from 'axios';
import { redactAxiosError } from '../lib/redact';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 打印前脱敏，避免把密码 / Token / Key 留在控制台
    console.error('API Error:', redactAxiosError(error));
    return Promise.reject(error);
  }
);

export default api;
