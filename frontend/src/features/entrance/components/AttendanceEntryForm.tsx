'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { QRCodeSVG } from '@/components/ui/QRCodeSVG';
import { TextField } from '@/components/ui/TextField';
import { CategoryCorrectionPanel } from './CategoryCorrectionPanel';
import {
  checkInBooking,
  recordIfmisVoucherReference,
  type BookingLookupResponse,
  type CheckInResponse,
} from '../api';

interface AttendanceEntryFormProps {
  booking: BookingLookupResponse;
  onCheckInComplete: () => void;
  onCancel: () => void;
}

export function AttendanceEntryForm({
  booking: initialBooking,
  onCheckInComplete,
  onCancel,
}: AttendanceEntryFormProps) {
  const { t, locale } = useTranslation();

  // Local, not derived from a prop on every render: a category
  // correction (ID-verification addendum) changes this booking's
  // category/price/status server-side, and the response from that PATCH
  // is the fastest, most reliable way to reflect the new state -- no
  // extra round trip back through `lookupBooking`.
  const [booking, setBooking] = useState<BookingLookupResponse>(initialBooking);
  const [attendedQuantity, setAttendedQuantity] = useState<number>(booking.bookedQuantity);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Just-completed check-in, still on screen so the Cashier can key the
  // IFMIS voucher fields in below -- CheckInResponse (not the plain
  // Booking) is what carries payerName/amountFigures/amountWords/
  // ifmisPurpose.
  const [justCheckedIn, setJustCheckedIn] = useState<CheckInResponse | null>(null);
  const [voucherReference, setVoucherReference] = useState('');
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);
  const [voucherSaved, setVoucherSaved] = useState(false);

  // There is no separate "checked in" flag or timestamp in the API --
  // `status === 'visited'` IS the check-in signal (services.
  // check_in_booking transitions the booking straight to Visited).
  const isCheckedIn = booking.status === 'visited';
  const canCheckIn = booking.status === 'pending';

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

      setToast({ message, type: 'success' });
      setJustCheckedIn(result);
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

  const handleSaveVoucher = async () => {
    if (!justCheckedIn || !voucherReference.trim()) return;
    setIsSavingVoucher(true);
    try {
      await recordIfmisVoucherReference(justCheckedIn.id, voucherReference.trim());
      setVoucherSaved(true);
      setToast({
        message: t('voucher_saved') || 'IFMIS voucher reference saved.',
        type: 'success',
      });
      setTimeout(() => {
        onCheckInComplete();
      }, 1200);
    } catch (err: any) {
      setToast({
        message: err.message || t('voucher_save_failed') || 'Failed to save voucher reference.',
        type: 'error',
      });
    } finally {
      setIsSavingVoucher(false);
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

  // Just checked in this booking -- show the IFMIS voucher-prep step
  // (payer name / amount in figures & words / purpose string) and let
  // the Cashier key the real Document No/Ref No back in once she's
  // entered the transaction into IFMIS herself.
  if (justCheckedIn) {
    return (
      <Card className="bg-green-50 border-green-200">
        <div className="py-2">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">✅</div>
            <div className="font-semibold text-green-800">
              {t('check_in_success') || 'Check-in successful!'}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-green-200 p-4 text-sm space-y-2">
            <div className="font-semibold text-stone-900 mb-2">
              {t('ifmis_voucher_details') || 'IFMIS Voucher Details'}
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">{t('payer_name') || 'Payer Name'}</span>
              <span className="font-medium text-stone-900">{justCheckedIn.payerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">{t('amount_figures') || 'Amount (figures)'}</span>
              <span className="font-medium text-stone-900">ETB {justCheckedIn.amountFigures}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">{t('amount_words') || 'Amount (words)'}</span>
              <span className="font-medium text-stone-900 text-right">{justCheckedIn.amountWords}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">{t('purpose') || 'Purpose'}</span>
              <span className="font-medium text-stone-900 text-right">{justCheckedIn.ifmisPurpose}</span>
            </div>
          </div>

          {voucherSaved ? (
            <div className="mt-4 text-center text-sm font-medium text-green-800">
              ✓ {t('voucher_saved') || 'IFMIS voucher reference saved.'}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <TextField
                id="voucher-reference"
                label={t('ifmis_voucher_reference') || 'IFMIS Document No / Ref No'}
                placeholder={t('ifmis_voucher_placeholder') || 'Enter the reference IFMIS gave you'}
                value={voucherReference}
                onChange={(e) => setVoucherReference(e.target.value)}
              />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={onCheckInComplete}
                  disabled={isSavingVoucher}
                >
                  {t('do_later') || 'Do this later'}
                </Button>
                <Button
                  className="flex-1 bg-brand-primary hover:bg-primary-700"
                  onClick={handleSaveVoucher}
                  disabled={isSavingVoucher || !voucherReference.trim()}
                >
                  {isSavingVoucher ? t('saving') || 'Saving...' : t('save_voucher') || 'Save Reference'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </Card>
    );
  }

  // Already checked in on a previous visit to this page (not the
  // check-in this component itself just performed).
  if (isCheckedIn) {
    return (
      <Card className="bg-green-50 border-green-200">
        <div className="text-center py-4">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-semibold text-green-800">
            {t('already_checked_in') || 'Already Checked In'}
          </div>
          {booking.attendedQuantity !== null && (
            <div className="text-sm text-green-600 mt-1">
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
            {booking.status === 'cancelled' && (t('booking_cancelled') || 'Booking has been cancelled')}
            {booking.status === 'refunded' && (t('booking_refunded') || 'Booking has been refunded')}
            {booking.status === 'awaiting_payment' && (t('payment_pending') || 'Payment is still pending')}
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

  // Who the Cashier is looking at: the group's own name for a group
  // booking (no single "visitor" represents the whole party), otherwise
  // the individual Visitor's name/email/phone.
  const displayName = booking.bookingType === 'group' ? booking.groupName : booking.visitorName;
  const contactLine =
    booking.bookingType === 'group'
      ? booking.groupContactPhone
      : [booking.visitorEmail, booking.visitorPhone].filter(Boolean).join(' · ');

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
              {displayName}
            </h3>
            {contactLine && (
              <div className="text-sm text-stone-500 mt-1">
                {contactLine}
              </div>
            )}
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
            <div className="text-stone-500 flex items-center justify-between gap-2">
              <span>{t('category')}</span>
              {canCheckIn && (
                <button
                  type="button"
                  onClick={() => setShowCorrection((v) => !v)}
                  className="text-xs font-medium text-secondary-600 hover:text-secondary-700 underline"
                >
                  {t('correct_category') || 'Correct'}
                </button>
              )}
            </div>
            <div className="font-medium text-stone-900">
              {locale === 'en' ? booking.categoryNameEn : booking.categoryNameAm}
            </div>
          </div>
          <div>
            <div className="text-stone-500">{t('booked') || 'Booked'}</div>
            <div className="font-bold text-lg text-primary-600">{booking.bookedQuantity}</div>
          </div>
          <div>
            <div className="text-stone-500">{t('total')}</div>
            <div className="font-medium text-stone-900">ETB {booking.totalAmountEtb}</div>
          </div>
        </div>

        {showCorrection && (
          <CategoryCorrectionPanel
            booking={booking}
            onCancel={() => setShowCorrection(false)}
            onCorrected={(updated) => {
              setBooking(updated);
              setShowCorrection(false);
              setToast(
                updated.status === 'awaiting_payment'
                  ? {
                      message:
                        t('correction_needs_payment') ||
                        "Category corrected. The visitor now owes the difference online before they can be checked in -- they'll see a Pay Now button on their own booking page.",
                      type: 'success',
                    }
                  : {
                      message:
                        t('correction_refund_issued') ||
                        'Category corrected. The overcharge is being refunded automatically.',
                      type: 'success',
                    }
              );
            }}
          />
        )}
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
                className="w-20 text-center px-2 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500 text-lg font-semibold"
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
            <div className="p-3 bg-secondary-50 border border-secondary-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-secondary-600">⚠️</span>
                <div>
                  <div className="text-sm font-medium text-secondary-800">
                    {t('partial_attendance') || 'Partial Attendance'}
                  </div>
                  <div className="text-xs text-secondary-700">
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
              className="flex-1 bg-brand-primary hover:bg-primary-700"
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
            ? `${t('confirm_check_in_message') || 'Confirm check-in for'} ${displayName} (${attendedQuantity} ${t('visitors') || 'visitors'})?`
            : `${t('partial_check_in_confirmation') || 'Only'} ${attendedQuantity} ${t('out_of') || 'out of'} ${booking.bookedQuantity} ${t('visitors_attending') || 'visitors are attending'}. ${shortfall} ${t('will_not_attend') || 'will not attend'}. ${t('refund_available_on_request_confirm') || 'A refund for the shortfall is available on request.'}`
        }
        confirmLabel={t('confirm') || 'Confirm'}
      />
    </div>
  );
}
