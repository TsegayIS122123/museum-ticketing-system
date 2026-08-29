'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setAccessToken, clearAccessToken, getAccessToken } from '@/lib/api/client';
import { apiClient } from '@/lib/api/client';

interface User {
  id: string;
  email: string;
  phone: string;
  fullName?: string;
  role: 'visitor' | 'cashier' | 'museum_manager' | 'platform_admin';
  languagePreference: 'en' | 'am';
  active: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (tokens: { accessToken: string; refreshToken: string }, userData: User) => void;
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
        .get<User>('/users/me')
        .then((userData) => {
          setUser(userData);
          setIsAuthenticated(true);
        })
        .catch(() => {
          clearAccessToken();
          setIsAuthenticated(false);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (tokens: { accessToken: string; refreshToken: string }, userData: User) => {
    setAccessToken(tokens.accessToken);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = () => {
    clearAccessToken();
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
