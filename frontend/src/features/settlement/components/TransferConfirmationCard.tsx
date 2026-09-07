'use client';

import { CheckCircle2, AlertTriangle, Clock, FileDown } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { downloadReceipt } from '@/lib/utils/download';
import type { CashierReconciliation } from '../api';

interface TransferConfirmationCardProps {
  reconciliation: CashierReconciliation;
  onDone: () => void;
}

// Matches the real CashierReconciliation shape (contracts/openapi.yaml):
// no bookingIds list, no initiatedByName -- a reconciliation is a single
// cashier's own aggregate balance, not a list of settled bookings.
export function TransferConfirmationCard({
  reconciliation,
  onDone,
}: TransferConfirmationCardProps) {
  const { t, locale } = useTranslation();

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'am-ET', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isCompleted = reconciliation.status === 'completed';
  const isFailed = reconciliation.status === 'failed';

  return (
    <Card
      className={
        isCompleted
          ? 'border-green-200 bg-green-50/50'
          : isFailed
          ? 'border-red-200 bg-red-50/50'
          : 'border-secondary-200 bg-secondary-50/50'
      }
    >
      <div className="text-center mb-6">
        <div
          className={
            'w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 ' +
            (isCompleted ? 'text-green-600' : isFailed ? 'text-red-600' : 'text-secondary-600')
          }
        >
          {isCompleted ? (
            <CheckCircle2 className="w-8 h-8" />
          ) : isFailed ? (
            <AlertTriangle className="w-8 h-8" />
          ) : (
            <Clock className="w-8 h-8" />
          )}
        </div>
        <h2 className="font-serif font-semibold text-2xl text-stone-900">
          {isCompleted
            ? t('transfer_complete') || 'Transfer Complete!'
            : isFailed
            ? t('transfer_failed') || 'Transfer Failed'
            : t('transfer_pending') || 'Transfer Initiated'}
        </h2>
        {isFailed && reconciliation.failureReason && (
          <p className="text-red-600 text-sm mt-1">{reconciliation.failureReason}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border-t border-stone-200 pt-4">
        <div>
          <div className="text-stone-500">{t('reference') || 'Reference'}</div>
          <div className="font-mono font-medium text-stone-900">
            {reconciliation.chapaTransferReference || '—'}
          </div>
        </div>
        <div>
          <div className="text-stone-500">{t('amount') || 'Amount'}</div>
          <div className="text-xl text-primary-600 font-serif font-semibold font-mono tabular-nums">
            ETB {reconciliation.amountEtb}
          </div>
        </div>
        <div>
          <div className="text-stone-500">{t('status') || 'Status'}</div>
          <StatusBadge status={isCompleted ? 'visited' : isFailed ? 'cancelled' : 'pending'} />
        </div>
        <div>
          <div className="text-stone-500">{t('initiated') || 'Initiated'}</div>
          <div className="font-medium text-stone-900">{formatDateTime(reconciliation.initiatedAt)}</div>
        </div>
        {isCompleted && (
          <div className="col-span-2">
            <div className="text-stone-500">{t('completed') || 'Completed'}</div>
            <div className="font-medium text-stone-900">{formatDateTime(reconciliation.completedAt)}</div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        {reconciliation.transferReceiptUrl && (
          <Button
            className="flex-1 bg-brand-primary hover:bg-primary-700"
            onClick={() =>
              downloadReceipt(
                `/settlement/reconciliations/${reconciliation.id}/transfer-receipt/download`,
                reconciliation.transferReceiptUrl!,
                `transfer-receipt-${reconciliation.chapaTransferReference || reconciliation.id}.pdf`
              )
            }
          >
            <FileDown className="w-4 h-4" /> {t('download_receipt') || 'Download Transfer Receipt'}
          </Button>
        )}
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onDone}
        >
          {t('done') || 'Done'}
        </Button>
      </div>
    </Card>
  );
}
