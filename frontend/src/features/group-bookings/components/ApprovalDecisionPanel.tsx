'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { decideGroupBooking, type GroupBookingRequest } from '../api';

interface ApprovalDecisionPanelProps {
  request: GroupBookingRequest;
  onDecisionComplete?: () => void;
}

export function ApprovalDecisionPanel({
  request,
  onDecisionComplete,
}: ApprovalDecisionPanelProps) {
  const { t, locale } = useTranslation();

  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    decision: 'approve' | 'decline';
  }>({ open: false, decision: 'approve' });

  const [declineNote, setDeclineNote] = useState('');

  const handleDecision = async (decision: 'approve' | 'decline') => {
    if (decision === 'decline' && !declineNote.trim()) {
      setToast({
        message: t('decline_reason_required') || 'Please provide a reason for declining.',
        type: 'error',
      });
      return;
    }

    setIsProcessing(true);
    try {
      await decideGroupBooking({
        bookingId: request.id,
        decision,
        note: decision === 'decline' ? declineNote : undefined,
      });

      setToast({
        message: decision === 'approve'
          ? t('group_booking_approved') || 'Group booking approved successfully.'
          : t('group_booking_declined') || 'Group booking declined.',
        type: 'success',
      });

      setConfirmDialog({ open: false, decision: 'approve' });
      setDeclineNote('');

      if (onDecisionComplete) {
        onDecisionComplete();
      }
    } catch (error: any) {
      setToast({
        message: error.message || t('decision_failed') || 'Failed to process decision.',
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

  if (request.status !== 'pending') {
    return (
      <Card>
        <div className="text-center py-4">
          <div className="text-2xl mb-2">
            {request.status === 'approved' ? '✅' : '❌'}
          </div>
          <div className="font-semibold text-stone-900">
            {request.status === 'approved'
              ? t('request_approved') || 'Request Approved'
              : t('request_declined') || 'Request Declined'}
          </div>
          {request.declinedReason && (
            <div className="mt-2 text-sm text-stone-500">
              {t('reason') || 'Reason'}: {request.declinedReason}
            </div>
          )}
          {request.approvedAt && (
            <div className="text-xs text-stone-400 mt-1">
              {request.approvedBy && `${request.approvedBy} · `}
              {new Date(request.approvedAt).toLocaleString()}
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <Card>
        <h3 className="text-lg font-semibold text-stone-900 mb-4">
          {t('request_details') || 'Request Details'}
        </h3>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-stone-500">{t('organization') || 'Organization'}</div>
            <div className="font-medium text-stone-900">{request.organizationName}</div>
            <div className="text-stone-500">{t('contact') || 'Contact'}</div>
            <div className="font-medium text-stone-900">{request.contactPerson}</div>
            <div className="text-stone-500">{t('phone')}</div>
            <div className="font-medium text-stone-900">{request.contactPhone}</div>
            <div className="text-stone-500">{t('email')}</div>
            <div className="font-medium text-stone-900">{request.contactEmail}</div>
            <div className="text-stone-500">{t('visit_date') || 'Visit Date'}</div>
            <div className="font-medium text-stone-900">
              {formatDate(request.visitDate)} at {request.visitTime}
            </div>
            <div className="text-stone-500">{t('group_size') || 'Group Size'}</div>
            <div className="font-bold text-amber-600">{request.groupSize}</div>
            <div className="text-stone-500">{t('category')}</div>
            <div className="font-medium text-stone-900">
              {t(request.category) || request.category}
            </div>
          </div>

          {request.specialRequests && (
            <div className="mt-3 pt-3 border-t border-stone-100">
              <div className="text-stone-500">{t('special_requests') || 'Special Requests'}</div>
              <div className="text-stone-700 mt-1">{request.specialRequests}</div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-stone-100">
            <div className="text-stone-500">{t('submitted') || 'Submitted'}</div>
            <div className="text-stone-700 text-sm">
              {new Date(request.submittedAt).toLocaleString()}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-stone-900 mb-4">
          {t('decision') || 'Decision'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-stone-700">
              {t('decline_reason') || 'Reason for Declining (required if declining)'}
            </label>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={3}
              placeholder={t('decline_reason_placeholder') || 'Please explain why this request is being declined...'}
            />
          </div>

          <div className="flex gap-4">
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => setConfirmDialog({ open: true, decision: 'decline' })}
              disabled={isProcessing}
            >
              ✕ {t('decline') || 'Decline'}
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setConfirmDialog({ open: true, decision: 'approve' })}
              disabled={isProcessing}
            >
              ✓ {t('approve') || 'Approve'}
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, decision: 'approve' })}
        onConfirm={() => handleDecision(confirmDialog.decision)}
        title={confirmDialog.decision === 'approve'
          ? t('approve_booking') || 'Approve Group Booking'
          : t('decline_booking') || 'Decline Group Booking'}
        message={confirmDialog.decision === 'approve'
          ? t('approve_confirmation') || 'Are you sure you want to approve this group booking? The group leader will be notified and can proceed to payment.'
          : t('decline_confirmation') || 'Are you sure you want to decline this group booking? The group leader will be notified.'}
        confirmLabel={confirmDialog.decision === 'approve'
          ? t('approve') || 'Approve'
          : t('decline') || 'Decline'}
        danger={confirmDialog.decision === 'decline'}
      />
    </div>
  );
}
