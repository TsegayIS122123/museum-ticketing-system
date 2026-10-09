import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL } from '@/constants/config';
import { ApiError, normalizeError } from './errors';
import { getAccessToken, refreshAccessToken } from '@/auth/session';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'expo',
  },
});

// Attach the access token to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, try a single silent refresh, retry the original request once
let inFlightRefresh: Promise<string | null> | null = null;
apiClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retried &&
      !original.url?.includes('/auth/refresh/')
    ) {
      original._retried = true;
      inFlightRefresh = inFlightRefresh ?? refreshAccessToken();
      const newToken = await inFlightRefresh;
      inFlightRefresh = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
    }
    return Promise.reject(normalizeError(error));
  }
);

export { ApiError, isApiError } from './errors';
