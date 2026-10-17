import { API_BASE_URL } from '@/constants/config';
import { ApiError } from './errors';

// The API origin without the `/api/v1` suffix -- django-allauth's headless
// endpoints are mounted at the site root (`/_allauth/...`), not under the
// versioned API prefix (backend/config/urls.py). Mirrors the web client
// (frontend/src/lib/api/client.ts).
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

interface HeadlessErrorItem {
  code?: string;
  param?: string;
  message?: string;
}

// django-allauth's error envelope is `{status, errors:[{code,param,message}]}`
// -- nothing like this app's own `{errors:{field:[...]}, message}`
// (typed by ApiError). Normalize it so every caller keeps using isApiError /
// .message / .fieldErrors.
function headlessError(data: unknown): ApiError {
  const payload = data as { errors?: HeadlessErrorItem[]; detail?: string };
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const first = errors[0];
  const fieldErrors: Record<string, string[]> = {};
  for (const e of errors) {
    if (e.param) {
      (fieldErrors[e.param] ||= []).push(e.message ?? 'Invalid value');
    }
  }
  return new ApiError({
    message: first?.message || payload?.detail || 'An unexpected error occurred',
    errors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
  });
}

// Calls django-allauth's headless **app** client (/_allauth/app/v1/...). The
// app client is `csrf_exempt` and token-based, so it's the right choice for
// the native app (mobile reads the returned `meta` SimpleJWT tokens directly).
//
// Status semantics (verified against the running backend): 200 = success;
// 401 = allauth's "not authenticated" envelope, which is the *expected*
// success shape for signup-pending-verification and for a completed password
// reset (both carry `data.flows`/`meta` and no `errors`); 400 with an `errors`
// array = validation failure; 409 (`{status}`) = invalid/expired key or an
// absent/reset verification process. So only throw when `errors` is present,
// or on a 4xx/5xx that isn't 401. Note: allauth paths have NO trailing slash.
export async function headlessRequest<T>(
  path: string,
  body?: unknown,
  options?: { sessionToken?: string }
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'expo',
  };
  if (options?.sessionToken) {
    headers['X-Session-Token'] = options.sessionToken;
  }

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}/_allauth/app/v1${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({
      message: 'Network error - could not reach the server. Please check your connection and try again.',
    });
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError({ message: 'Invalid response from server' });
  }

  const envelope = data as { errors?: unknown[] };
  if (Array.isArray(envelope?.errors) && envelope.errors.length > 0) {
    throw headlessError(data);
  }

  if (response.ok || response.status === 401) {
    return data as T;
  }

  throw new ApiError(
    {},
    'This request is invalid or has expired. Please try again.',
    response.status
  );
}
