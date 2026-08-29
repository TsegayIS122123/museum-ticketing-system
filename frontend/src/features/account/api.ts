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

// Mock mode - set to false when backend is ready
const USE_MOCK = true;

// Store the latest verification ID for mock
let mockVerificationId: string | null = null;

// Mock user data
const MOCK_VISITOR = {
  id: 'mock-visitor-1',
  email: 'visitor@example.com',
  phone: '+251912345678',
  fullName: 'Test Visitor',
  role: 'visitor' as const,
  languagePreference: 'en' as const,
  active: true,
  createdAt: new Date().toISOString(),
};

const MOCK_STAFF = {
  cashier: {
    id: 'mock-cashier-1',
    email: 'cashier@museum.et',
    phone: '+251912345678',
    fullName: 'Test Cashier',
    role: 'cashier' as const,
    languagePreference: 'en' as const,
    active: true,
    createdAt: new Date().toISOString(),
  },
  manager: {
    id: 'mock-manager-1',
    email: 'manager@museum.et',
    phone: '+251912345678',
    fullName: 'Test Manager',
    role: 'museum_manager' as const,
    languagePreference: 'en' as const,
    active: true,
    createdAt: new Date().toISOString(),
  },
  admin: {
    id: 'mock-admin-1',
    email: 'admin@museum.et',
    phone: '+251912345678',
    fullName: 'Test Admin',
    role: 'platform_admin' as const,
    languagePreference: 'en' as const,
    active: true,
    createdAt: new Date().toISOString(),
  },
};

// Visitor passwordless verification - step 1: request OTP
export async function startVisitorVerification(input: {
  email: string;
  phone: string;
  fullName?: string;
  languagePreference?: 'en' | 'am';
}): Promise<VisitorVerifyStartResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 800));
    mockVerificationId = 'mock-verification-id-' + Date.now();
    return {
      verificationId: mockVerificationId,
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
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Check if verification ID matches
    if (input.verificationId !== mockVerificationId) {
      throw new Error('Invalid verification ID. Please restart the verification process.');
    }
    
    // Any 6-digit code works in mock mode
    if (input.otpCode.length === 6 && /^\d{6}$/.test(input.otpCode)) {
      mockVerificationId = null; // Clear after use
      return {
        accessToken: 'mock-access-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now(),
        user: MOCK_VISITOR,
      };
    }
    throw new Error('Invalid OTP code. Please enter a 6-digit code.');
  }
  return apiClient.post<VisitorVerifyConfirmResponse>('/auth/visitor/verify/confirm', input);
}

// Staff login (password-based)
export async function staffLogin(input: {
  email: string;
  password: string;
}): Promise<StaffLoginResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    let user: any;
    if (input.email.includes('manager')) {
      user = MOCK_STAFF.manager;
    } else if (input.email.includes('admin')) {
      user = MOCK_STAFF.admin;
    } else if (input.email.includes('cashier')) {
      user = MOCK_STAFF.cashier;
    } else {
      throw new Error('Invalid credentials. Please check your email and password.');
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
    await new Promise(resolve => setTimeout(resolve, 800));
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
    await new Promise(resolve => setTimeout(resolve, 800));
    return;
  }
  return apiClient.post<void>('/auth/reset-password', input);
}

// Get current user
export async function getCurrentUser(): Promise<VisitorVerifyConfirmResponse['user']> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_VISITOR;
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
    return { ...MOCK_VISITOR, ...input };
  }
  return apiClient.put<VisitorVerifyConfirmResponse['user']>('/users/me', input);
}
