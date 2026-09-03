'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { decideGroupBooking, type Booking } from '../api';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';

interface ApprovalDecisionPanelProps {
  request: Booking;
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

  // categoryId on Booking isn't a name -- look it up against the real
  // category list to show something readable.
  const [category, setCategory] = useState<Category | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((categories) => {
        if (!cancelled) setCategory(categories.find((c) => c.id === request.categoryId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setCategory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [request.categoryId]);

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

  // Real backend model: a decided request has approvalStatus
  // 'approved'/'declined' -- there is no declinedReason/approvedAt/
  // approvedBy field on Booking at all (the decline note sent in the
  // approval call isn't echoed back anywhere), so we can't show who
  // decided it or why past the moment of deciding.
  if (request.approvalStatus !== null) {
    return (
      <Card>
        <div className="text-center py-4">
          <div className="text-2xl mb-2">
            {request.approvalStatus === 'approved' ? '✅' : '❌'}
          </div>
          <div className="font-semibold text-stone-900">
            {request.approvalStatus === 'approved'
              ? t('request_approved') || 'Request Approved'
              : t('request_declined') || 'Request Declined'}
          </div>
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
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs text-stone-500">
            {t('group_contact_unavailable') ||
              "No contact name, phone, or email is stored on the booking itself. Reaching the requester requires a separate visitor lookup, which isn't available yet."}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-stone-500">{t('reference') || 'Reference'}</div>
            <div className="font-mono font-medium text-stone-900">{request.reference}</div>
            <div className="text-stone-500">{t('group_name') || 'Group'}</div>
            <div className="font-medium text-stone-900">{request.groupName || '—'}</div>
            <div className="text-stone-500">{t('visit_date') || 'Visit Date'}</div>
            <div className="font-medium text-stone-900">{formatDate(request.visitDate)}</div>
            <div className="text-stone-500">{t('group_size') || 'Group Size'}</div>
            <div className="font-bold text-primary-600">{request.bookedQuantity}</div>
            <div className="text-stone-500">{t('category')}</div>
            <div className="font-medium text-stone-900">
              {category ? (locale === 'en' ? category.name_en : category.name_am) : '…'}
            </div>
            <div className="text-stone-500">{t('total_amount') || 'Total'}</div>
            <div className="font-medium text-stone-900">ETB {request.totalAmountEtb}</div>
          </div>

          <div className="mt-3 pt-3 border-t border-stone-100">
            <div className="text-stone-500">{t('submitted') || 'Submitted'}</div>
            <div className="text-stone-700 text-sm">
              {new Date(request.createdAt).toLocaleString()}
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
              className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500"
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
              className="flex-1 bg-brand-primary hover:bg-primary-700"
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
