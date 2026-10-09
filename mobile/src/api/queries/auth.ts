import { apiClient } from '@/api/client';
import { authResponseSchema, visitorVerifyStartSchema, userProfileSchema } from '@/api/schemas';
import { useAuth } from '@/auth/useAuth';

export async function startVisitorVerification(input: {
  email: string;
  phone: string;
  full_name?: string;
  language_preference?: 'en' | 'am';
}) {
  const res = await apiClient.post('/auth/visitor/verify/start/', input);
  return visitorVerifyStartSchema.parse(res.data);
}

export async function confirmVisitorVerification(input: {
  verification_id: string;
  otp_code: string;
}) {
  const res = await apiClient.post('/auth/visitor/verify/confirm/', input);
  return authResponseSchema.parse(res.data);
}

export async function staffLogin(input: { email: string; password: string }) {
  const res = await apiClient.post('/auth/login/', input);
  return authResponseSchema.parse(res.data);
}

export async function fetchCurrentUser() {
  const res = await apiClient.get('/users/me/');
  return userProfileSchema.parse(res.data);
}

export function useAuthActions() {
  const { signIn, signOut } = useAuth();
  return { signIn, signOut };
}
