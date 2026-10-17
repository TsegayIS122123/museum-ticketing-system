'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import type { UserRole } from '@/lib/auth/roles';
import { getPostLoginPath } from '@/lib/auth/roles';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/signin',
}: ProtectedRouteProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(`/${locale}${redirectTo}`);
      return;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      // Send the wrong-role user to their own home: a visitor bounced off a
      // staff page goes back to the public site, staff go to their dashboard
      // (getPostLoginPath owns that mapping).
      router.push(user.role === 'visitor' ? `/${locale}` : getPostLoginPath(locale, user.role));
    }
  }, [isAuthenticated, isLoading, user, allowedRoles, locale, router, redirectTo]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-stone-500">{t('loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
