'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PageContainer } from '@/components/layout/PageContainer';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PendingSettlementTable } from '@/features/settlement/components/PendingSettlementTable';
import { TransferConfirmationCard } from '@/features/settlement/components/TransferConfirmationCard';
import {
  getMyOutstandingBalance,
  initiateReconciliation,
  type OutstandingBalance,
  type CashierReconciliation,
} from '@/features/settlement/api';

type ViewState = 'idle' | 'loading' | 'processing' | 'complete';

export default function SettlementPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [state, setState] = useState<ViewState>('idle');
  const [balance, setBalance] = useState<OutstandingBalance | null>(null);
  const [reconciliation, setReconciliation] = useState<CashierReconciliation | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadBalance = async () => {
    setState('loading');
    try {
      const data = await getMyOutstandingBalance();
      setBalance(data);
      setState('idle');
    } catch (error: any) {
      setToast({
        message: error.message || t('failed_to_load') || 'Failed to load your balance.',
        type: 'error',
      });
      setState('idle');
    }
  };

  useEffect(() => {
    loadBalance();
  }, []);

  const handleInitiateTransfer = async () => {
    setShowConfirm(false);
    setState('processing');

    try {
      // No parameters -- this locks and reconciles the cashier's whole
      // outstanding balance in one call, there's nothing to select.
      const result = await initiateReconciliation();
      setReconciliation(result);
      setState('complete');
      setToast({
        message: t('transfer_success') || 'Settlement reconciliation initiated successfully!',
        type: 'success',
      });
    } catch (error: any) {
      setToast({
        message: error.message || t('transfer_failed') || 'Failed to initiate reconciliation.',
        type: 'error',
      });
      setState('idle');
    }
  };

  const handleDone = () => {
    setState('idle');
    setReconciliation(null);
    loadBalance();
  };

  return (
    <PageContainer maxWidth="xl">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="font-serif text-3xl text-stone-900">
          {t('settlement') || 'Settlement'}
        </h1>
        <p className="text-stone-500 mt-1">
          {t('settlement_description') || 'Reconcile your outstanding digital revenue with the Finance Office'}
        </p>
        {user && (
          <div className="text-sm text-stone-400 mt-1">
            {t('cashier')}: {user.full_name || user.email} · {new Date().toLocaleDateString()}
          </div>
        )}
      </div>

      {state === 'complete' && reconciliation ? (
        <TransferConfirmationCard
          reconciliation={reconciliation}
          onDone={handleDone}
        />
      ) : (
        <PendingSettlementTable
          balance={balance}
          isLoading={state === 'loading'}
          onRefresh={loadBalance}
          onTransfer={() => setShowConfirm(true)}
          isTransferring={state === 'processing'}
        />
      )}

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleInitiateTransfer}
        title={t('initiate_transfer') || 'Initiate Settlement Reconciliation'}
        message={
          t('transfer_confirmation_message') ||
          `You are about to reconcile your full outstanding balance of ETB ${balance?.balanceEtb ?? '0.00'}. This action cannot be undone.`
        }
        confirmLabel={t('confirm_transfer') || 'Confirm'}
        danger={false}
      />
    </PageContainer>
  );
}
