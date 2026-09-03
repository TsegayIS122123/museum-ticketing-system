'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { StaffSidebar } from '@/components/layout/StaffSidebar';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { isStaff } from '@/lib/auth/roles';

interface StaffLayoutProps {
  children: React.ReactNode;
}

export default function StaffLayout({ children }: StaffLayoutProps) {
  const { t, locale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const isLoginRoute = pathname?.endsWith('/staff/login') ?? false;

  useEffect(() => {
    if (isLoading || isLoginRoute) return;

    if (!isAuthenticated || !user || !isStaff(user.role)) {
      router.push(`/${locale}/staff/login`);
    }
  }, [isAuthenticated, isLoading, user, locale, router, isLoginRoute]);

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-stone-500">{t('loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated || !user || !isStaff(user.role)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-stone-50" data-surface="staff">
      <SiteHeader />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <StaffSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
