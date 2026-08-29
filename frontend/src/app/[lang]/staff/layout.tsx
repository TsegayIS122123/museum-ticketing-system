'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { StaffSidebar } from '@/components/layout/StaffSidebar';
import { isStaff } from '@/lib/auth/roles';
import { PageContainer } from '@/components/layout/PageContainer';

interface StaffLayoutProps {
  children: React.ReactNode;
}

export default function StaffLayout({ children }: StaffLayoutProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user || !isStaff(user.role)) {
      router.push(`/${locale}/staff/login`);
    }
  }, [isAuthenticated, isLoading, user, locale, router]);

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
    <div className="flex h-screen bg-stone-50" data-surface="staff">
      <StaffSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
