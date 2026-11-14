import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000, // 30 seconds timeout
});

/** Attach JWT from localStorage on every request */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sims_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** On 401 (for authenticated requests, NOT the login endpoint itself), clear token and redirect */
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginEndpoint = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem('sims_token');
      localStorage.removeItem('sims_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error as Error);
  },
);
