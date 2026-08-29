import { apiClient } from '@/lib/api/client';

export interface VisitorVerifyStartResponse {
  verificationId: string;
  otpExpiresInSeconds: number;
}

export interface VisitorVerifyConfirmResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    phone: string;
    fullName?: string;
    role: 'visitor' | 'cashier' | 'museum_manager' | 'platform_admin';
    languagePreference: 'en' | 'am';
    active: boolean;
    createdAt: string;
  };
}

export interface StaffLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    phone: string;
    fullName: string;
    role: 'cashier' | 'museum_manager' | 'platform_admin';
    languagePreference: 'en' | 'am';
    active: boolean;
    createdAt: string;
  };
}

// Visitor passwordless verification - step 1: request OTP
export async function startVisitorVerification(input: {
  email: string;
  phone: string;
  fullName?: string;
  languagePreference?: 'en' | 'am';
}): Promise<VisitorVerifyStartResponse> {
  return apiClient.post<VisitorVerifyStartResponse>('/auth/visitor/verify/start', input);
}

// Visitor passwordless verification - step 2: confirm OTP
export async function confirmVisitorVerification(input: {
  verificationId: string;
  otpCode: string;
}): Promise<VisitorVerifyConfirmResponse> {
  return apiClient.post<VisitorVerifyConfirmResponse>('/auth/visitor/verify/confirm', input);
}

// Staff login (password-based)
export async function staffLogin(input: {
  email: string;
  password: string;
}): Promise<StaffLoginResponse> {
  return apiClient.post<StaffLoginResponse>('/auth/login', input);
}

// Staff forgot password
export async function staffForgotPassword(input: { email: string }): Promise<void> {
  return apiClient.post<void>('/auth/forgot-password', input);
}

// Staff reset password
export async function staffResetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  return apiClient.post<void>('/auth/reset-password', input);
}

// Get current user
export async function getCurrentUser(): Promise<VisitorVerifyConfirmResponse['user']> {
  return apiClient.get<VisitorVerifyConfirmResponse['user']>('/users/me');
}

// Update current user
export async function updateCurrentUser(input: {
  fullName?: string;
  phone?: string;
  languagePreference?: 'en' | 'am';
}): Promise<VisitorVerifyConfirmResponse['user']> {
  return apiClient.put<VisitorVerifyConfirmResponse['user']>('/users/me', input);
}
