'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Check, Flag } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { TextField } from '@/components/ui/TextField';
import {
  checkInBooking,
  flagBookingMismatch,
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

  // Local, not derived from a prop on every render: flagging a mismatch
  // (UAT round 1) changes this booking's `flaggedMismatchAt` server-side,
  // and the response from that POST is the fastest, most reliable way to
  // reflect the new state -- no extra round trip back through
  // `lookupBooking`.
  const [booking, setBooking] = useState<BookingLookupResponse>(initialBooking);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagNote, setFlagNote] = useState('');
  const [isFlagging, setIsFlagging] = useState(false);
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
  // UAT round 1: a still-Pending booking with an open mismatch flag is a
  // third state, distinct from both "checkable" and "not checkable" --
  // it's Pending (the plain status check would pass) but blocked until a
  // Museum Manager corrects it, so it's checked separately.
  const isFlagged = booking.flaggedMismatchAt !== null;
  const canCheckIn = booking.status === 'pending' && !isFlagged;

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
      const result = await checkInBooking(booking.id);
      setToast({ message: t('check_in_success') || 'Check-in successful!', type: 'success' });
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

  const handleFlagMismatch = async () => {
    setIsFlagging(true);
    setError(null);

    try {
      const updated = await flagBookingMismatch(booking.id, flagNote.trim() || undefined);
      setBooking(updated);
      setShowFlagForm(false);
      setToast({
        message:
          t('mismatch_flagged') ||
          "Flagged for the Museum Manager. This booking can't be checked in until she corrects it.",
        type: 'success',
      });
    } catch (err: any) {
      setToast({
        message: err.message || t('flag_mismatch_failed') || 'Failed to flag this booking.',
        type: 'error',
      });
    } finally {
      setIsFlagging(false);
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

  // Just checked in this booking -- show the IFMIS voucher-prep step
  // (payer name / amount in figures & words / purpose string) and let
  // the Cashier key the real Document No/Ref No back in once she's
  // entered the transaction into IFMIS herself.
  if (justCheckedIn) {
    return (
      <Card className="bg-green-50 border-green-200">
        <div className="py-2">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2 flex justify-center text-green-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
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
            {/* Only present for a group booking's institutional payer --
                CheckInResponseSerializer.get_payerTin returns null for
                an individual Visitor, who has no TIN on file. */}
            {justCheckedIn.payerTin && (
              <div className="flex justify-between">
                <span className="text-stone-500">{t('payer_tin') || 'Payer TIN'}</span>
                <span className="font-medium text-stone-900">{justCheckedIn.payerTin}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-stone-500">{t('amount_figures') || 'Amount (figures)'}</span>
              <span className="font-medium font-mono tabular-nums text-stone-900">ETB {justCheckedIn.amountFigures}</span>
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
            <div className="mt-4 text-center text-sm font-medium text-green-800 flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" /> {t('voucher_saved') || 'IFMIS voucher reference saved.'}
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
          <div className="text-3xl mb-2 flex justify-center text-green-600">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="font-semibold text-green-800">
            {t('already_checked_in') || 'Already Checked In'}
          </div>
          {booking.attendedQuantity !== null && (
            <div className="text-sm text-green-600 mt-1 font-mono tabular-nums">
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

  // UAT round 1: flagged and still awaiting a Museum Manager correction.
  // Distinct from the "cannot check in" block below -- the booking IS
  // still Pending, it's just blocked by the open flag, not by its own
  // status.
  if (isFlagged) {
    return (
      <Card className="bg-secondary-50 border-secondary-200">
        <div className="text-center py-4">
          <div className="text-3xl mb-2 flex justify-center text-secondary-600">
            <Flag className="w-8 h-8" />
          </div>
          <div className="font-semibold text-secondary-800">
            {t('flagged_for_manager') || 'Flagged for Manager Review'}
          </div>
          <div className="text-sm text-secondary-700 mt-1 max-w-sm mx-auto">
            {t('flagged_for_manager_description') ||
              "This booking can't be checked in until a Museum Manager corrects the mismatch."}
          </div>
          {booking.flaggedMismatchNote && (
            <div className="text-xs text-secondary-600 mt-2 italic">
              &ldquo;{booking.flaggedMismatchNote}&rdquo;
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
  if (booking.status !== 'pending') {
    return (
      <Card className="bg-yellow-50 border-yellow-200">
        <div className="text-center py-4">
          <div className="text-3xl mb-2 flex justify-center text-yellow-600">
            <AlertTriangle className="w-8 h-8" />
          </div>
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
    <div className="space-y-4">
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

      <Card>
        {/* Booking details */}
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono tabular-nums text-sm font-semibold text-stone-600">
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
          {/* The institutional payer's TIN -- alongside groupName/
              groupContactPhone above, for the same IFMIS receipt
              voucher reconciliation (e.g. "Received From: BS School
              Group, Tin 0000900158"). Group bookings only; an
              individual Visitor has no TIN on file. */}
          {booking.bookingType === 'group' && booking.groupTin && (
            <div className="text-sm text-stone-500 mt-0.5">
              {(t('tin') || 'TIN')}: {booking.groupTin}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-stone-100 pt-4">
          <div>
            <div className="text-stone-500">{t('visit_date') || 'Visit Date'}</div>
            <div className="font-medium text-stone-900">{formatDate(booking.visitDate)}</div>
          </div>
          <div>
            <div className="text-stone-500">{t('category')}</div>
            <div className="font-medium text-stone-900">
              {booking.items
                .map((item) =>
                  `${locale === 'en' ? item.categoryNameEn : item.categoryNameAm} x${item.quantity}`
                )
                .join(', ')}
            </div>
          </div>
          <div>
            <div className="text-stone-500">{t('booked') || 'Booked'}</div>
            <div className="font-bold font-mono tabular-nums text-lg text-primary-600">{booking.bookedQuantity}</div>
          </div>
          <div>
            <div className="text-stone-500">{t('total')}</div>
            <div className="font-medium font-mono tabular-nums text-stone-900">ETB {booking.totalAmountEtb}</div>
          </div>
        </div>

        {/* UAT round 1: no more per-category attendance counters here --
            the Cashier's whole job at the gate is one decision: does the
            party in front of her match what's booked? Check in if it
            does; flag it for the Museum Manager if it doesn't. She has
            no means to fix a mismatch herself any more (that moved to
            the Manager's own queue). */}
        <div className="mt-4 pt-4 border-t border-stone-200">
          {showFlagForm ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-stone-900">
                {t('flag_mismatch') || 'Flag for Manager Review'}
              </h4>
              <p className="text-xs text-stone-500">
                {t('flag_mismatch_description') ||
                  "Leave a quick note for the Manager (e.g. \"booked 3 Students, only 2 showed\"). No numbers change here -- she'll make the correction."}
              </p>
              <textarea
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder={t('flag_note_placeholder') || 'Optional note...'}
                rows={2}
                maxLength={1000}
                className="w-full text-sm rounded-lg border border-stone-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-secondary-500"
              />
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowFlagForm(false)}
                  disabled={isFlagging}
                >
                  {t('cancel') || 'Cancel'}
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-secondary-600 hover:bg-secondary-700"
                  onClick={handleFlagMismatch}
                  disabled={isFlagging}
                >
                  {isFlagging ? t('processing') || 'Processing...' : t('submit_flag') || 'Submit Flag'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setShowFlagForm(true)}
                disabled={isProcessing || !canCheckIn}
              >
                <Flag className="w-4 h-4 mr-1.5 inline" />
                {t('flag_mismatch') || "Doesn't Match"}
              </Button>
              <Button
                type="button"
                className="flex-1 bg-brand-primary hover:bg-primary-700"
                onClick={() => setShowConfirm(true)}
                disabled={isProcessing || !canCheckIn}
              >
                {isProcessing ? t('processing') || 'Processing...' : t('confirm_check_in') || 'Confirm Check-in'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleCheckIn}
        title={t('confirm_check_in') || 'Confirm Check-in'}
        message={`${t('confirm_check_in_message') || 'Confirm check-in for'} ${displayName} (${booking.bookedQuantity} ${t('visitors') || 'visitors'})?`}
        confirmLabel={t('confirm') || 'Confirm'}
      />
    </div>
  );
}
