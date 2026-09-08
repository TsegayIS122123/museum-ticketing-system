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
  const { user, isAuthenticated, isLoading } = useAuth();

  // Same gate as book/page.tsx, and for the same reason: create_booking
  // (this form's booking_type=GROUP goes through the same service call
  // as an individual booking) requires email_verified_at too, not just
  // phone/OTP. Checking it here sends an unverified visitor to /verify
  // before she fills out the group-visit form, not after.
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(`/${locale}/verify?redirect=/group-visits/new`);
      return;
    }
    if (user && !user.email_verified_at) {
      router.push(`/${locale}/verify?redirect=/group-visits/new`);
    }
  }, [isAuthenticated, isLoading, user, locale, router]);

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

  if (!isAuthenticated || (user && !user.email_verified_at)) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-semibold text-stone-900">
            {t('group_visit_request') || 'Group / School Visit Request'}
          </h1>
        </div>

        <GroupVisitRequestForm />
      </main>
    </div>
  );
}
