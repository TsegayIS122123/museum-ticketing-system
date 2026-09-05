'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { StatusBadge, type BookingStatus } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { format } from 'date-fns';

interface BookingDetailCardProps {
  booking: {
    id: string;
    reference: string;
    status: BookingStatus;
    visitDate: string;
    bookedQuantity: number;
    attendedQuantity?: number | null;
    totalAmountEtb: number;
    // One entry per category on this booking -- a booking mixing
    // categories (e.g. one Adult plus two Student tickets bought
    // together) has more than one entry here.
    items: { categoryNameEn: string; categoryNameAm: string; quantity: number }[];
    rescheduledCount: number;
    receiptUrl?: string | null;
    createdAt: string;
  };
  onCancel?: () => void;
  onReschedule?: () => void;
  onRefund?: () => void;
  onViewReceipt?: () => void;
}

export function BookingDetailCard({
  booking,
  onCancel,
  onReschedule,
  onRefund,
  onViewReceipt,
}: BookingDetailCardProps) {
  const { t, locale } = useTranslation();
  const isPending = booking.status === 'pending';
  const canCancelOrReschedule = isPending;
  const hasShortfall =
    booking.attendedQuantity != null && booking.attendedQuantity < booking.bookedQuantity;

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'PPP', {
      locale: locale === 'en' ? undefined : require('date-fns/locale/am'),
    });
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-stone-900">
            {t('booking')} #{booking.reference}
          </h3>
          <p className="text-sm text-stone-500 mt-0.5">
            {formatDate(booking.visitDate)}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      {/* Details Grid */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-stone-500">{t('category')}</p>
          <p className="font-medium text-stone-900">
            {booking.items
              .map((item) =>
                `${locale === 'en' ? item.categoryNameEn : item.categoryNameAm} x${item.quantity}`
              )
              .join(', ')}
          </p>
        </div>
        <div>
          <p className="text-stone-500">{t('quantity')}</p>
          <p className="font-medium text-stone-900">{booking.bookedQuantity}</p>
        </div>
        {booking.attendedQuantity !== null && booking.attendedQuantity !== undefined && (
          <div>
            <p className="text-stone-500">{t('attended')}</p>
            <p className="font-medium text-stone-900">{booking.attendedQuantity}</p>
          </div>
        )}
        <div>
          <p className="text-stone-500">{t('total')}</p>
          <p className="font-bold text-lg text-primary-600 font-serif">
            ETB {booking.totalAmountEtb}
          </p>
        </div>
      </div>

      {/* Shortfall Notice */}
      {hasShortfall && (
        <div className="mt-4 p-3 bg-secondary-50 border border-secondary-200 rounded-lg">
          <p className="text-sm text-secondary-700">
            {booking.bookedQuantity - booking.attendedQuantity!} of {booking.bookedQuantity} did not attend.
            {onRefund && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 text-secondary-700 hover:text-secondary-900"
                onClick={onRefund}
              >
                {t('request_refund') || 'Request Refund'}
              </Button>
            )}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 pt-4 border-t border-stone-100 flex flex-wrap gap-2">
        {canCancelOrReschedule && (
          <>
            {onReschedule && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onReschedule}
                disabled={booking.rescheduledCount >= 1}
                title={booking.rescheduledCount >= 1 ? 'Already rescheduled once' : ''}
              >
                {t('reschedule') || 'Reschedule'}
                {booking.rescheduledCount >= 1 && ' (max 1)'}
              </Button>
            )}
            {onCancel && (
              <Button
                variant="danger"
                size="sm"
                onClick={onCancel}
              >
                {t('cancel') || 'Cancel'}
              </Button>
            )}
          </>
        )}

        {booking.receiptUrl && onViewReceipt && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onViewReceipt}
          >
            📄 {t('download_receipt')}
          </Button>
        )}
      </div>
    </Card>
  );
}
