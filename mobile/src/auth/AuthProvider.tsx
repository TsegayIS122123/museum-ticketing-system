import { createContext, ReactNode, useEffect, useState } from 'react';
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

  // Session restore. Deliberately written as promise continuations rather
  // than an `await`-ing `bootstrap()` called from the effect body: a
  // function that sets state, called straight from an effect, is what
  // `react-hooks/set-state-in-effect` flags (it can cascade renders), and
  // this way every setState happens in a callback once the async work has
  // actually resolved. The `cancelled` flag is the reason this also can't
  // set state after unmount.
  useEffect(() => {
    let cancelled = false;

    getAccessToken()
      .then((token) => {
        if (cancelled) return undefined;
        if (!token) {
          setUser(null);
          setIsLoading(false);
          return undefined;
        }
        return apiClient.get('/users/me/').then((res) => {
          if (cancelled) return;
          const parsed = userProfileSchema.safeParse(res.data);
          setUser(parsed.success ? parsed.data : null);
          setIsLoading(false);
        });
      })
      .catch(() => {
        if (cancelled) return;
        void clearTokens();
        setUser(null);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
