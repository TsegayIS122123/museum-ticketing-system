'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast } from '@/components/ui/Toast';
import { DateCategoryPicker, type BookingItemInput } from '@/features/booking/components/DateCategoryPicker';
import { AvailabilityDatePicker } from '@/features/booking/components/AvailabilityDatePicker';
import { cancelBooking, updateBooking, type BookingResponse } from '@/features/booking/api';

interface EditAwaitingPaymentBookingProps {
  booking: BookingResponse;
  onActionComplete?: () => void;
}

// The Visitor-facing CRUD counterpart to CancelRescheduleControls above,
// scoped to a booking that's still `awaiting_payment` -- i.e. created but
// not yet paid for. Nothing has been charged at this point, so unlike
// CancelRescheduleControls (which only ever touches a Pending, already-
// paid booking, and is limited to cancel/reschedule) this lets the
// visitor freely edit the ticket mix and date, or delete the booking
// outright, right up until she pays.
export function EditAwaitingPaymentBooking({ booking, onActionComplete }: EditAwaitingPaymentBookingProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const draftItemsFromBooking = (): BookingItemInput[] =>
    booking.items.map((item) => ({ categoryId: item.categoryId, quantity: item.quantity }));

  const [items, setItems] = useState<BookingItemInput[]>(draftItemsFromBooking);
  const [visitDate, setVisitDate] = useState(booking.visitDate);

  const openEditModal = () => {
    // Reset the draft back to the booking's last-saved state every time
    // the modal opens -- otherwise closing without saving would leave a
    // stale in-progress edit sitting around for next time.
    setItems(draftItemsFromBooking());
    setVisitDate(booking.visitDate);
    setIsEditModalOpen(true);
  };

  const handleSave = async () => {
    if (items.length === 0) {
      setToast({
        message: t('select_at_least_one_ticket') || 'Select at least one ticket.',
        type: 'error',
      });
      return;
    }
    setIsProcessing(true);
    try {
      await updateBooking(booking.id, { items, visitDate });
      setToast({
        message: t('booking_updated') || 'Booking updated successfully.',
        type: 'success',
      });
      setIsEditModalOpen(false);
      if (onActionComplete) onActionComplete();
      router.refresh();
    } catch (error: any) {
      setToast({
        message: error.message || t('update_booking_failed') || 'Failed to update booking. Please try again.',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      // Same endpoint a Pending booking's cancel button uses -- see
      // BookingCancelView's own docstring for why "cancel" is still the
      // right verb here, just without the refund that a paid booking's
      // cancellation triggers.
      await cancelBooking(booking.id);
      setToast({
        message: t('booking_deleted') || 'Booking deleted.',
        type: 'success',
      });
      setIsDeleteDialogOpen(false);
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

  return (
    <div className="mt-3 space-y-3">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" onClick={openEditModal} disabled={isProcessing}>
          <Pencil className="w-4 h-4" /> {t('edit_booking') || 'Edit Booking'}
        </Button>
        <Button variant="danger" size="sm" onClick={() => setIsDeleteDialogOpen(true)} disabled={isProcessing}>
          <Trash2 className="w-4 h-4" /> {t('delete_booking') || 'Delete Booking'}
        </Button>
      </div>

      {/* Edit Modal -- reuses the same DateCategoryPicker/
          AvailabilityDatePicker the booking wizard itself uses, so a
          visitor editing here sees the exact same categories, prices,
          and closed-date handling as when she first booked. */}
      <Modal
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('edit_booking') || 'Edit Booking'}
        className="max-w-2xl"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-stone-700 mb-2">{t('date') || 'Date'}</h4>
            <AvailabilityDatePicker value={visitDate} onChange={setVisitDate} />
          </div>

          {/* DateCategoryPicker's own primary button (labelled via
              t('continue')) doubles as this form's Save action -- no new
              prop was added to the shared component just to relabel it
              for this one caller. */}
          <DateCategoryPicker items={items} onItemsChange={setItems} onNext={handleSave} />

          <div className="flex justify-start">
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)} disabled={isProcessing}>
              {t('cancel') || 'Cancel'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title={t('delete_booking') || 'Delete Booking'}
        message={
          t('delete_unpaid_booking_confirmation') ||
          "Are you sure you want to delete this booking? You haven't been charged for it yet."
        }
        confirmLabel={t('delete_booking') || 'Delete Booking'}
        danger
      />
    </div>
  );
}
