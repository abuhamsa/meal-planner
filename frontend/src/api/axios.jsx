// api/axios.js
import axios from 'axios';

// Initialize without config (will be configured later)
const api = axios.create({
  withCredentials: true
});

// Export a function to configure the instance
export const configureApi = (config) => {
  api.defaults.baseURL = config.API_BASE_URL;
  
  // Add request interceptor
  api.interceptors.request.use(requestConfig => {
    const OIDC_STORAGE_KEY = `oidc.user:${config.OIDC_AUTHORITY}:${config.OIDC_CLIENT_ID}`;
    const oidcData = localStorage.getItem(OIDC_STORAGE_KEY);
    
    if (oidcData) {
      try {
        const { access_token } = JSON.parse(oidcData);
        requestConfig.headers.Authorization = `Bearer ${access_token}`;
      } catch (error) {
        console.error('Error parsing OIDC data:', error);
      }
    }
    return requestConfig;
  });
};

export default api;