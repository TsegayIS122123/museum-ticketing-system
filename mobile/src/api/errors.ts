import { AxiosError } from 'axios';

export interface ApiErrorPayload {
  errors?: Record<string, string[]>;
  message?: string;
}

export class ApiError extends Error {
  code: string;
  /** HTTP status when the failure came from a response; `null` for a
   *  transport-level failure (offline, timeout, DNS). Needed wherever a
   *  caller has to tell "this will never succeed, stop retrying" (404/409)
   *  apart from "try again later" (no status / 5xx) -- the offline check-in
   *  queue is the first such caller, see
   *  `api/queries/offline-sync.ts`. */
  status: number | null;
  fieldErrors: Record<string, string[]>;

  constructor(
    payload: ApiErrorPayload,
    fallback = 'Request failed',
    status: number | null = null
  ) {
    super(payload.message ?? fallback);
    this.name = 'ApiError';
    this.code = 'API_ERROR';
    this.status = status;
    this.fieldErrors = payload.errors ?? {};
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AxiosError) {
    return new ApiError(
      error.response?.data ?? {},
      error.message,
      error.response?.status ?? null
    );
  }
  if (error instanceof Error) {
    return new ApiError({ message: error.message });
  }
  return new ApiError({});
}
