/**
 * Post-login redirect helpers.
 *
 * A visitor who taps "Book a visit" while signed out is sent to
 * `/{locale}/verify?redirect=/book` (or `/group-visits/new` for a school).
 * After identity verification she should land on that page directly, not on
 * the generic bookings list.
 */

const STORAGE_KEY = 'museum:post-verify-redirect';
// The email-confirmation link opens in a new tab, possibly a while after the
// visitor left /verify, so the intent has to outlive the page (and tab) but
// not linger forever -- a stale one would hijack some later, unrelated login.
const TTL_MS = 30 * 60 * 1000;

const LOCALE_PREFIX = /^\/(en|am)(?=\/|$)/;

/**
 * Accepts only same-site, in-app paths (`/book`, `/en/group-visits/new`,
 * `/book?x=1`) and returns them locale-prefixed for `locale`. Anything
 * else -- absolute URLs, protocol-relative `//evil.com`, backslash tricks,
 * the verify page itself (redirect loop) -- yields `null`.
 */
export function safeRedirectPath(raw: string | null | undefined, locale: string): string | null {
  if (!raw) return null;
  let path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if (/[\u0000-\u001f]/.test(path)) return null;

  path = path.replace(LOCALE_PREFIX, '') || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/verify' || path.startsWith('/verify/') || path.startsWith('/verify?')) return null;
  if (path === '/staff' || path.startsWith('/staff/')) return null;

  return `/${locale}${path === '/' ? '' : path}`;
}

/** Remember where the visitor was headed, so it survives the email-link detour. */
export function rememberRedirect(path: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Storage can be unavailable (private mode, blocked) -- the URL param
    // still covers the common single-tab flow.
  }
}

/** The remembered destination (locale-agnostic path), if still fresh. */
export function peekRememberedRedirect(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    if (!path || !at || Date.now() - at > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export function clearRememberedRedirect(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
