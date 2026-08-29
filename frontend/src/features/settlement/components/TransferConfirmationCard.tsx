'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { SettlementTransfer } from '../api';

interface TransferConfirmationCardProps {
  transfer: SettlementTransfer;
  onDownloadReceipt: () => void;
  onDone: () => void;
}

export function TransferConfirmationCard({
  transfer,
  onDownloadReceipt,
  onDone,
}: TransferConfirmationCardProps) {
  const { t, locale } = useTranslation();

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'am-ET', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="border-green-200 bg-green-50/50">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl">
          ✅
        </div>
        <h2 className="font-serif text-2xl text-stone-900">
          {t('transfer_complete') || 'Transfer Complete!'}
        </h2>
        <p className="text-stone-500 text-sm mt-1">
          {t('transfer_complete_description') || 'The digital revenue has been batched for settlement.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border-t border-green-200 pt-4">
        <div>
          <div className="text-stone-500">{t('reference') || 'Reference'}</div>
          <div className="font-mono font-medium text-stone-900">
            {transfer.referenceNumber}
          </div>
        </div>
        <div>
          <div className="text-stone-500">{t('amount') || 'Amount'}</div>
          <div className="font-bold text-xl text-amber-600 font-serif">
            ETB {transfer.amountEtb}
          </div>
        </div>
        <div>
          <div className="text-stone-500">{t('bookings') || 'Bookings'}</div>
          <div className="font-medium text-stone-900">
            {transfer.bookingIds.length} {t('bookings_settled') || 'bookings settled'}
          </div>
        </div>
        <div>
          <div className="text-stone-500">{t('status') || 'Status'}</div>
          <StatusBadge status="visited" />
        </div>
        <div className="col-span-2">
          <div className="text-stone-500">{t('initiated_by') || 'Initiated By'}</div>
          <div className="font-medium text-stone-900">
            {transfer.initiatedByName} · {formatDateTime(transfer.createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button
          className="flex-1 bg-amber-600 hover:bg-amber-700"
          onClick={onDownloadReceipt}
        >
          📄 {t('download_receipt') || 'Download Transfer Receipt'}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onDone}
        >
          {t('done') || 'Done'}
        </Button>
      </div>

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
        <span className="font-semibold">📌 {t('cashier_note') || 'Cashier Note'}</span>
        <p className="mt-1">
          {t('transfer_receipt_instruction') || 'Print or download this receipt and carry it physically to the Finance Office, alongside the existing manual-track cash deposit slip.'}
        </p>
      </div>
    </Card>
  );
}
