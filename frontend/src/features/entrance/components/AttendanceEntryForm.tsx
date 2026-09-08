'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Check, Minus, Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
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
  // One entry per `BookingItem`/category on this booking (e.g. 3 Adult +
  // 4 Student booked together are two separate counters here) -- not a
  // single combined total. Per-category attendance is what lets the
  // backend later refund a shortfall at the actual no-show category's
  // own price instead of a blended average across the booking
  // (FR-REFUND-002).
  const [attendedByItem, setAttendedByItem] = useState<Record<string, number>>(() =>
    Object.fromEntries(booking.items.map((item) => [item.id, item.quantity]))
  );
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
      const attendedItems = booking.items.map((item) => ({
        itemId: item.id,
        attendedQuantity: attendedByItem[item.id] ?? 0,
      }));
      const result = await checkInBooking(booking.id, attendedItems);

      const shortfall = booking.bookedQuantity - totalAttended;
      let message = t('check_in_success') || 'Check-in successful!';
      if (shortfall > 0) {
        message = t('partial_check_in', {
          attended: totalAttended,
          total: booking.bookedQuantity,
          shortfall,
        });
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

  const handleItemQuantityChange = (itemId: string, max: number, value: number) => {
    const clamped = Math.min(Math.max(value, 0), max);
    setAttendedByItem((prev) => ({ ...prev, [itemId]: clamped }));
  };

  const totalAttended = booking.items.reduce(
    (sum, item) => sum + (attendedByItem[item.id] ?? 0),
    0
  );
  const shortfall = booking.bookedQuantity - totalAttended;

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

  // Not pending or already processed
  if (!canCheckIn) {
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums text-sm font-semibold text-stone-600">
                #{booking.reference}
              </span>
              <StatusBadge status={booking.status} />
            </div>
            {/* Category/headcount correction (ID-verification addendum)
                -- a full bordered button in the header, not a small
                underlined link buried next to the "Category" field
                below, so it's actually noticeable at a busy gate
                counter. Label spells out what it does rather than just
                saying "Correct", which on its own doesn't say correct
                *what*. */}
            {canCheckIn && (
              <button
                type="button"
                onClick={() => setShowCorrection((v) => !v)}
                className="shrink-0 text-xs font-medium text-secondary-700 border border-secondary-300 bg-secondary-50 hover:bg-secondary-100 rounded-lg px-3 py-1.5 transition-colors"
              >
                {t('correct_category') || 'Fix category / headcount'}
              </button>
            )}
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

        {showCorrection && (
          <CategoryCorrectionPanel
            booking={booking}
            onCancel={() => setShowCorrection(false)}
            onCorrected={(updated, partialError) => {
              const previousTotal = Number(booking.totalAmountEtb);
              setBooking(updated);
              // A correction can change an item's category/quantity (or
              // even remove/replace it) -- re-seed the per-category
              // counters from the corrected booking rather than leaving
              // stale counts keyed to quantities that no longer exist.
              setAttendedByItem(
                Object.fromEntries(updated.items.map((item) => [item.id, item.quantity]))
              );
              setShowCorrection(false);
              if (partialError) {
                // The panel already stopped after whatever succeeded --
                // `updated` reflects that partial progress. Tell the
                // Cashier plainly rather than showing a success toast for
                // a batch that didn't fully go through.
                setToast({ message: partialError, type: 'error' });
                return;
              }
              // The panel can now apply several changes at once, so the
              // net effect on the total (not just the final status) is
              // what determines the right message -- a batch that nets to
              // no change in price (e.g. a pure category swap between two
              // equally-priced categories) shouldn't claim a refund.
              const totalDelta = Number(updated.totalAmountEtb) - previousTotal;
              if (updated.status === 'awaiting_payment') {
                setToast({
                  message:
                    t('correction_needs_payment') ||
                    "Category corrected. The visitor now owes the difference online before they can be checked in -- they'll see a Pay Now button on their own booking page.",
                  type: 'success',
                });
              } else if (totalDelta < 0) {
                setToast({
                  message:
                    t('correction_refund_issued') ||
                    'Category corrected. The overcharge is being refunded automatically.',
                  type: 'success',
                });
              } else {
                setToast({
                  message: t('correction_applied') || 'Category correction applied.',
                  type: 'success',
                });
              }
            }}
          />
        )}

        {/* Attendance entry -- same card, hairline divider instead of a
            second shadowed panel: this is one continuous task (look at
            the booking, then record who showed up), not two. */}
        <div className="mt-4 pt-4 border-t border-stone-200">
          <h4 className="text-sm font-semibold text-stone-900 uppercase tracking-wider mb-3">
            {t('record_attendance') || 'Record Attendance'}
          </h4>

          <div className="space-y-4">
            {/* One counter per category (`BookingItem`), not one combined
                total -- e.g. 3 Adult + 4 Student booked together get two
                separate steppers here, so the Cashier records exactly
                which category's ticket-holders didn't show up. This is
                what lets a later shortfall refund use that category's
                own price instead of a blended average (FR-REFUND-002). */}
            {booking.items.map((item) => {
              const categoryLabel = locale === 'en' ? item.categoryNameEn : item.categoryNameAm;
              const value = attendedByItem[item.id] ?? 0;
              return (
                <div key={item.id}>
                  <label className="text-sm font-medium text-stone-700">
                    {categoryLabel}
                  </label>
                  <div className="flex items-center gap-4 mt-1">
                    <button
                      type="button"
                      onClick={() => handleItemQuantityChange(item.id, item.quantity, value - 1)}
                      disabled={value <= 0}
                      className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      aria-label={`${t('decrease_attended_count') || 'Decrease attended count'} — ${categoryLabel}`}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value);
                        handleItemQuantityChange(item.id, item.quantity, isNaN(parsed) ? 0 : parsed);
                      }}
                      min={0}
                      max={item.quantity}
                      className="w-20 text-center px-2 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500 text-lg font-semibold font-mono tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => handleItemQuantityChange(item.id, item.quantity, value + 1)}
                      // Attendance can never exceed what was actually
                      // booked for this line -- increasing the headcount
                      // itself is a category correction (Fix Category &
                      // Headcount above), not something check-in does.
                      // handleItemQuantityChange already clamps to
                      // item.quantity, but disabling the button once
                      // that ceiling is reached makes it visibly a hard
                      // stop rather than a no-op the Cashier has to
                      // discover by tapping it.
                      disabled={value >= item.quantity}
                      className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      aria-label={`${t('increase_attended_count') || 'Increase attended count'} — ${categoryLabel}`}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-stone-500">
                      / {item.quantity} {t('max') || 'max'}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="text-sm text-stone-600 border-t border-stone-100 pt-3">
              {t('total_attended') || 'Total attended'}:{' '}
              <span className="font-semibold font-mono tabular-nums text-stone-900">
                {totalAttended} / {booking.bookedQuantity}
              </span>
            </div>

            {shortfall > 0 && (
              <div className="p-3 bg-secondary-50 border border-secondary-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-secondary-600"><AlertTriangle className="w-4 h-4" /></span>
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
                disabled={isProcessing || totalAttended === 0}
              >
                {isProcessing ? t('processing') || 'Processing...' : t('confirm_check_in') || 'Confirm Check-in'}
              </Button>
            </div>
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
            ? `${t('confirm_check_in_message') || 'Confirm check-in for'} ${displayName} (${totalAttended} ${t('visitors') || 'visitors'})?`
            : `${t('partial_check_in_confirmation') || 'Only'} ${totalAttended} ${t('out_of') || 'out of'} ${booking.bookedQuantity} ${t('visitors_attending') || 'visitors are attending'}. ${shortfall} ${t('will_not_attend') || 'will not attend'}. ${t('refund_available_on_request_confirm') || 'A refund for the shortfall is available on request.'}`
        }
        confirmLabel={t('confirm') || 'Confirm'}
      />
    </div>
  );
}
