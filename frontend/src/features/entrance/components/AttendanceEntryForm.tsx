'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { QRCodeSVG } from '@/components/ui/QRCodeSVG';
import { checkInBooking, type BookingLookupResponse } from '../api';

interface AttendanceEntryFormProps {
  booking: BookingLookupResponse;
  onCheckInComplete: () => void;
  onCancel: () => void;
}

export function AttendanceEntryForm({
  booking,
  onCheckInComplete,
  onCancel,
}: AttendanceEntryFormProps) {
  const { t, locale } = useTranslation();

  const [attendedQuantity, setAttendedQuantity] = useState<number>(booking.bookedQuantity);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isCheckedIn = booking.isCheckedIn || booking.status === 'visited';
  const isPending = booking.status === 'pending';
  const canCheckIn = isPending && !isCheckedIn;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleCheckIn = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    setError(null);

    try {
      const result = await checkInBooking(booking.id, attendedQuantity);
      
      const shortfall = booking.bookedQuantity - attendedQuantity;
      let message = t('check_in_success') || 'Check-in successful!';
      if (shortfall > 0) {
        message = t('partial_check_in') || `${attendedQuantity} of ${booking.bookedQuantity} checked in. ${shortfall} did not attend.`;
      }

      setToast({
        message,
        type: 'success',
      });

      setTimeout(() => {
        onCheckInComplete();
      }, 1500);
    } catch (err: any) {
      setError(err.message || t('check_in_failed') || 'Failed to check in. Please try again.');
      setToast({
        message: err.message || t('check_in_failed') || 'Failed to check in.',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (isNaN(value)) {
      setAttendedQuantity(0);
      return;
    }
    const clamped = Math.min(Math.max(value, 0), booking.bookedQuantity);
    setAttendedQuantity(clamped);
  };

  const shortfall = booking.bookedQuantity - attendedQuantity;

  // Already checked in
  if (isCheckedIn) {
    return (
      <Card className="bg-green-50 border-green-200">
        <div className="text-center py-4">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-semibold text-green-800">
            {t('already_checked_in') || 'Already Checked In'}
          </div>
          <div className="text-sm text-green-600 mt-1">
            {t('checked_in_at') || 'Checked in at'}: {booking.checkedInAt ? new Date(booking.checkedInAt).toLocaleString() : 'N/A'}
          </div>
          {booking.attendedQuantity !== null && (
            <div className="text-sm text-green-600">
              {t('attended')}: {booking.attendedQuantity} / {booking.bookedQuantity}
            </div>
          )}
          <Button
            variant="secondary"
            className="mt-4"
            onClick={onCancel}
          >
            {t('back') || 'Back'}
          </Button>
        </div>
      </Card>
    );
  }

  // Not pending or already processed
  if (!canCheckIn) {
    return (
      <Card className="bg-yellow-50 border-yellow-200">
        <div className="text-center py-4">
          <div className="text-3xl mb-2">⚠️</div>
          <div className="font-semibold text-yellow-800">
            {t('cannot_check_in') || 'Cannot Check In'}
          </div>
          <div className="text-sm text-yellow-600 mt-1">
            {booking.status === 'cancelled' && t('booking_cancelled') || 'Booking has been cancelled'}
            {booking.status === 'refunded' && t('booking_refunded') || 'Booking has been refunded'}
            {booking.status === 'awaiting_payment' && t('payment_pending') || 'Payment is still pending'}
            {booking.status === 'pending_approval' && t('awaiting_approval') || 'Awaiting group approval'}
          </div>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={onCancel}
          >
            {t('back') || 'Back'}
          </Button>
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

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Booking Details */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-stone-600">
                #{booking.reference}
              </span>
              <StatusBadge status={booking.status} />
            </div>
            <h3 className="text-xl font-semibold text-stone-900 mt-2">
              {booking.visitorName}
            </h3>
            <div className="text-sm text-stone-500 mt-1">
              {booking.visitorEmail} · {booking.visitorPhone}
            </div>
          </div>
          <div className="bg-white p-2 rounded-xl shadow-inner border border-stone-200">
            <QRCodeSVG
              value={booking.reference}
              size={80}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-stone-100 pt-4">
          <div>
            <div className="text-stone-500">{t('visit_date') || 'Visit Date'}</div>
            <div className="font-medium text-stone-900">{formatDate(booking.visitDate)}</div>
          </div>
          <div>
            <div className="text-stone-500">{t('category')}</div>
            <div className="font-medium text-stone-900">
              {locale === 'en' ? booking.categoryNameEn : booking.categoryNameAm}
            </div>
          </div>
          <div>
            <div className="text-stone-500">{t('booked') || 'Booked'}</div>
            <div className="font-bold text-lg text-amber-600">{booking.bookedQuantity}</div>
          </div>
          <div>
            <div className="text-stone-500">{t('total')}</div>
            <div className="font-medium text-stone-900">ETB {booking.totalAmountEtb}</div>
          </div>
        </div>
      </Card>

      {/* Attendance Entry */}
      <Card>
        <h4 className="font-semibold text-stone-900 mb-4">
          {t('record_attendance') || 'Record Attendance'}
        </h4>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-stone-700">
              {t('attended_quantity') || 'Attended Quantity'}
            </label>
            <div className="flex items-center gap-4 mt-1">
              <button
                type="button"
                onClick={() => setAttendedQuantity(Math.max(0, attendedQuantity - 1))}
                className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50"
                aria-label="Decrease attended count"
              >
                −
              </button>
              <input
                type="number"
                value={attendedQuantity}
                onChange={handleQuantityChange}
                min={0}
                max={booking.bookedQuantity}
                className="w-20 text-center px-2 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-lg font-semibold"
              />
              <button
                type="button"
                onClick={() => setAttendedQuantity(Math.min(booking.bookedQuantity, attendedQuantity + 1))}
                className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50"
                aria-label="Increase attended count"
              >
                +
              </button>
              <span className="text-sm text-stone-500">
                / {booking.bookedQuantity} {t('max') || 'max'}
              </span>
            </div>
          </div>

          {shortfall > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-amber-600">⚠️</span>
                <div>
                  <div className="text-sm font-medium text-amber-800">
                    {t('partial_attendance') || 'Partial Attendance'}
                  </div>
                  <div className="text-xs text-amber-700">
                    {shortfall} {t('visitors_did_not_attend') || 'visitors did not attend.'}
                    {t('refund_available_on_request') || 'Refund available on request.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onCancel}
              disabled={isProcessing}
            >
              {t('cancel') || 'Cancel'}
            </Button>
            <Button
              type="button"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowConfirm(true)}
              disabled={isProcessing || attendedQuantity === 0}
            >
              {isProcessing ? t('processing') || 'Processing...' : t('confirm_check_in') || 'Confirm Check-in'}
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleCheckIn}
        title={t('confirm_check_in') || 'Confirm Check-in'}
        message={
          shortfall === 0
            ? `${t('confirm_check_in_message') || 'Confirm check-in for'} ${booking.visitorName} (${attendedQuantity} ${t('visitors') || 'visitors'})?`
            : `${t('partial_check_in_confirmation') || 'Only'} ${attendedQuantity} ${t('out_of') || 'out of'} ${booking.bookedQuantity} ${t('visitors_attending') || 'visitors are attending'}. ${shortfall} ${t('will_not_attend') || 'will not attend'}. ${t('refund_available_on_request_confirm') || 'A refund for the shortfall is available on request.'}`
        }
        confirmLabel={t('confirm') || 'Confirm'}
      />
    </div>
  );
}
