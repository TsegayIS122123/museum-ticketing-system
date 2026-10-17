import { apiClient, headlessRequest } from '@/lib/api/client';
import type { components } from '@/lib/api-types';

// Real backend shapes (contracts/openapi.yaml). The app's own auth
// Serializers are snake_case -- including the top-level token field name
// (access_token, NOT accessToken). The refresh token is never returned in
// this JSON for web: it's set as an httpOnly cookie by
// apps.accounts.cookies as a side effect of POST /auth/login/, and only
// mobile (X-Client-Platform: expo) receives it in the body.
//
// The account lifecycle (register / email-verify / password-reset) is served
// by django-allauth's headless API under /_allauth/. See headlessRequest in
// lib/api/client.ts for why the app client (not browser) is used.

export type Account = components['schemas']['Account'];
export type AuthResponse = components['schemas']['AuthResponse'];
export type DetailResponse = components['schemas']['DetailResponse'];

// django-allauth's app client is token-based rather than cookie-based: the
// signup response mints a short-lived `meta.session_token` that the client
// must echo back (X-Session-Token) to continue the pending verification
// flow (verify / resend). It only needs to survive the register ->
// verify-email hop, so sessionStorage (per-tab, cleared on close) is the
// right home -- not localStorage. The email rides along so the verify page
// can echo "we sent a code to <email>" even after a reload.
const HEADLESS_SESSION_KEY = 'museum:headless-session';

export interface HeadlessSessionState {
  sessionToken: string;
  email?: string;
}

export function rememberHeadlessSession(state: HeadlessSessionState): void {
  try {
    window.sessionStorage.setItem(HEADLESS_SESSION_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode, blocked) -- the flow then
    // simply can't be resumed on a later page, which is handled gracefully.
  }
}

export function readHeadlessSession(): HeadlessSessionState | null {
  try {
    const raw = window.sessionStorage.getItem(HEADLESS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HeadlessSessionState;
    return parsed?.sessionToken ? parsed : null;
  } catch {
    return null;
  }
}

export function clearHeadlessSession(): void {
  try {
    window.sessionStorage.removeItem(HEADLESS_SESSION_KEY);
  } catch {
    // ignore
  }
}

// django-allauth's headless envelope. `data.user` is the full Account
// profile (our HEADLESS_ADAPTER); `data.flows` describes what the client may
// do next (the discovery response for an unauthenticated request); and for
// the app client `meta` carries the app's SimpleJWT (access_token /
// refresh_token) via SimpleJWTTokenStrategy, plus the `session_token` that
// continues the verification flow. Errors (`400`/`403`) arrive as a top-level
// `errors` array and are turned into an ApiError by headlessRequest, so they
// never reach these callers.
export interface HeadlessFlow {
  id: string;
  is_pending?: boolean;
}
export interface HeadlessEnvelope {
  status: number;
  data?: { user?: Account; flows?: HeadlessFlow[] } & Record<string, unknown>;
  meta?: {
    access_token?: string;
    refresh_token?: string;
    session_token?: string;
    is_authenticated?: boolean;
  } & Record<string, unknown>;
}

// POST /_allauth/app/v1/auth/signup -- create an account (unified: any role,
// though self-registration only produces a visitor). Sends the verification
// email (6-digit code + link). Returns 401 with
// `data.flows[verify_email].is_pending` and a `meta.session_token` for a
// fresh account; that token must be replayed (X-Session-Token) to
// verifyEmail/resendVerificationEmail. A duplicate email intentionally
// returns the same shape (no account enumeration).
export async function signUp(input: {
  email: string;
  full_name?: string;
  password: string;
}): Promise<HeadlessEnvelope> {
  return headlessRequest<HeadlessEnvelope>('/auth/signup', input);
}

// POST /auth/login/ -- the single front-door sign-in for every role
// (FR-ACC-002, FR-ACC-005). Email + password only; the caller's `role` is
// returned on `user` and the client routes from there. Sets the httpOnly
// refresh cookie.
export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/login/', input);
}

// POST /_allauth/app/v1/auth/email/verify -- redeem the 6-digit code OR the
// link token from the verification email (`key` accepts either). Requires the
// flow's `sessionToken`. Returns 200 with `data.user` on success.
export async function verifyEmail(input: {
  key: string;
  sessionToken: string;
}): Promise<HeadlessEnvelope> {
  return headlessRequest<HeadlessEnvelope>(
    '/auth/email/verify',
    { key: input.key },
    { sessionToken: input.sessionToken }
  );
}

// POST /_allauth/app/v1/auth/email/verify/resend -- re-send the verification
// email/code for the pending flow. Takes no JSON body (allauth resumes the
// EmailVerificationProcess from the session/stage), only the `sessionToken`.
export async function resendVerificationEmail(sessionToken: string): Promise<HeadlessEnvelope> {
  return headlessRequest<HeadlessEnvelope>(
    '/auth/email/verify/resend',
    undefined,
    { sessionToken }
  );
}

// POST /_allauth/app/v1/auth/password/request -- always 200 regardless of
// whether the email matches an account (no account enumeration).
export async function requestPasswordReset(input: { email: string }): Promise<HeadlessEnvelope> {
  return headlessRequest<HeadlessEnvelope>('/auth/password/request', input);
}

// POST /_allauth/app/v1/auth/password/reset -- redeem the reset code/link
// token (`key`) and set the new password.
export async function resetPassword(input: {
  key: string;
  password: string;
}): Promise<HeadlessEnvelope> {
  return headlessRequest<HeadlessEnvelope>('/auth/password/reset', input);
}

// POST /auth/refresh/ and POST /auth/logout/ are both handled directly in
// lib/api/client.ts (refreshAccessToken()) / lib/auth/auth-context.tsx
// (logout()) -- neither takes a body, both rely on the httpOnly
// refresh-token cookie, so there's nothing for this file to wrap.

// GET /users/me/ -- current account, Visitor or Staff.
export async function getCurrentUser(): Promise<Account> {
  return apiClient.get<Account>('/users/me/');
}

// PUT /users/me/
export async function updateCurrentUser(
  input: components['schemas']['AccountUpdate']
): Promise<Account> {
  return apiClient.put<Account>('/users/me/', input);
}
