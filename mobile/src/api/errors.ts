import { AxiosError } from 'axios';

export interface ApiErrorPayload {
  errors?: Record<string, string[]>;
  message?: string;
}

export class ApiError extends Error {
  code: string;
  fieldErrors: Record<string, string[]>;

  constructor(payload: ApiErrorPayload, fallback = 'Request failed') {
    super(payload.message ?? fallback);
    this.name = 'ApiError';
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
