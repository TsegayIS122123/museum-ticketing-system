import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';

// Real backend shape (contracts/openapi.yaml). Every auth-related
// serializer here is snake_case -- including the request bodies and the
// top-level token field name (access_token, NOT accessToken). This is a
// genuine inconsistency in the backend itself (most other serializers in
// this API use a camelCase renderer; the plain auth Serializers and the
// ModelSerializer-based Account do not) -- not something the frontend
// can paper over, it has to match what's actually sent.
//
// AuthResponse no longer carries a refresh_token field at all -- the
// refresh token is set as an httpOnly cookie (apps.accounts.cookies) as
// a side effect of this same response, never returned in JSON.

export type Account = components['schemas']['Account'];
export type VisitorVerifyStartResponse = components['schemas']['VisitorVerifyStartResponse'];
export type AuthResponse = components['schemas']['AuthResponse'];
export type DetailResponse = components['schemas']['DetailResponse'];

// POST /auth/visitor/verify/start/ -- step 1: request OTP.
export async function startVisitorVerification(
  input: components['schemas']['VisitorVerifyStart']
): Promise<VisitorVerifyStartResponse> {
  return apiClient.post<VisitorVerifyStartResponse>('/auth/visitor/verify/start/', input);
}

// POST /auth/visitor/verify/confirm/ -- step 2: confirm OTP, issues the
// same token pair staff login does.
export async function confirmVisitorVerification(
  input: components['schemas']['VisitorVerifyConfirm']
): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/visitor/verify/confirm/', input);
}

// GET /auth/visitor/verify/email/{token}/ -- the secondary/fallback
// email-link verification channel. Marks email_verified_at but never
// issues a session on its own (unlike confirmVisitorVerification's OTP
// path above, which does). Takes the raw token from the emailed link's
// query string, not a { verification_id, otp_code } pair.
export async function confirmEmailVerification(token: string): Promise<DetailResponse> {
  return apiClient.get<DetailResponse>(`/auth/visitor/verify/email/${encodeURIComponent(token)}/`);
}

// POST /auth/login/ -- Staff only (password-based).
export async function staffLogin(input: components['schemas']['StaffLogin']): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/login/', input);
}

// POST /auth/forgot-password/ -- Staff only. Always 200 regardless of
// whether the email matches an account (services.request_password_reset).
export async function staffForgotPassword(
  input: components['schemas']['ForgotPassword']
): Promise<void> {
  return apiClient.post<void>('/auth/forgot-password/', input);
}

// POST /auth/reset-password/ -- Staff only.
export async function staffResetPassword(
  input: components['schemas']['ResetPassword']
): Promise<void> {
  return apiClient.post<void>('/auth/reset-password/', input);
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
