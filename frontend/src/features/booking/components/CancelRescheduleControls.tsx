'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { cancelBooking, rescheduleBooking } from '@/features/booking/api';

interface CancelRescheduleControlsProps {
  bookingId: string;
  rescheduledCount: number;
  currentVisitDate: string;
  status: 'awaiting_payment' | 'pending_approval' | 'pending' | 'visited' | 'cancelled' | 'refunded';
  onActionComplete?: () => void;
}

export function CancelRescheduleControls({
  bookingId,
  rescheduledCount,
  currentVisitDate,
  status,
  onActionComplete,
}: CancelRescheduleControlsProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [newVisitDate, setNewVisitDate] = useState('');

  const isPending = status === 'pending';
  const canCancel = isPending;
  const canReschedule = isPending && rescheduledCount < 1;

  const handleCancel = async () => {
    setIsProcessing(true);
    try {
      await cancelBooking(bookingId);
      setToast({
        message: t('booking_cancelled') || 'Booking cancelled successfully. Refund will be processed.',
        type: 'success',
      });
      setIsCancelDialogOpen(false);
      if (onActionComplete) onActionComplete();
      router.refresh();
    } catch (error: any) {
      setToast({
        message: error.message || t('cancel_failed') || 'Failed to cancel booking.',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReschedule = async () => {
    if (!newVisitDate) {
      setToast({
        message: t('select_new_date') || 'Please select a new date.',
        type: 'error',
      });
      return;
    }

    setIsProcessing(true);
    try {
      await rescheduleBooking(bookingId, newVisitDate);
      setToast({
        message: t('booking_rescheduled') || 'Booking rescheduled successfully.',
        type: 'success',
      });
      setIsRescheduleModalOpen(false);
      setNewVisitDate('');
      if (onActionComplete) onActionComplete();
      router.refresh();
    } catch (error: any) {
      setToast({
        message: error.message || t('reschedule_failed') || 'Failed to reschedule booking.',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get min date (today)
  const today = new Date().toISOString().split('T')[0];

  if (!canCancel && !canReschedule) {
    return (
      <div className="text-sm text-stone-400">
        {status === 'visited' && (t('already_visited') || 'This booking has already been visited.')}
        {status === 'cancelled' && (t('already_cancelled') || 'This booking has been cancelled.')}
        {status === 'refunded' && (t('already_refunded') || 'This booking has been refunded.')}
        {status === 'awaiting_payment' && (t('awaiting_payment_message') || 'Payment is still pending.')}
        {status === 'pending_approval' && (t('pending_approval_message') || 'Waiting for group approval.')}
        {rescheduledCount >= 1 && (t('max_reschedule_reached') || 'This booking has already been rescheduled once.')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex flex-wrap gap-3">
        {canReschedule && (
          <Button
            variant="secondary"
            onClick={() => setIsRescheduleModalOpen(true)}
            disabled={isProcessing}
          >
            📅 {t('reschedule') || 'Reschedule'}
            {rescheduledCount >= 1 && ' (max 1)'}
          </Button>
        )}

        {canCancel && (
          <Button
            variant="danger"
            onClick={() => setIsCancelDialogOpen(true)}
            disabled={isProcessing}
          >
            ✕ {t('cancel') || 'Cancel Booking'}
          </Button>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        onConfirm={handleCancel}
        title={t('cancel_booking') || 'Cancel Booking'}
        message={t('cancel_confirmation') || 'Are you sure you want to cancel this booking? A full refund will be processed.'}
        confirmLabel={t('cancel') || 'Cancel Booking'}
        danger
      />

      {/* Reschedule Modal */}
      <Modal
        open={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        title={t('reschedule_booking') || 'Reschedule Booking'}
      >
        <div className="space-y-4">
          <div className="bg-stone-50 rounded-lg p-3 text-sm">
            <div className="text-stone-500">{t('current_date') || 'Current Date'}</div>
            <div className="font-semibold text-stone-900">{formatDate(currentVisitDate)}</div>
          </div>

          <div>
            <label className="text-sm font-medium text-stone-700">
              {t('new_date') || 'New Date'}
            </label>
            <input
              type="date"
              value={newVisitDate}
              onChange={(e) => setNewVisitDate(e.target.value)}
              min={today}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500"
            />
            <p className="text-xs text-stone-400 mt-1">
              {t('reschedule_note') || 'You can only reschedule once. Please choose a new available date.'}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsRescheduleModalOpen(false)}
              disabled={isProcessing}
            >
              {t('cancel') || 'Cancel'}
            </Button>
            <Button
              className="flex-1 bg-primary-600 hover:bg-primary-700"
              onClick={handleReschedule}
              disabled={isProcessing || !newVisitDate}
            >
              {isProcessing ? t('processing') || 'Processing...' : t('confirm') || 'Confirm'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
