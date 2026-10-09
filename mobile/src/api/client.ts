import axios, { AxiosError, AxiosInstance } from 'axios';
import { API_BASE_URL } from '@/constants/config';

/**
 * Base axios instance. Phase 2 adds auth interceptors (Bearer token,
 * refresh-on-401). Phase 1 has no tokens yet.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'expo',
  },
});

export interface ApiErrorPayload {
  errors?: Record<string, string[]>;
  message?: string;
}

export class ApiError extends Error {
  code: string;
  fieldErrors: Record<string, string[]>;

  constructor(payload: ApiErrorPayload, fallback = 'Request failed') {
    super(payload.message ?? fallback);
    this.code = 'API_ERROR';
    this.fieldErrors = payload.errors ?? {};
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AxiosError) {
    return new ApiError(error.response?.data ?? {}, error.message);
  }
  if (error instanceof Error) {
    return new ApiError({ message: error.message });
  }
  return new ApiError({});
}
