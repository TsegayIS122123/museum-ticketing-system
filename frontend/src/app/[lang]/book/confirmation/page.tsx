'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getBooking, type BookingResponse } from '@/features/booking/api';

export default function ConfirmationPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference');
  
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBooking = async () => {
      if (!reference) {
        setError('No booking reference provided');
        setIsLoading(false);
        return;
      }

      try {
        // In production, we'd fetch the booking by reference
        // For now, we'll simulate a successful booking
        setIsLoading(false);
        // const data = await getBookingByReference(reference);
        // setBooking(data);
        
        // Mock data for demonstration
        setBooking({
          id: 'mock-id',
          reference: reference,
          visitorId: 'mock-visitor',
          categoryId: 'mock-category',
          visitDate: new Date().toISOString().split('T')[0],
          bookingType: 'individual',
          groupName: null,
          bookedQuantity: 2,
          attendedQuantity: null,
          status: 'pending',
          approvalStatus: null,
          rescheduledCount: 0,
          noticeSentAt: null,
          checkoutUrl: null,
          receiptUrl: null,
          totalAmountEtb: 100,
          createdAt: new Date().toISOString(),
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load booking');
        setIsLoading(false);
      }
    };

    loadBooking();
  }, [reference]);

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
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">
              {t('booking_failed') || 'Booking Failed'}
            </h2>
            <p className="text-stone-500">{error || t('try_again') || 'Please try again'}</p>
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
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✅
            </div>
            <h1 className="text-2xl font-serif font-bold text-stone-900">
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
              <div className="font-bold text-amber-600 text-right">
                ETB {booking.totalAmountEtb}
              </div>
              <div className="text-stone-500">{t('status')}</div>
              <div className="text-right">
                <StatusBadge status={booking.status} />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
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
