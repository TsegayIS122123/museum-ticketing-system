'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Button } from '@/components/ui/Button';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';
import { correctBookingCategory, addBookingItem } from '../api';
import type { BookingLookupResponse } from '../api';
import { ApiError } from '@/lib/api/errors';

interface CategoryCorrectionPanelProps {
  booking: BookingLookupResponse;
  onCancel: () => void;
  onCorrected: (updated: BookingLookupResponse) => void;
}

// ID-verification addendum to Document 02 Sec 2.2: shown inline on the
// gate check-in screen (AttendanceEntryForm), before check-in, when the
// visitor's ID doesn't match the category they booked under, and/or the
// actual headcount for that item doesn't match what was booked (either
// direction -- e.g. a party of 3 booked under one line but only 2
// actually show up under it, or the reverse). The backend
// (apps.bookings.services.correct_booking_category) does all the money
// math for either or both together against a single combined delta --
// an undercharge reopens the booking for payment, an overcharge issues
// a refund -- this component only needs to submit whichever of the new
// category/new quantity the Cashier actually changed and hand the
// resulting Booking back up.
export function CategoryCorrectionPanel({
  booking,
  onCancel,
  onCorrected,
}: CategoryCorrectionPanelProps) {
  const { t, locale } = useTranslation();
  const [mode, setMode] = useState<'fix' | 'add'>('fix');
  const [categories, setCategories] = useState<Category[]>([]);
  // A booking under correction almost always has just one item (the
  // common single-category case), so default straight to it -- a Cashier
  // only has to pick which ticket-holder when the booking actually mixes
  // categories (e.g. one Adult plus two Student tickets).
  const [selectedItemId, setSelectedItemId] = useState(booking.items[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState('');
  // Quantity starts at the item's own current quantity, not empty/0 --
  // "no change" is a valid outcome for this field on its own (the
  // Cashier may only be correcting the category), unlike categoryId
  // which starts unselected since there's no sensible "current" option
  // to default to in that dropdown (the item's own category is
  // deliberately excluded from it below).
  const currentItem = booking.items.find((item) => item.id === selectedItemId);
  const [quantity, setQuantity] = useState(currentItem?.quantity ?? 1);
  // "Add a new category" walk-up flow -- a separate category/quantity
  // pair from the fix-a-ticket-holder flow above, since it's adding a
  // brand-new line rather than editing `selectedItemId`'s existing one.
  const [addCategoryId, setAddCategoryId] = useState('');
  const [addQuantity, setAddQuantity] = useState(1);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('categories_load_failed') || 'Could not load categories.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
    // `t` intentionally excluded: useTranslation() returns a new function
    // reference every render, so including it here would refire this
    // fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModeChange = (newMode: 'fix' | 'add') => {
    setMode(newMode);
    setError(null);
  };

  const handleItemChange = (itemId: string) => {
    setSelectedItemId(itemId);
    setSelectedId('');
    // Reset the quantity input to the newly-selected item's own current
    // quantity, same reasoning as the initial state above.
    setQuantity(booking.items.find((item) => item.id === itemId)?.quantity ?? 1);
  };

  // A change is only actually being requested if the category picker
  // has a real selection, or the quantity differs from the item's own
  // current one -- mirrors services.correct_booking_category's own
  // "at least one of categoryId/quantity" + "not already this
  // quantity" rules server-side, so the Confirm button doesn't invite a
  // no-op submission that the backend would just reject anyway.
  const quantityChanged = !!currentItem && quantity !== currentItem.quantity;
  const hasChange = !!selectedId || quantityChanged;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (mode === 'add') {
        if (!addCategoryId) return;
        const updated = await addBookingItem(booking.id, {
          categoryId: addCategoryId,
          quantity: addQuantity,
        });
        onCorrected(updated);
        return;
      }
      if (!selectedItemId || !hasChange) return;
      const updated = await correctBookingCategory(booking.id, selectedItemId, {
        categoryId: selectedId || undefined,
        quantity: quantityChanged ? quantity : undefined,
      });
      onCorrected(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : mode === 'add'
            ? t('add_category_failed') || 'Failed to add the category. Please try again.'
            : t('correction_failed') || 'Failed to correct the category. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedItem = booking.items.find((item) => item.id === selectedItemId);
  // The item's own current category, plus any category another item on
  // this same booking already holds, aren't valid corrections for it --
  // mirrors the same two checks services.correct_booking_category itself
  // enforces server-side.
  const bookedCategoryIds = new Set(booking.items.map((item) => item.categoryId));
  const otherCategoryIds = new Set(
    booking.items.filter((item) => item.id !== selectedItemId).map((item) => item.categoryId)
  );
  const otherCategories = categories.filter(
    (c) => c.id !== selectedItem?.categoryId && !otherCategoryIds.has(c.id)
  );
  // For the "add a new category" flow: only categories not already on
  // this booking at all -- mirrors services.add_booking_item's own
  // "already has a line for that category" rejection, so the dropdown
  // never offers a choice the backend would reject anyway (that's a
  // quantity correction on the existing item instead, the "fix" flow
  // above).
  const addableCategories = categories.filter((c) => !bookedCategoryIds.has(c.id));

  return (
    <div className="mt-4 border-t border-stone-200 pt-4">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => handleModeChange('fix')}
          className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border ${
            mode === 'fix'
              ? 'bg-brand-primary text-white border-brand-primary'
              : 'bg-white text-stone-600 border-stone-300'
          }`}
        >
          {t('fix_ticket_holder_tab') || 'Fix a ticket-holder'}
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('add')}
          className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border ${
            mode === 'add'
              ? 'bg-brand-primary text-white border-brand-primary'
              : 'bg-white text-stone-600 border-stone-300'
          }`}
        >
          {t('add_new_category_tab') || 'Add a new category'}
        </button>
      </div>

      {mode === 'fix' ? (
        <>
          <div className="text-sm font-medium text-stone-700 mb-2">
            {t('correct_category_prompt') ||
              "The visitor's ID doesn't match this category, or the headcount is off. Correct either or both:"}
          </div>

          {/* Which ticket-holder -- only shown when the booking actually
              mixes categories; a single-category booking has nothing to
              choose between. */}
          {booking.items.length > 1 && (
            <select
              value={selectedItemId}
              onChange={(e) => handleItemChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-secondary-500"
            >
              {booking.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {(locale === 'en' ? item.categoryNameEn : item.categoryNameAm)} x{item.quantity}
                </option>
              ))}
            </select>
          )}

          {isLoadingCategories ? (
            <div className="text-sm text-stone-500">{t('loading') || 'Loading...'}</div>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
            >
              <option value="">
                {t('keep_current_category') || "Don't change category"}
              </option>
              {otherCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {(locale === 'en' ? category.name_en : category.name_am)} -- ETB{' '}
                  {category.price_etb}
                </option>
              ))}
            </select>
          )}

          {/* Headcount correction for this same item -- e.g. 3 tickets
              bought under it but only 2 people actually show up, or the
              reverse. Independent of the category picker above; either or
              both can be changed in the same request. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-stone-600">
              {t('correct_quantity_prompt') || 'Quantity'}
            </span>
            <QuantityInput value={quantity} onChange={setQuantity} min={1} max={999} />
          </div>
        </>
      ) : (
        <>
          <div className="text-sm font-medium text-stone-700 mb-2">
            {t('add_category_prompt') ||
              'Extra people joined this booking under a category not already on it. Add them here:'}
          </div>

          {isLoadingCategories ? (
            <div className="text-sm text-stone-500">{t('loading') || 'Loading...'}</div>
          ) : addableCategories.length === 0 ? (
            <div className="text-sm text-stone-500">
              {t('no_addable_categories') || 'Every active category is already on this booking.'}
            </div>
          ) : (
            <select
              value={addCategoryId}
              onChange={(e) => setAddCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
            >
              <option value="">{t('select_category') || 'Select a category'}</option>
              {addableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {(locale === 'en' ? category.name_en : category.name_am)} -- ETB{' '}
                  {category.price_etb}
                </option>
              ))}
            </select>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-stone-600">
              {t('add_quantity_prompt') || 'How many people'}
            </span>
            <QuantityInput value={addQuantity} onChange={setAddQuantity} min={1} max={999} />
          </div>
        </>
      )}

      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

      <div className="flex gap-3 mt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('cancel') || 'Cancel'}
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1 bg-brand-primary hover:bg-primary-700"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            (mode === 'fix' ? !selectedItemId || !hasChange : !addCategoryId)
          }
        >
          {isSubmitting ? t('processing') || 'Processing...' : t('confirm') || 'Confirm'}
        </Button>
      </div>
    </div>
  );
}
