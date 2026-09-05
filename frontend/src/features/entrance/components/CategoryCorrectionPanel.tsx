'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Button } from '@/components/ui/Button';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';
import { correctBookingCategory } from '../api';
import type { BookingLookupResponse } from '../api';
import { ApiError } from '@/lib/api/errors';

interface CategoryCorrectionPanelProps {
  booking: BookingLookupResponse;
  onCancel: () => void;
  onCorrected: (updated: BookingLookupResponse) => void;
}

// ID-verification addendum to Document 02 Sec 2.2: shown inline on the
// gate check-in screen (AttendanceEntryForm), before check-in, when the
// visitor's ID doesn't match the category they booked under. The backend
// (apps.bookings.services.correct_booking_category) does all the money
// math -- an undercharge reopens the booking for payment, an overcharge
// issues a refund -- this component only needs to submit the new
// category and hand the resulting Booking back up.
export function CategoryCorrectionPanel({
  booking,
  onCancel,
  onCorrected,
}: CategoryCorrectionPanelProps) {
  const { t, locale } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  // A booking under correction almost always has just one item (the
  // common single-category case), so default straight to it -- a Cashier
  // only has to pick which ticket-holder when the booking actually mixes
  // categories (e.g. one Adult plus two Student tickets).
  const [selectedItemId, setSelectedItemId] = useState(booking.items[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState('');
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
  }, []);

  const handleSubmit = async () => {
    if (!selectedItemId || !selectedId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await correctBookingCategory(booking.id, selectedItemId, selectedId);
      onCorrected(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
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
  const otherCategoryIds = new Set(
    booking.items.filter((item) => item.id !== selectedItemId).map((item) => item.categoryId)
  );
  const otherCategories = categories.filter(
    (c) => c.id !== selectedItem?.categoryId && !otherCategoryIds.has(c.id)
  );

  return (
    <div className="mt-4 border-t border-stone-200 pt-4">
      <div className="text-sm font-medium text-stone-700 mb-2">
        {t('correct_category_prompt') ||
          "The visitor's ID doesn't match this category. Select the correct one:"}
      </div>

      {/* Which ticket-holder -- only shown when the booking actually
          mixes categories; a single-category booking has nothing to
          choose between. */}
      {booking.items.length > 1 && (
        <select
          value={selectedItemId}
          onChange={(e) => {
            setSelectedItemId(e.target.value);
            setSelectedId('');
          }}
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
          <option value="">{t('select_category') || 'Select a category'}</option>
          {otherCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {(locale === 'en' ? category.name_en : category.name_am)} -- ETB{' '}
              {category.price_etb}
            </option>
          ))}
        </select>
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
          disabled={isSubmitting || !selectedItemId || !selectedId}
        >
          {isSubmitting ? t('processing') || 'Processing...' : t('confirm') || 'Confirm'}
        </Button>
      </div>
    </div>
  );
}
