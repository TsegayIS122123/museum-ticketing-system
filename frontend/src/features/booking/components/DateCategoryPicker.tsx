'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QuantityInput } from '@/components/ui/QuantityInput';
import type { Category } from '@/features/catalog/schemas';
import { getCategories } from '@/features/catalog/api';

export interface BookingItemInput {
  categoryId: string;
  quantity: number;
}

interface DateCategoryPickerProps {
  // One entry per category the visitor has put a quantity against --
  // e.g. a father booking one Adult ticket for himself and two Student
  // tickets for his kids ends up with two entries here, not two separate
  // bookings. A category with quantity 0 simply isn't in this list.
  items: BookingItemInput[];
  onItemsChange: (items: BookingItemInput[]) => void;
  onNext: () => void;
}

export function DateCategoryPicker({ items, onItemsChange, onNext }: DateCategoryPickerProps) {
  const { t, locale } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
        setLoadError(null);
      } catch (error: any) {
        // No fake fallback data here -- surfacing the real error is more
        // useful than silently showing categories that may not match
        // what the backend will actually accept at booking time.
        console.error('Failed to load categories:', error);
        setLoadError(error?.message || t('failed_to_load') || 'Failed to load categories.');
      } finally {
        setIsLoading(false);
      }
    };
    loadCategories();
  }, [t]);

  const quantityFor = (categoryId: string) =>
    items.find((item) => item.categoryId === categoryId)?.quantity ?? 0;

  const setQuantityFor = (categoryId: string, quantity: number) => {
    const withoutCategory = items.filter((item) => item.categoryId !== categoryId);
    // A category dropped to 0 leaves the cart entirely rather than
    // sitting in it as a zero-quantity row -- `items` is exactly the set
    // of `{categoryId, quantity}` pairs services.create_booking expects,
    // and it rejects a zero quantity.
    onItemsChange(quantity > 0 ? [...withoutCategory, { categoryId, quantity }] : withoutCategory);
  };

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => {
    const category = categories.find((c) => c.id === item.categoryId);
    return sum + (category ? Number(category.price_etb) * item.quantity : 0);
  }, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="text-center py-12 text-stone-500">
            {t('loading')}
          </div>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="text-center py-12 text-red-600">{loadError}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category + quantity selection -- a father booking one Adult
          ticket for himself and two Student tickets for his kids sets a
          quantity against both rows here, in the same booking, rather
          than having to book each category separately. */}
      <Card>
        <h3 className="text-lg font-semibold text-stone-900 mb-4">
          {t('category')}
        </h3>
        <div className="space-y-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className={`
                p-4 rounded-lg border-2 flex flex-wrap items-center justify-between gap-4 transition-all
                ${quantityFor(category.id) > 0
                  ? 'border-secondary-600 bg-secondary-50 ring-2 ring-secondary-200'
                  : 'border-stone-200'
                }
              `}
            >
              <div>
                <div className="font-semibold text-stone-900">
                  {locale === 'en' ? category.name_en : category.name_am}
                </div>
                <div className="text-sm text-stone-500 mt-1">
                  {locale === 'en' ? category.name_am : category.name_en}
                </div>
                <div className="mt-2 text-lg font-bold text-primary-600">
                  {`ETB ${category.price_etb}`}
                </div>
              </div>
              <QuantityInput
                value={quantityFor(category.id)}
                onChange={(quantity) => setQuantityFor(category.id, quantity)}
                min={0}
                max={99}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Cart summary -- only shown once at least one category has a
          quantity, so a father mixing Adult + Student tickets can see
          the combined total before moving on. */}
      {items.length > 0 && (
        <Card>
          <div className="flex items-center justify-between text-sm text-stone-600">
            <span>
              {totalQuantity} {t('tickets') || 'tickets'}
            </span>
            <span className="text-lg font-bold text-primary-600">
              ETB {totalAmount.toFixed(2)}
            </span>
          </div>
        </Card>
      )}

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          className="bg-brand-primary hover:bg-primary-700"
          disabled={items.length === 0}
          onClick={onNext}
        >
          {t('continue')} →
        </Button>
      </div>
    </div>
  );
}
