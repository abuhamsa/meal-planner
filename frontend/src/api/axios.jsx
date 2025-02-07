import axios from 'axios';

const OIDC_STORAGE_KEY = `oidc.user:${import.meta.env.VITE_OIDC_AUTHORITY}:${import.meta.env.VITE_OIDC_CLIENT_ID}`;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true // For potential future cookie integration
});

api.interceptors.request.use(config => {
  const oidcData = localStorage.getItem(OIDC_STORAGE_KEY);
  
  if (oidcData) {
    try {
      const { access_token } = JSON.parse(oidcData);
      config.headers.Authorization = `Bearer ${access_token}`;
    } catch (error) {
      console.error('Error parsing OIDC data:', error);
    }
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem(OIDC_STORAGE_KEY);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;