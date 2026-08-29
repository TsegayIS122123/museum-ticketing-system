import { useAuth as useAuthContext } from '@/lib/auth/auth-context';

// Re-export the auth hook for convenience
export function useAuth() {
  return useAuthContext();
}
