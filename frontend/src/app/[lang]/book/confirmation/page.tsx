'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { Confetti } from '@/components/ui/Backdrop';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getBooking, type BookingResponse } from '@/features/booking/api';
import { parseLocalIsoDate } from '@/lib/utils/dates';

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
    const date = parseLocalIsoDate(dateStr);
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
      <Confetti />
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-lg">
          <div className="text-center">
            <div className="pop-in ring-pulse mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-leaf-400 to-leaf-600 text-white shadow-xl">
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
            <h1 className="reveal d1 mt-5 text-2xl font-extrabold text-stone-900 min-[400px]:text-3xl sm:text-4xl">
              <span className="text-gradient">{t('confirm_party_title')}</span>
            </h1>
            <p className="reveal d2 mt-2 text-stone-700">{t('confirm_party_sub')}</p>
            <p className="reveal d2 mt-1 text-sm text-stone-600">{t('confirmation_sent') || 'A confirmation has been sent to your email'}</p>
          </div>

          <Card className="reveal d3 mt-6 border-t-4 border-t-sun-400">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-stone-200 pb-4 text-sm">
              <div className="text-stone-600">{t('reference')}</div>
              <div className="text-right font-mono text-base font-bold tracking-widest text-stone-900">{booking.reference}</div>
              <div className="text-stone-600">{t('date') || 'Date'}</div>
              <div className="min-w-0 break-words text-right font-semibold text-stone-900">{formatDate(booking.visitDate)}</div>
              <div className="text-stone-600">{t('quantity')}</div>
              <div className="text-right font-semibold text-stone-900">{booking.bookedQuantity}</div>
              <div className="text-stone-600">{t('total')}</div>
              <div className="text-right text-lg font-extrabold text-primary-700">ETB {booking.totalAmountEtb}</div>
              <div className="text-stone-600">{t('status')}</div>
              <div className="text-right">
                <StatusBadge status={booking.status} />
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <Button className="w-full" onClick={() => router.push(`/${locale}/bookings/${booking.id}`)}>
                {t('view_booking') || 'View Booking'}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => router.push(`/${locale}`)}>
                {t('back_to_home') || 'Back to Home'}
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
