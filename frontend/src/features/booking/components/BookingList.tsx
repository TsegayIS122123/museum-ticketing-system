'use client';

import { Ticket, RefreshCw, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { StatusBadge, type BookingStatus } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import Link from 'next/link';
import { parseLocalIsoDate } from '@/lib/utils/dates';

interface BookingListItem {
  id: string;
  reference: string;
  status: BookingStatus;
  visitDate: string;
  bookedQuantity: number;
  totalAmountEtb: number;
  // One entry per category on this booking -- a booking mixing
  // categories (e.g. one Adult plus two Student tickets bought
  // together) has more than one entry here.
  items: { categoryNameEn: string; categoryNameAm: string; quantity: number }[];
}

interface BookingListProps {
  bookings: BookingListItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function BookingList({ bookings, isLoading = false, onRefresh }: BookingListProps) {
  const { t, locale } = useTranslation();

  const formatDate = (dateStr: string) => {
    const date = parseLocalIsoDate(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-20 bg-stone-100 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="w-12 h-12" />}
        title={t('no_bookings') || 'No bookings yet'}
        description={t('no_bookings_description') || 'Book your first museum visit today!'}
        action={
          <Link href={`/${locale}/book`}>
            <Button className="bg-brand-primary hover:bg-primary-700">
              {t('book_now')}
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {onRefresh && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4" /> {t('refresh') || 'Refresh'}
          </Button>
        </div>
      )}

      {bookings.map((booking) => (
        <Link key={booking.id} href={`/${locale}/bookings/${booking.id}`}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary-600">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-medium text-stone-600">
                    #{booking.reference}
                  </span>
                  <StatusBadge status={booking.status} />
                </div>
                <div className="mt-1 flex flex-wrap gap-4 text-sm text-stone-500">
                  <span>
                    {t('date') || 'Date'}: {formatDate(booking.visitDate)}
                  </span>
                  <span>
                    {t('quantity')}: {booking.bookedQuantity}
                  </span>
                  <span className="font-medium text-primary-600">
                    ETB {booking.totalAmountEtb}
                  </span>
                </div>
                <div className="text-sm text-stone-500 mt-0.5">
                  {booking.items
                    .map((item) =>
                      `${locale === 'en' ? item.categoryNameEn : item.categoryNameAm} x${item.quantity}`
                    )
                    .join(', ')}
                </div>
              </div>
              <div className="w-full sm:w-auto border-t border-dashed border-stone-200 sm:border-t-0 sm:border-l-2 sm:border-l-stone-300 pt-3 sm:pt-0 sm:pl-4 shrink-0 flex justify-end">
                <Button variant="ghost" size="sm">
                  {t('view_details') || 'View Details'} <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
