'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PageContainer } from '@/components/layout/PageContainer';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PendingSettlementTable } from '@/features/settlement/components/PendingSettlementTable';
import { TransferConfirmationCard } from '@/features/settlement/components/TransferConfirmationCard';
import { getPendingSettlement, createSettlementTransfer, type PendingBooking, type SettlementTransfer } from '@/features/settlement/api';

type ViewState = 'idle' | 'loading' | 'confirming' | 'processing' | 'complete';

export default function SettlementPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [state, setState] = useState<ViewState>('idle');
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [transfer, setTransfer] = useState<SettlementTransfer | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadPendingBookings = async () => {
    setState('loading');
    try {
      const data = await getPendingSettlement();
      setBookings(data);
      setState('idle');
    } catch (error: any) {
      setToast({
        message: error.message || t('failed_to_load') || 'Failed to load pending bookings.',
        type: 'error',
      });
      setState('idle');
    }
  };

  useEffect(() => {
    loadPendingBookings();
  }, []);

  const handleInitiateTransfer = async () => {
    setShowConfirm(false);
    setState('processing');

    try {
      const result = await createSettlementTransfer();
      setTransfer(result);
      setState('complete');
      setToast({
        message: t('transfer_success') || 'Settlement transfer completed successfully!',
        type: 'success',
      });
    } catch (error: any) {
      setToast({
        message: error.message || t('transfer_failed') || 'Failed to create settlement transfer.',
        type: 'error',
      });
      setState('idle');
    }
  };

  const handleDownloadReceipt = () => {
    if (transfer?.receiptUrl) {
      window.open(transfer.receiptUrl, '_blank');
    }
  };

  const handleDone = () => {
    setState('idle');
    setTransfer(null);
    loadPendingBookings();
  };

  const totalAmount = bookings.reduce((sum, b) => sum + b.totalAmountEtb, 0);

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
          {t('settlement_description') || 'Batch transfer visited booking revenue to the Finance Office'}
        </p>
        {user && (
          <div className="text-sm text-stone-400 mt-1">
            {t('cashier')}: {user.fullName || user.email} · {new Date().toLocaleDateString()}
          </div>
        )}
      </div>

      {state === 'complete' && transfer ? (
        <TransferConfirmationCard
          transfer={transfer}
          onDownloadReceipt={handleDownloadReceipt}
          onDone={handleDone}
        />
      ) : (
        <PendingSettlementTable
          bookings={bookings}
          isLoading={state === 'loading'}
          onRefresh={loadPendingBookings}
          onTransfer={() => setShowConfirm(true)}
          isTransferring={state === 'processing'}
        />
      )}

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleInitiateTransfer}
        title={t('initiate_transfer') || 'Initiate Settlement Transfer'}
        message={
          bookings.length === 0
            ? t('no_bookings_to_settle') || 'No bookings to settle. Please check in visitors first.'
            : t('transfer_confirmation_message') || 
              `You are about to transfer ${bookings.length} booking(s) totalling ETB ${totalAmount}. This action creates a Transfer Receipt for the Finance Office and cannot be undone.`
        }
        confirmLabel={t('confirm_transfer') || 'Confirm Transfer'}
        danger={false}
      />
    </PageContainer>
  );
}
