'use client';

import { RefreshCw, Landmark, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { OutstandingBalance } from '../api';

interface PendingSettlementTableProps {
  balance: OutstandingBalance | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  onTransfer?: () => void;
  isTransferring?: boolean;
}

// Renamed in spirit but not on disk (to avoid churning every import) --
// this used to render a per-booking table with a batch-transfer button.
// That has no backing endpoint at all: GET /settlement/my-balance/
// returns only a single aggregate balanceEtb, never a list of the
// bookings/refunds that make it up, and POST /settlement/reconcile/
// takes no parameters -- there is nothing to select. If a real
// itemized breakdown is wanted, that needs a new backend endpoint;
// this can only show the total and a single "reconcile now" action.
export function PendingSettlementTable({
  balance,
  isLoading = false,
  onRefresh,
  onTransfer,
  isTransferring = false,
}: PendingSettlementTableProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-32 bg-stone-100 rounded" />
      </Card>
    );
  }

  const amount = balance ? parseFloat(balance.balanceEtb) : 0;

  return (
    <Card className="bg-secondary-50 border-secondary-200">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-secondary-700 uppercase tracking-wider">
            {t('outstanding_balance') || 'Your Outstanding Balance'}
          </div>
          <div className="text-3xl text-secondary-800 font-serif font-semibold font-mono tabular-nums">
            ETB {balance?.balanceEtb ?? '0.00'}
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
              <RefreshCw className="w-4 h-4" /> {t('refresh') || 'Refresh'}
            </Button>
          )}
          {onTransfer && (
            <Button
              size="lg"
              className="bg-brand-primary hover:bg-primary-700"
              onClick={onTransfer}
              disabled={isTransferring || amount <= 0}
            >
              {isTransferring ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
                  {t('processing') || 'Processing...'}
                </>
              ) : (
                <>
                  <Landmark className="w-4 h-4" /> {t('initiate_transfer') || 'Reconcile Now'} <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {amount <= 0 && (
        <p className="mt-3 text-sm text-secondary-700">
          {t('nothing_to_settle') || 'Nothing to settle right now.'}
        </p>
      )}
    </Card>
  );
}
