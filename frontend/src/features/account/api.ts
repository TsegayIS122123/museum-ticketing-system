import { apiClient } from '@/lib/api/client';

// Real backend shape (contracts/openapi.yaml). Every auth-related
// serializer here is snake_case -- including the request bodies and the
// top-level token field names (access_token/refresh_token, NOT
// accessToken/refreshToken). This is a genuine inconsistency in the
// backend itself (most other serializers in this API use a camelCase
// renderer; the plain auth Serializers and the ModelSerializer-based
// Account do not) -- not something the frontend can paper over, it has
// to match what's actually sent.

export interface Account {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  role: 'visitor' | 'cashier' | 'museum_manager' | 'platform_admin';
  language_preference: 'en' | 'am';
  active: boolean;
  created_at: string;
}

export interface VisitorVerifyStartResponse {
  verification_id: string;
  otp_expires_in_seconds: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: Account;
}

// POST /auth/visitor/verify/start/ -- step 1: request OTP.
export async function startVisitorVerification(input: {
  email: string;
  phone: string;
  full_name?: string;
  language_preference?: 'en' | 'am';
}): Promise<VisitorVerifyStartResponse> {
  return apiClient.post<VisitorVerifyStartResponse>('/auth/visitor/verify/start/', input);
}

// POST /auth/visitor/verify/confirm/ -- step 2: confirm OTP, issues the
// same token pair staff login does.
export async function confirmVisitorVerification(input: {
  verification_id: string;
  otp_code: string;
}): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/visitor/verify/confirm/', input);
}

// POST /auth/login/ -- Staff only (password-based).
export async function staffLogin(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/login/', input);
}

// POST /auth/forgot-password/ -- Staff only. Always 200 regardless of
// whether the email matches an account (services.request_password_reset).
export async function staffForgotPassword(input: { email: string }): Promise<void> {
  return apiClient.post<void>('/auth/forgot-password/', input);
}

// POST /auth/reset-password/ -- Staff only.
export async function staffResetPassword(input: {
  token: string;
  new_password: string;
}): Promise<void> {
  return apiClient.post<void>('/auth/reset-password/', input);
}

// POST /auth/refresh/ -- exchanges a refresh token for a new access
// token. Not currently wired up anywhere in the app (no refresh_token is
// persisted today -- see auth-context.tsx), but the endpoint is real.
export async function refreshAccessToken(refresh: string): Promise<{ access: string }> {
  return apiClient.post<{ access: string }>('/auth/refresh/', { refresh });
}

// GET /users/me/ -- current account, Visitor or Staff.
export async function getCurrentUser(): Promise<Account> {
  return apiClient.get<Account>('/users/me/');
}

// PUT /users/me/
export async function updateCurrentUser(input: {
  full_name?: string;
  phone?: string;
  language_preference?: 'en' | 'am';
}): Promise<Account> {
  return apiClient.put<Account>('/users/me/', input);
}
