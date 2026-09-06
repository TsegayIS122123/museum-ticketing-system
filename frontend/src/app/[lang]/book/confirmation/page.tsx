'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getBooking, type BookingResponse } from '@/features/booking/api';

// `useSearchParams()` opts a page out of static prerendering unless it's
// wrapped in a Suspense boundary (Next.js requires this so it can render
// a fallback for the statically-generated shell while the actual search
// params are only known client-side) -- without this wrapper `next build`
// fails outright on this route with "useSearchParams() should be wrapped
// in a suspense boundary". The actual `?id=` read and data fetch stay in
// ConfirmationPageContent below; this component only provides the
// boundary and fallback.
export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col" data-surface="visitor">
          <PublicHeader />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-stone-500">Loading…</div>
          </main>
        </div>
      }
    >
      <ConfirmationPageContent />
    </Suspense>
  );
}

function ConfirmationPageContent() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  // NOTE: this now reads the booking id, not the reference code. The only
  // "fetch by reference" endpoint in the contract (GET /bookings/lookup) is
  // Cashier-only, so a public visitor page can't use it. createBooking()
  // already returns the id, so whatever page navigates here after booking
  // should pass ?id=<booking.id> rather than ?reference=<booking.reference>.
  const id = searchParams.get('id');

  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!id) {
        if (!cancelled) {
          setError(t('no_booking_id') || 'No booking id provided');
          setIsLoading(false);
        }
        return;
      }

      try {
        const data = await getBooking(id);
        if (!cancelled) setBooking(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load booking');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `t` intentionally excluded: useTranslation() returns a new function
    // reference every render, so including it here would refire this
    // fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  if (error || !booking) {
    return (
      <div className="min-h-screen flex flex-col" data-surface="visitor">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center px-4">
          <Card className="max-w-md w-full text-center">
            <div className="mb-4 flex justify-center text-red-500">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">
              {t('booking_failed') || 'Booking Failed'}
            </h2>
            <p className="text-stone-500">{error || t('please_try_again') || 'Please try again'}</p>
            <Button
              className="mt-4"
              onClick={() => router.push(`/${locale}/book`)}
            >
              {t('try_again') || 'Try Again'}
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="max-w-lg w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-serif font-semibold text-stone-900">
              {t('booking_confirmed') || 'Booking Confirmed!'}
            </h1>
            <p className="text-stone-500 mt-1 text-sm">
              {t('confirmation_sent') || 'A confirmation has been sent to your email'}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm border-b border-stone-100 pb-4">
              <div className="text-stone-500">{t('reference')}</div>
              <div className="font-mono font-medium text-stone-900 text-right">
                {booking.reference}
              </div>
              <div className="text-stone-500">{t('date') || 'Date'}</div>
              <div className="font-medium text-stone-900 text-right">
                {formatDate(booking.visitDate)}
              </div>
              <div className="text-stone-500">{t('quantity')}</div>
              <div className="font-medium text-stone-900 text-right">
                {booking.bookedQuantity}
              </div>
              <div className="text-stone-500">{t('total')}</div>
              <div className="font-bold text-primary-600 text-right">
                ETB {booking.totalAmountEtb}
              </div>
              <div className="text-stone-500">{t('status')}</div>
              <div className="text-right">
                <StatusBadge status={booking.status} />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                className="w-full bg-brand-primary hover:bg-primary-700"
                onClick={() => router.push(`/${locale}/bookings/${booking.id}`)}
              >
                {t('view_booking') || 'View Booking'}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => router.push(`/${locale}`)}
              >
                {t('back_to_home') || 'Back to Home'}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
