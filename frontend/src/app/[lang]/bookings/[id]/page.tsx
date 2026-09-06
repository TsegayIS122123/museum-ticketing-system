'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SearchX, ArrowLeft, FileDown, CreditCard, AlertTriangle, Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, type BookingStatus } from '@/components/ui/StatusBadge';
import { DigitalTicket } from '@/components/ui/DigitalTicket';
import { CancelRescheduleControls } from '@/features/booking/components/CancelRescheduleControls';
import { getBooking, type BookingResponse } from '@/features/booking/api';
import { requestPartialRefund } from '@/features/refunds/api';
import { ApiError } from '@/lib/api/errors';
import { Toast } from '@/components/ui/Toast';

export default function BookingDetailPage() {
  const { t, locale } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isRequestingRefund, setIsRequestingRefund] = useState(false);
  const [refundRequested, setRefundRequested] = useState(false);

  const bookingId = params.id as string;

  const loadBooking = async () => {
    setIsLoading(true);
    try {
      const data = await getBooking(bookingId);
      setBooking(data);
    } catch (error: any) {
      setToast({
        message: error.message || 'Failed to load booking',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestRefund = async () => {
    if (!booking) return;
    setIsRequestingRefund(true);
    try {
      await requestPartialRefund(booking.id);
      setRefundRequested(true);
      setToast({
        message: t('refund_requested') || 'Refund requested. It will be processed shortly.',
        type: 'success',
      });
    } catch (error: any) {
      if (error instanceof ApiError && error.code === 'conflict') {
        // Already requested (or no eligible shortfall anymore) --
        // services.request_partial_shortfall_refund's per-booking
        // uniqueness guard. Treat it as "already in progress" rather
        // than a hard failure so a duplicate click/tab doesn't look
        // broken to the visitor.
        setRefundRequested(true);
        setToast({
          message: t('refund_already_requested') || 'A refund for this booking has already been requested.',
          type: 'success',
        });
      } else {
        setToast({
          message: error instanceof ApiError ? error.message : 'Failed to request refund',
          type: 'error',
        });
      }
    } finally {
      setIsRequestingRefund(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push(`/${locale}/verify`);
      return;
    }

    if (bookingId) {
      void (async () => {
        await loadBooking();
      })();
    }
    // `loadBooking` intentionally excluded: it's redefined every render
    // (and calls setState itself), so including it here would refetch on
    // every render instead of only when the booking to load changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, isAuthenticated, authLoading, locale, router]);

  if (authLoading || isLoading) {
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

  if (!booking) {
    return (
      <div className="min-h-screen flex flex-col" data-surface="visitor">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center px-4">
          <Card className="max-w-md w-full text-center">
            <div className="mb-4 flex justify-center text-stone-400">
              <SearchX className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">
              {t('booking_not_found') || 'Booking Not Found'}
            </h2>
            <p className="text-stone-500">{t('booking_not_found_description') || 'The booking you are looking for does not exist.'}</p>
            <Button
              className="mt-4"
              onClick={() => router.push(`/${locale}/bookings`)}
            >
              {t('back_to_bookings') || 'Back to Bookings'}
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

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => router.push(`/${locale}/bookings`)}
        >
          <ArrowLeft className="w-4 h-4" /> {t('back_to_bookings') || 'Back to Bookings'}
        </Button>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-serif font-semibold text-stone-900">
              {t('booking_details') || 'Booking Details'}
            </h1>
            <p className="font-mono text-sm text-stone-400 mt-1">
              #{booking.reference}
            </p>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        {/* Booking Info */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-stone-500">{t('visit_date') || 'Visit Date'}</div>
              <div className="font-medium text-stone-900">{formatDate(booking.visitDate)}</div>
            </div>
            <div>
              <div className="text-stone-500">{t('category')}</div>
              <div className="font-medium text-stone-900">
                {booking.items
                  .map((item) =>
                    `${locale === 'en' ? item.categoryNameEn : item.categoryNameAm} x${item.quantity}`
                  )
                  .join(', ')}
              </div>
            </div>
            <div>
              <div className="text-stone-500">{t('quantity')}</div>
              <div className="font-medium text-stone-900">{booking.bookedQuantity}</div>
            </div>
            <div>
              <div className="text-stone-500">{t('total')}</div>
              <div className="text-lg text-primary-600 font-serif font-semibold">
                ETB {booking.totalAmountEtb}
              </div>
            </div>
            {booking.attendedQuantity !== null && booking.attendedQuantity !== undefined && (
              <div>
                <div className="text-stone-500">{t('attended')}</div>
                <div className="font-medium text-stone-900">{booking.attendedQuantity}</div>
              </div>
            )}
            <div>
              <div className="text-stone-500">{t('booked_on') || 'Booked On'}</div>
              <div className="font-medium text-stone-900">{formatDateTime(booking.createdAt)}</div>
            </div>
          </div>

          {booking.receiptUrl && (
            <div className="mt-4 pt-4 border-t border-stone-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(booking.receiptUrl!, '_blank')}
              >
                <FileDown className="w-4 h-4" /> {t('download_receipt')}
              </Button>
            </div>
          )}
        </Card>

        {/* Pay Now */}
        {booking.status === 'awaiting_payment' && (
          <Card className="mb-6 bg-primary-50 border-primary-200">
            <div className="flex items-start gap-3">
              <span className="text-primary-600"><CreditCard className="w-6 h-6" /></span>
              <div className="flex-1">
                <div className="font-semibold text-stone-900">
                  {t('payment_required') || 'Payment Required'}
                </div>
                <p className="text-sm text-stone-600 mt-1">
                  {booking.categoryCorrectedAt
                    ? t('payment_required_correction_description') ||
                      "Your category was corrected at the gate, and there's an outstanding balance for the difference."
                    : t('payment_required_description') ||
                      'This booking is not confirmed until payment is complete.'}
                </p>
                {booking.checkoutUrl ? (
                  <Button
                    size="sm"
                    className="mt-3 bg-brand-primary hover:bg-primary-700"
                    onClick={() => window.open(booking.checkoutUrl!, '_blank')}
                  >
                    {t('pay_now') || 'Pay Now'}
                  </Button>
                ) : (
                  <p className="text-sm text-secondary-700 mt-2">
                    {t('checkout_unavailable') ||
                      "We couldn't open checkout for this booking. Please contact support or try booking again."}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Digital Ticket -- the one deliberately theatrical moment on
            this page; see DigitalTicket.tsx's own comment for why. */}
        {booking.status === 'pending' && (
          <div className="mb-6">
            <DigitalTicket
              reference={booking.reference}
              visitDateLabel={formatDate(booking.visitDate)}
              categorySummary={booking.items
                .map((item) =>
                  `${locale === 'en' ? item.categoryNameEn : item.categoryNameAm} x${item.quantity}`
                )
                .join(', ')}
            />
          </div>
        )}

        {/* Shortfall Notice */}
        {booking.attendedQuantity !== null &&
          booking.attendedQuantity !== undefined &&
          booking.attendedQuantity < booking.bookedQuantity && (
            <Card className="mb-6 bg-secondary-50 border-secondary-200">
              <div className="flex items-start gap-3">
                <span className="text-secondary-600"><AlertTriangle className="w-6 h-6" /></span>
                <div className="flex-1">
                  <div className="font-semibold text-secondary-800">
                    {t('partial_attendance_recorded') || 'Partial Attendance Recorded'}
                  </div>
                  <p className="text-sm text-secondary-700">
                    {booking.bookedQuantity - booking.attendedQuantity} of {booking.bookedQuantity} did not attend.
                    {booking.status === 'visited' && (
                      <span className="block mt-1">
                        {t('refund_available') || 'A refund for the unattended portion is available on request.'}
                      </span>
                    )}
                  </p>
                  {booking.status === 'visited' && (
                    <div className="mt-3">
                      {refundRequested ? (
                        <div className="text-sm font-medium text-secondary-800 flex items-center gap-1.5">
                          <Check className="w-4 h-4" /> {t('refund_requested') || 'Refund requested. It will be processed shortly.'}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-brand-primary hover:bg-primary-700"
                          onClick={handleRequestRefund}
                          disabled={isRequestingRefund}
                        >
                          {isRequestingRefund
                            ? t('processing') || 'Processing...'
                            : t('request_refund') || 'Request Refund'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

        {/* Cancel/Reschedule Controls */}
        <Card>
          <div className="font-semibold text-stone-900 mb-3">
            {t('manage_booking') || 'Manage Booking'}
          </div>
          <p className="text-sm text-stone-500 mb-4">
            {t('manage_booking_description') || 'Cancel or reschedule your booking. Free cancellation up to 48 hours before your visit.'}
          </p>
          <CancelRescheduleControls
            bookingId={booking.id}
            rescheduledCount={booking.rescheduledCount}
            currentVisitDate={booking.visitDate}
            status={booking.status}
            onActionComplete={loadBooking}
          />
        </Card>
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
