import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthCheck = err.config?.url?.includes('/auth/me');
    const isAlreadyOnLogin = window.location.pathname === '/login';
    if (err.response?.status === 401 && !isAuthCheck && !isAlreadyOnLogin) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
