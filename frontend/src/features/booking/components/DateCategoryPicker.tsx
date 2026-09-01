'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QuantityInput } from '@/components/ui/QuantityInput';
import type { Category } from '@/features/catalog/schemas';
import { getCategories } from '@/features/catalog/api';

interface DateCategoryPickerProps {
  selectedCategoryId: string | null;
  selectedQuantity: number;
  onCategorySelect: (categoryId: string) => void;
  onQuantityChange: (quantity: number) => void;
  onNext: () => void;
}

export function DateCategoryPicker({
  selectedCategoryId,
  selectedQuantity,
  onCategorySelect,
  onQuantityChange,
  onNext,
}: DateCategoryPickerProps) {
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

  const isSelected = (categoryId: string) => selectedCategoryId === categoryId;

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
      {/* Category Selection */}
      <Card>
        <h3 className="text-lg font-semibold text-stone-900 mb-4">
          {t('category')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => onCategorySelect(category.id)}
              className={`
                p-4 rounded-lg border-2 text-left transition-all
                ${isSelected(category.id)
                  ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-200'
                  : 'border-stone-200 hover:border-stone-400 hover:bg-stone-50'
                }
              `}
            >
              <div className="font-semibold text-stone-900">
                {locale === 'en' ? category.name_en : category.name_am}
              </div>
              <div className="text-sm text-stone-500 mt-1">
                {locale === 'en' ? category.name_am : category.name_en}
              </div>
              <div className="mt-2 text-lg font-bold text-amber-600">
                {category.is_free ? 'FREE' : `ETB ${category.price_etb}`}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Quantity Selection */}
      <Card>
        <QuantityInput
          label={t('quantity')}
          value={selectedQuantity}
          onChange={onQuantityChange}
          min={1}
          max={99}
        />
      </Card>

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          className="bg-amber-600 hover:bg-amber-700"
          disabled={!selectedCategoryId}
          onClick={onNext}
        >
          {t('continue')} →
        </Button>
      </div>
    </div>
  );
}
