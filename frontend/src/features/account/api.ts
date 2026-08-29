import { apiClient } from '@/lib/api/client';
import { MOCK_USERS } from '@/mocks/auth.mock';

export interface VisitorVerifyStartResponse {
  verificationId: string;
  otpExpiresInSeconds: number;
}

export interface VisitorVerifyConfirmResponse {
  accessToken: string;
  refreshToken: string;
  user: typeof MOCK_USERS.visitor;
}

export interface StaffLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: typeof MOCK_USERS.cashier;
}

// Mock mode - set to true for testing without backend
const USE_MOCK = true;

// Visitor passwordless verification - step 1: request OTP
export async function startVisitorVerification(input: {
  email: string;
  phone: string;
  fullName?: string;
  languagePreference?: 'en' | 'am';
}): Promise<VisitorVerifyStartResponse> {
  if (USE_MOCK) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      verificationId: 'mock-verification-id',
      otpExpiresInSeconds: 600,
    };
  }
  return apiClient.post<VisitorVerifyStartResponse>('/auth/visitor/verify/start', input);
}

// Visitor passwordless verification - step 2: confirm OTP
export async function confirmVisitorVerification(input: {
  verificationId: string;
  otpCode: string;
}): Promise<VisitorVerifyConfirmResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 500));
    // Any 6-digit code works in mock mode
    return {
      accessToken: 'mock-access-token-' + Date.now(),
      refreshToken: 'mock-refresh-token-' + Date.now(),
      user: MOCK_USERS.visitor,
    };
  }
  return apiClient.post<VisitorVerifyConfirmResponse>('/auth/visitor/verify/confirm', input);
}

// Staff login (password-based)
export async function staffLogin(input: {
  email: string;
  password: string;
}): Promise<StaffLoginResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Match email to role
    let user: any = MOCK_USERS.cashier;
    if (input.email.includes('manager')) {
      user = MOCK_USERS.manager;
    } else if (input.email.includes('admin')) {
      user = MOCK_USERS.admin;
    } else if (input.email.includes('visitor')) {
      user = MOCK_USERS.visitor;
    }
    
    return {
      accessToken: 'mock-staff-token-' + Date.now(),
      refreshToken: 'mock-refresh-token-' + Date.now(),
      user,
    };
  }
  return apiClient.post<StaffLoginResponse>('/auth/login', input);
}

// Staff forgot password
export async function staffForgotPassword(input: { email: string }): Promise<void> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return;
  }
  return apiClient.post<void>('/auth/forgot-password', input);
}

// Staff reset password
export async function staffResetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return;
  }
  return apiClient.post<void>('/auth/reset-password', input);
}

// Get current user
export async function getCurrentUser(): Promise<VisitorVerifyConfirmResponse['user']> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_USERS.visitor;
  }
  return apiClient.get<VisitorVerifyConfirmResponse['user']>('/users/me');
}

// Update current user
export async function updateCurrentUser(input: {
  fullName?: string;
  phone?: string;
  languagePreference?: 'en' | 'am';
}): Promise<VisitorVerifyConfirmResponse['user']> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { ...MOCK_USERS.visitor, ...input };
  }
  return apiClient.put<VisitorVerifyConfirmResponse['user']>('/users/me', input);
}
