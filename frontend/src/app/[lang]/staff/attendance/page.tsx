'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flag, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toast } from '@/components/ui/Toast';
import { getFlaggedBookings } from '@/features/attendance/api';
import type { Booking } from '@/features/attendance/api';
import { CategoryCorrectionPanel } from '@/features/entrance/components/CategoryCorrectionPanel';
import type { BookingLookupResponse } from '@/features/entrance/api';

// UAT round 1: the Museum Manager's queue for the Cashier's
// flag-mismatch signal (POST /bookings/{id}/flag-mismatch/). A booking
// lands here the moment it's flagged, and drops off the moment she
// corrects it -- see GET /bookings?flagged=true's own docstring
// (apps.bookings.services.list_bookings_for_staff) for why no separate
// "reviewed" state is needed.
export default function AttendanceQueuePage() {
  const { t, locale } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getFlaggedBookings({ limit: 100 });
      setBookings(response.data);
    } catch (err: any) {
      setError(err.message || t('failed_to_load') || 'Failed to load flagged bookings.');
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleCorrected = (booking: Booking, corrected: BookingLookupResponse) => {
    // Corrected -- clears flaggedMismatchAt server-side, so it drops off
    // this queue. Remove it locally rather than re-fetching the whole
    // list, same "trust the response, don't round-trip" pattern
    // AttendanceEntryForm uses for check-in.
    setBookings((prev) => prev.filter((b) => b.id !== booking.id));
    setExpandedId(null);
    setToast({
      message:
        corrected.status === 'awaiting_payment'
          ? t('correction_needs_payment') ||
            "Category corrected. The visitor now owes the difference online before they can be checked in -- they'll see a Pay Now button on their own booking page."
          : t('correction_applied') || 'Category correction applied.',
      type: 'success',
    });
  };

  return (
    <PageContainer maxWidth="lg">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif font-semibold text-2xl text-stone-900">
            {t('nav_flagged_bookings') || 'Flagged Bookings'}
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {t('flagged_queue_description') ||
              'Bookings a Cashier flagged at the gate for a headcount or category mismatch. Correct one to clear it from this list.'}
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 inline ${isLoading ? 'animate-spin' : ''}`} />
          {t('refresh') || 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {!isLoading && bookings.length === 0 && !error && (
        <EmptyState
          icon={<Flag className="w-12 h-12" />}
          title={t('no_flagged_bookings') || 'No Flagged Bookings'}
          description={
            t('no_flagged_bookings_description') ||
            "Nothing waiting for review right now -- every flagged booking has been corrected."
          }
        />
      )}

      <div className="space-y-3">
        {bookings.map((booking) => {
          const displayName = booking.bookingType === 'group' ? booking.groupName : booking.visitorName;
          return (
            <Card key={booking.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums text-sm font-semibold text-stone-600">
                      #{booking.reference}
                    </span>
                    <StatusBadge status={booking.status} />
                  </div>
                  <h3 className="text-lg font-semibold text-stone-900 mt-1">{displayName}</h3>
                  <div className="text-sm text-stone-500 mt-0.5">
                    {t('visit_date') || 'Visit Date'}: {formatDate(booking.visitDate)} ·{' '}
                    {t('booked') || 'Booked'}: {booking.bookedQuantity}
                  </div>
                  {booking.flaggedMismatchNote && (
                    <div className="text-sm text-secondary-700 mt-2 italic">
                      &ldquo;{booking.flaggedMismatchNote}&rdquo;
                    </div>
                  )}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setExpandedId((prev) => (prev === booking.id ? null : booking.id))}
                >
                  {expandedId === booking.id
                    ? t('cancel') || 'Cancel'
                    : t('correct_category') || 'Fix category / headcount'}
                </Button>
              </div>

              {expandedId === booking.id && (
                <div className="mt-4 pt-4 border-t border-stone-200">
                  <CategoryCorrectionPanel
                    booking={booking as BookingLookupResponse}
                    onCancel={() => setExpandedId(null)}
                    onCorrected={(updated, partialError) => {
                      if (partialError) {
                        setToast({ message: partialError, type: 'error' });
                        return;
                      }
                      handleCorrected(booking, updated);
                    }}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
