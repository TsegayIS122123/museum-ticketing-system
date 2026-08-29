'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { PendingBooking } from '../api';

interface PendingSettlementTableProps {
  bookings: PendingBooking[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onTransfer?: () => void;
  isTransferring?: boolean;
}

export function PendingSettlementTable({
  bookings,
  isLoading = false,
  onRefresh,
  onTransfer,
  isTransferring = false,
}: PendingSettlementTableProps) {
  const { t, locale } = useTranslation();

  const totalAmount = bookings.reduce((sum, b) => sum + b.totalAmountEtb, 0);
  const totalBookings = bookings.length;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'am-ET', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-40 bg-stone-100 rounded" />
      </Card>
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon="🏦"
        title={t('nothing_to_settle') || 'Nothing to Settle'}
        description={t('nothing_to_settle_description') || 'All visited bookings have been settled. Come back when new visitors arrive.'}
      />
    );
  }

  const headers = [
    t('reference') || 'Reference',
    t('visitor') || 'Visitor',
    t('visit_date') || 'Visit Date',
    t('attended') || 'Attended',
    t('amount') || 'Amount',
    t('checked_in_at') || 'Checked In At',
  ];

  const rows = bookings.map((booking) => [
    <span key="ref" className="font-mono text-sm font-medium text-stone-600">
      #{booking.reference}
    </span>,
    <div key="visitor">
      <div className="font-medium text-stone-900">{booking.visitorName}</div>
      <div className="text-xs text-stone-400">
        {locale === 'en' ? booking.categoryNameEn : booking.categoryNameAm}
      </div>
    </div>,
    <div key="date" className="text-sm">{formatDate(booking.visitDate)}</div>,
    <div key="attended" className="font-semibold text-stone-900">
      {booking.attendedQuantity} / {booking.bookedQuantity}
    </div>,
    <div key="amount" className="font-bold text-amber-600">
      ETB {booking.totalAmountEtb}
    </div>,
    <div key="checkedin" className="text-sm text-stone-500">
      {formatDateTime(booking.checkedInAt)}
    </div>,
  ]);

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <Card className="bg-amber-50 border-amber-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-amber-700 uppercase tracking-wider">
                {t('total_bookings') || 'Total Bookings'}
              </div>
              <div className="font-bold text-xl text-amber-800">{totalBookings}</div>
            </div>
            <div>
              <div className="text-xs text-amber-700 uppercase tracking-wider">
                {t('total_amount') || 'Total Amount'}
              </div>
              <div className="font-bold text-xl text-amber-800 font-serif">
                ETB {totalAmount}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            {onRefresh && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRefresh}
                disabled={isTransferring}
              >
                🔄 {t('refresh') || 'Refresh'}
              </Button>
            )}
            {onTransfer && (
              <Button
                size="lg"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={onTransfer}
                disabled={isTransferring || bookings.length === 0}
              >
                {isTransferring ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
                    {t('processing') || 'Processing...'}
                  </>
                ) : (
                  `🏦 ${t('initiate_transfer') || 'Initiate Transfer'} →`
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        <Table headers={headers} rows={rows} />
      </Card>
    </div>
  );
}
