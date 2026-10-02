'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Check, Flag, Copy } from 'lucide-react';
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
  getIfmisVoucher,
  recordIfmisVoucher,
  type BookingLookupResponse,
  type CheckInResponse,
  type Voucher,
} from '../api';
import { parseLocalIsoDate } from '@/lib/utils/dates';

// A row of the voucher panel below: the label/value IFMIS itself prints,
// plus a one-tap copy so the Cashier doesn't have to hand-retype every
// field into IFMIS's own form. Purely a UI convenience -- copying
// (or not) never changes what gets recorded; only the Document No/Ref
// No inputs further down do that.
function VoucherRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, non-HTTPS context) --
      // the value is still visible on screen to copy by hand, so this
      // is a silent no-op, not an error worth interrupting her with.
    }
  };
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-stone-500 flex-shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 text-right">
        <span className="font-medium text-stone-900">{value}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-stone-500 hover:text-stone-700 flex-shrink-0"
          aria-label="Copy"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </span>
    </div>
  );
}

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
  // Section 8's default (Phase 6, UAT round 1): both identifiers are
  // required together -- there's no real intermediate state where she
  // legitimately has one but not the other, so one pair of inputs, one
  // save, not two independent ones.
  const [documentNo, setDocumentNo] = useState('');
  const [refNo, setRefNo] = useState('');
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);
  const [voucherSaveError, setVoucherSaveError] = useState<string | null>(null);
  const [isReopeningVoucher, setIsReopeningVoucher] = useState(false);

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
    const date = parseLocalIsoDate(dateStr);
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
    if (!justCheckedIn || !documentNo.trim() || !refNo.trim()) return;
    setIsSavingVoucher(true);
    setVoucherSaveError(null);
    try {
      const updated = await recordIfmisVoucher(justCheckedIn.id, documentNo.trim(), refNo.trim());
      // Reuses CheckInResponse's own shape (voucher included) rather than
      // re-fetching -- `recordIfmisVoucher` actually returns the plain
      // `Booking`, not `CheckInResponse`, so only the fields both share
      // are safe to trust here; `justCheckedIn` is left as-is except for
      // what changed (the two identifiers), matching the "trust the
      // response, don't round-trip" pattern used elsewhere in this file.
      setJustCheckedIn({
        ...justCheckedIn,
        ifmisDocumentNo: updated.ifmisDocumentNo,
        ifmisVoucherReference: updated.ifmisVoucherReference,
        voucher: { ...justCheckedIn.voucher, documentNo: documentNo.trim(), refNo: refNo.trim(), voucherRecorded: true },
      });
      setToast({
        message: t('voucher_saved') || 'IFMIS voucher recorded.',
        type: 'success',
      });
    } catch (err: any) {
      const message = err.message || t('voucher_save_failed') || 'Failed to save the IFMIS voucher.';
      setVoucherSaveError(message);
      setToast({ message, type: 'error' });
    } finally {
      setIsSavingVoucher(false);
    }
  };

  const handleReopenVoucher = async () => {
    setIsReopeningVoucher(true);
    try {
      const voucher = await getIfmisVoucher(booking.id);
      // Synthesizes the same shape checkInBooking's own response has
      // (Booking fields + voucher) so the identical panel above renders
      // -- `booking` here already has every Booking field this screen
      // needs (Phase 6 Step 6: "re-open the panel later").
      setJustCheckedIn({ ...booking, voucher } as CheckInResponse);
    } catch (err: any) {
      setToast({
        message: err.message || t('failed_to_load') || 'Failed to load the voucher.',
        type: 'error',
      });
    } finally {
      setIsReopeningVoucher(false);
    }
  };

  // Just checked in this booking -- show the IFMIS voucher-prep step
  // (payer name / amount in figures & words / purpose string) and let
  // the Cashier key the real Document No/Ref No back in once she's
  // entered the transaction into IFMIS herself.
  if (justCheckedIn) {
    const voucher = justCheckedIn.voucher;
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

          {/* Every field laid out top-to-bottom exactly as the real
              printed IFMIS voucher does (Phase 6, UAT round 1) -- this
              is what she copies into IFMIS's own form; Document No/Ref
              No (below) is what she copies back the other way, once
              IFMIS gives them to her. */}
          <div className="bg-white rounded-lg border border-green-200 p-4 text-sm space-y-2">
            <div className="font-semibold text-stone-900 mb-2">
              {t('ifmis_voucher_details') || 'IFMIS Voucher Details'}
            </div>
            <VoucherRow
              label={t('name_of_public_body') || 'Name of Public Body'}
              value={voucher.nameOfPublicBody}
            />
            <VoucherRow label={t('received_from') || 'Received From'} value={voucher.receivedFrom} />
            <VoucherRow label={t('amount_figures') || 'Amount (figures)'} value={voucher.amountFigures} />
            <VoucherRow label={t('amount_words') || 'Amount (words)'} value={voucher.amountWords} />
            <VoucherRow label={t('purpose') || 'Purpose'} value={voucher.purpose} />
          </div>

          {voucher.voucherRecorded ? (
            <div className="mt-4 text-center text-sm font-medium text-green-800 flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" /> {t('voucher_saved') || 'IFMIS voucher recorded.'}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-stone-500">
                {t('ifmis_voucher_prompt') ||
                  'Once IFMIS gives you back the Document No and Ref No for this transaction, enter both here.'}
              </p>
              {voucherSaveError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {voucherSaveError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  id="ifmis-document-no"
                  label={t('ifmis_document_no') || 'Document No'}
                  value={documentNo}
                  onChange={(e) => setDocumentNo(e.target.value)}
                />
                <TextField
                  id="ifmis-ref-no"
                  label={t('ifmis_ref_no') || 'Ref No'}
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                />
              </div>
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
                  disabled={isSavingVoucher || !documentNo.trim() || !refNo.trim()}
                >
                  {isSavingVoucher ? t('saving') || 'Saving...' : t('save_voucher') || 'Save Voucher'}
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
          {/* Phase 6 Step 6: a Cashier who navigated away before
              recording the Document No/Ref No needs a way back in --
              this re-fetches the exact same voucher panel shown right
              after check-in. Shown regardless of whether the voucher's
              already recorded, since re-opening it to double-check a
              value already keyed in is legitimate too. */}
          <div className="mt-4 flex gap-3 justify-center">
            <Button variant="secondary" onClick={onCancel}>
              {t('back') || 'Back'}
            </Button>
            <Button
              className="bg-brand-primary hover:bg-primary-700"
              onClick={handleReopenVoucher}
              disabled={isReopeningVoucher}
            >
              {isReopeningVoucher
                ? t('loading') || 'Loading...'
                : t('view_ifmis_voucher') || 'View IFMIS Voucher'}
            </Button>
          </div>
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
