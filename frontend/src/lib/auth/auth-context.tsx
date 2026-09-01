'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setAccessToken, setRefreshToken, clearAuthTokens, getAccessToken } from '@/lib/api/client';
import { apiClient } from '@/lib/api/client';

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
  // Matches AuthResponse's real field names (access_token/refresh_token,
  // not accessToken/refreshToken).
  login: (tokens: { access_token: string; refresh_token: string }, userData: User) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      apiClient
        .get<User>('/users/me/')
        .then((userData) => {
          setUser(userData);
          setIsAuthenticated(true);
        })
        .catch(() => {
          clearAuthTokens();
          setIsAuthenticated(false);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (tokens: { access_token: string; refresh_token: string }, userData: User) => {
    setAccessToken(tokens.access_token);
    // apiClient (lib/api/client.ts) now uses this to silently refresh
    // the access token on a 401 -- SIMPLE_JWT's ACCESS_TOKEN_LIFETIME is
    // only 15 minutes, so without a refresh token stashed here every
    // Staff member would otherwise get logged out mid-shift on the
    // access token's first expiry, roughly every 15 minutes.
    setRefreshToken(tokens.refresh_token);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = () => {
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
