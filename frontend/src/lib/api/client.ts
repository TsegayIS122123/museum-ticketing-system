import { ApiError, type ApiErrorPayload } from './errors';

const API_BASE = (
  typeof window === 'undefined'
    ? process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
  ).replace(/\/+$/, '');

// In-memory token storage (Option A - safest against XSS). Only the
// access token lives here now -- it's short-lived (15 minutes,
// config.settings.base.SIMPLE_JWT) and is what actually authorizes API
// calls, so it's the one worth keeping out of anything an XSS payload
// could read.
//
// The refresh token is NOT stored here (or anywhere in JS) at all -- the
// backend sets it as an httpOnly cookie instead (apps.accounts.cookies),
// scoped to /api/v1/auth/, and every fetch below sends credentials:
// 'include' so the browser attaches it automatically. That's what makes
// a silent refresh possible even after a full page navigation away from
// the app and back -- e.g. Chapa's hosted checkout (return_url) -- which
// wipes plain in-memory state like this module's own `accessToken`.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

export function clearAuthTokens() {
  accessToken = null;
}

// Multiple 401s around the same moment shouldn't each fire their own
// refresh call -- `inFlightRefresh` collapses concurrent callers onto a
// single request/promise instead.
let inFlightRefresh: Promise<string | null> | null = null;

// Attempts a silent refresh using the httpOnly refresh-token cookie.
// Exported so AuthProvider (lib/auth/auth-context.tsx) can call this on
// mount -- that's the only way a returning visitor (fresh page load,
// nothing left in memory) gets `isAuthenticated` back without a full
// re-login.
export async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      // No body -- the refresh token travels as the httpOnly cookie, not
      // as a request field. Response shape is `{ access }` only
      // (contracts/openapi.yaml's TokenRefreshResponse); the rotated
      // refresh token comes back as a Set-Cookie the browser stores on
      // its own, never in this JSON.
      const response = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        clearAuthTokens();
        return null;
      }
      const data: { access: string } = await response.json();
      accessToken = data.access;
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

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${normalizedPath}`, {
      ...options,
      headers,
      // Needed so the browser sends the httpOnly refresh-token cookie on
      // /auth/refresh/ (and /auth/logout/) -- harmless elsewhere since the
      // cookie is path-scoped to /api/v1/auth/ (apps.accounts.cookies) and
      // simply won't be attached to other requests.
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'Network error - could not reach the server. Please check your connection and try again.'
    );
  }

  // A 401 means the access token is missing, expired, or was never valid
  // -- try exactly one silent refresh (it can succeed purely off the
  // httpOnly cookie, even with no token in memory -- e.g. right after a
  // fresh page load) and retry the original request once. `_isRetry`
  // stops this from looping if the refreshed token is *also* rejected,
  // and normalizePath ending in "/auth/refresh/" itself is skipped to
  // avoid refreshing recursively off of the refresh call's own 401.
  if (response.status === 401 && !_isRetry && !normalizedPath.startsWith('/auth/refresh')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, options, true);
    }
  }

  // 204 No Content (e.g. DELETE /categories/{id}/ -- backend's
  // retire_category returns Response(status=204) with no body) has
  // nothing for response.json() to parse. Treat it as success with no
  // payload rather than letting the JSON parse fail and get reported as
  // a bogus "Invalid response from server" -- the request itself
  // already succeeded by the time we get here.
  if (response.status === 204) {
    if (!response.ok) {
      throw new ApiError({} as ApiErrorPayload);
    }
    return undefined as T;
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

// Fetches a binary file (a receipt PDF, etc.) through the same
// authenticated API host every other call above uses, and returns it as
// a Blob rather than parsed JSON.
//
// This deliberately does NOT hit a storage-hosted URL (e.g. a
// `receiptUrl` field from a response) directly -- that host is served
// by the reverse proxy/object storage in staging and production, not
// this Django app, so it doesn't carry this app's CORS configuration
// and can be on a different scheme, both of which silently break a
// scripted `fetch()` (mixed-content or CORS) even though a plain
// browser navigation to the same link works fine. Routing through
// `API_BASE` instead reuses the exact path -- and auth -- every other
// successful request on this page already goes through.
async function downloadFile(path: string): Promise<Blob> {
  const normalizedPath = normalizePath(path);
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE}${normalizedPath}`, {
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await fetch(`${API_BASE}${normalizedPath}`, {
        headers: { Authorization: `Bearer ${newToken}` },
        credentials: 'include',
        cache: 'no-store',
      });
    }
  }

  if (!response.ok) {
    throw new Error('Could not download the file.');
  }

  return response.blob();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  downloadFile,
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
