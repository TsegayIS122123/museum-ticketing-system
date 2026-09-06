'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { setAccessToken, clearAuthTokens, refreshAccessToken } from '@/lib/api/client';
import { apiClient } from '@/lib/api/client';

// Routes that exist specifically for a visitor with NO valid session --
// credential recovery and the login form itself. Attempting a silent
// refresh here is never useful (a signed-in visitor has no reason to be
// on /forgot-password or /reset-password) and, if a stale refresh-token
// cookie happens to be present, adds a pointless failed /auth/refresh/
// call to every page load. Matched with a trailing-segment check so it
// still hits under any `/{lang}/...` prefix (e.g. `/en/staff/login`).
const PUBLIC_AUTH_ROUTE_SEGMENTS = [
  '/staff/login',
  '/staff/forgot-password',
  '/reset-password',
];

export function isPublicAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_AUTH_ROUTE_SEGMENTS.some((segment) => pathname.endsWith(segment));
}

// Matches the real `Account` schema (contracts/openapi.yaml) returned by
// GET /users/me/ and nested in AuthResponse.user -- snake_case, because
// AccountSerializer is a plain DRF ModelSerializer, unlike most of the
// rest of this API which uses the camelCase renderer.
interface User {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  role: 'visitor' | 'cashier' | 'museum_manager' | 'platform_admin';
  language_preference: 'en' | 'am';
  active: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Matches AuthResponse's real field name (access_token, not
  // accessToken) -- refresh_token is no longer part of this shape at
  // all, it arrives as an httpOnly cookie the backend sets directly
  // (apps.accounts.cookies), never in a JS-readable response field.
  login: (tokens: { access_token: string }, userData: User) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pathname = usePathname();
  const isPublicRoute = isPublicAuthRoute(pathname);

  useEffect(() => {
    // On every fresh mount (first load, or coming back from a full page
    // navigation away from the app -- e.g. Chapa's hosted checkout
    // redirecting back via return_url) there's nothing left in memory,
    // so `getAccessToken()` would always be null here. Instead, always
    // attempt a silent refresh first: it succeeds purely off the
    // httpOnly refresh-token cookie the browser already carries, and
    // only a signed-out visitor (no valid cookie) actually falls through
    // to `isAuthenticated: false`.
    let cancelled = false;

    async function bootstrap() {
      // Exception: skip this entirely on public auth routes (login,
      // forgot-password, reset-password) -- see isPublicAuthRoute above.
      if (isPublicRoute) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      const newAccessToken = await refreshAccessToken();
      if (!newAccessToken) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const userData = await apiClient.get<User>('/users/me/');
        if (cancelled) return;
        setUser(userData);
        setIsAuthenticated(true);
      } catch {
        if (!cancelled) clearAuthTokens();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // Intentionally re-runs only when navigating into/out of a public
    // auth route, not on every pathname change; see isPublicRoute above.
  }, [isPublicRoute]);

  const login = (tokens: { access_token: string }, userData: User) => {
    // The refresh token isn't handled here at all -- the response that
    // carried `tokens.access_token` also set the httpOnly cookie as a
    // side effect (Set-Cookie header), which this code never sees or
    // needs to.
    setAccessToken(tokens.access_token);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = () => {
    // Fire-and-forget: clears the httpOnly refresh-token cookie
    // server-side (apps.accounts.views.LogoutView) so a stale cookie
    // can't silently re-authenticate this browser later. Local state
    // clears immediately regardless of whether this call succeeds.
    apiClient.post('/auth/logout/').catch(() => {});
    clearAuthTokens();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
