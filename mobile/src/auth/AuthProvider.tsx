import { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { userProfileSchema, type UserProfile } from '@/api/schemas';
import { clearTokens, getAccessToken, setTokens } from './session';

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (params: {
    accessToken: string;
    refreshToken: string;
    user: UserProfile;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }
      const res = await apiClient.get('/users/me/');
      const parsed = userProfileSchema.safeParse(res.data);
      setUser(parsed.success ? parsed.data : null);
    } catch {
      await clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const signIn: AuthState['signIn'] = async ({ accessToken, refreshToken, user }) => {
    await setTokens({ accessToken, refreshToken });
    setUser(user);
  };

  const signOut = async () => {
    try {
      await apiClient.post('/auth/logout/');
    } catch {
      // Best effort — clear locally regardless
    }
    await clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
