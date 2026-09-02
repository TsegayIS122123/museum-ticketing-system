import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';
import type { TokenRefreshRequest, TokenRefreshResponse } from '@/lib/api-contract';

// Real backend shape (contracts/openapi.yaml). Every auth-related
// serializer here is snake_case -- including the request bodies and the
// top-level token field names (access_token/refresh_token, NOT
// accessToken/refreshToken). This is a genuine inconsistency in the
// backend itself (most other serializers in this API use a camelCase
// renderer; the plain auth Serializers and the ModelSerializer-based
// Account do not) -- not something the frontend can paper over, it has
// to match what's actually sent.

export type Account = components['schemas']['Account'];
export type VisitorVerifyStartResponse = components['schemas']['VisitorVerifyStartResponse'];
export type AuthResponse = components['schemas']['AuthResponse'];

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
// verification channel (opening the emailed link). Only marks
// email_verified_at; it never issues a session (see VerifyMagicLinkView).
export async function confirmEmailVerification(token: string): Promise<{ detail: string }> {
  return apiClient.get<{ detail: string }>(`/auth/visitor/verify/email/${encodeURIComponent(token)}/`);
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

// POST /auth/refresh/ -- exchanges a refresh token for a new access
// token. Not currently wired up anywhere in the app (no refresh_token is
// persisted today -- see auth-context.tsx), but the endpoint is real.
export async function refreshAccessToken(refresh: string): Promise<TokenRefreshResponse> {
  const body: TokenRefreshRequest = { refresh };
  return apiClient.post<TokenRefreshResponse>('/auth/refresh/', body);
}

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
