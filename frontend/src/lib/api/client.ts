import { ApiError, type ApiErrorPayload } from './errors';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// In-memory token storage (Option A - safest against XSS)
let accessToken: string | null = null;
// Also in-memory, same rationale as accessToken above -- a page reload
// still requires re-login either way (nothing survives a reload today),
// so keeping the refresh token in memory alongside the access token
// doesn't change that tradeoff, it just lets a *silent* refresh work
// within a session instead of forcing a hard logout on every access
// token expiry (15 minutes, config.settings.base.SIMPLE_JWT).
let refreshTokenValue: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

export function setRefreshToken(token: string | null) {
  refreshTokenValue = token;
}

export function getRefreshToken() {
  return refreshTokenValue;
}

export function clearAuthTokens() {
  accessToken = null;
  refreshTokenValue = null;
}

// SIMPLE_JWT has ROTATE_REFRESH_TOKENS=True and
// BLACKLIST_AFTER_ROTATION=True -- every call to POST /auth/refresh/
// both consumes the refresh token it was given (blacklisting it) AND
// returns a brand-new one that must be saved for next time. If two
// requests 401 around the same moment, both must not call this
// independently -- the first call already blacklists the refresh token
// out from under the second. `inFlightRefresh` collapses concurrent
// callers onto a single request/promise instead.
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  const currentRefreshToken = refreshTokenValue;
  if (!currentRefreshToken) return null;

  inFlightRefresh = (async () => {
    try {
      // Note: response field names here are `access`/`refresh`
      // (simplejwt's stock TokenRefreshSerializer,
      // contracts/openapi.yaml's TokenRefresh schema) -- NOT
      // access_token/refresh_token like AuthResponse from /auth/login/
      // and /auth/verify/. Easy to get wrong since every other
      // token-bearing response in this API uses the longer names.
      const response = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: currentRefreshToken }),
      });
      if (!response.ok) {
        clearAuthTokens();
        return null;
      }
      const data: { access: string; refresh: string } = await response.json();
      accessToken = data.access;
      refreshTokenValue = data.refresh;
      return data.access;
    } catch {
      clearAuthTokens();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

// Django's CommonMiddleware has APPEND_SLASH=True (the default), and
// every path in contracts/openapi.yaml ends in a trailing slash. A
// slash-less POST/PUT/PATCH/DELETE gets a 301 redirect back, which fetch
// (like a browser) follows as a bodyless GET -- silently turning e.g. a
// login or booking-create into a no-op. Normalizing here means call
// sites can't get this wrong, instead of relying on every feature file
// remembering the trailing slash by hand.
function normalizePath(path: string): string {
  const [pathname, search] = path.split('?');
  const normalizedPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return search ? `${normalizedPathname}?${search}` : normalizedPathname;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false
): Promise<T> {
  const normalizedPath = normalizePath(path);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Get locale from URL path
  let locale = 'en';
  if (typeof window !== 'undefined') {
    const match = window.location.pathname.match(/^\/(en|am)/);
    if (match) {
      locale = match[1];
    }
  }
  headers['Accept-Language'] = locale;

  const response = await fetch(`${API_BASE}${normalizedPath}`, {
    ...options,
    headers,
  });

  // A 401 on an authenticated request means the 15-minute access token
  // has expired (or was never valid) -- try exactly one silent refresh
  // and retry the original request once. `_isRetry` stops this from
  // looping if the refreshed token is *also* rejected, and normalizePath
  // ending in "/auth/refresh/" itself is skipped to avoid refreshing
  // recursively off of the refresh call's own 401.
  if (
    response.status === 401 &&
    !_isRetry &&
    token &&
    !normalizedPath.startsWith('/auth/refresh')
  ) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, options, true);
    }
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid response from server');
  }

  if (!response.ok) {
    throw new ApiError(data as ApiErrorPayload);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
