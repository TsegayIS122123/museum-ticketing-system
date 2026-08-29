'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { GroupVisitRequestForm } from '@/features/group-bookings/components/GroupVisitRequestForm';

export default function NewGroupVisitPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(`/${locale}/verify?redirect=/group-visits/new`);
    }
  }, [isAuthenticated, isLoading, locale, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" data-surface="visitor">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-stone-500">{t('loading')}</div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-stone-900">
            {t('group_visit_request') || 'Group / School Visit Request'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('group_visit_description') || 'Submit a request for a group or school visit. A museum manager will review and approve your request.'}
          </p>
        </div>

        <GroupVisitRequestForm />
      </main>
    </div>
  );
}
