'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import type { UserRole } from '@/lib/auth/roles';
import { isStaff } from '@/lib/auth/roles';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/verify',
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
      // Redirect to appropriate dashboard based on role
      if (user.role === 'visitor') {
        router.push(`/${locale}/`);
      } else if (user.role === 'cashier') {
        router.push(`/${locale}/staff/gate`);
      } else if (user.role === 'museum_manager') {
        router.push(`/${locale}/staff/dashboard`);
      } else if (user.role === 'platform_admin') {
        router.push(`/${locale}/staff/admin/staff`);
      } else {
        router.push(`/${locale}/`);
      }
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
