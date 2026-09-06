'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';
import type { BookingItemInput } from './DateCategoryPicker';

interface BookingSummaryProps {
  // One row per category with a quantity against it -- e.g. a father's
  // booking shows both his one Adult ticket and his kids' two Student
  // tickets here, not just a single category/quantity pair.
  items: BookingItemInput[];
  visitDate: string;
  // Shown read-only for the visitor's own confirmation, sourced from her
  // authenticated account -- NOT form fields, and never sent as part of
  // the booking request. BookingCreateRequest has no visitor-identity
  // fields at all (identity comes from the session token); there's also
  // no time-of-day or special-requests concept anywhere in the contract.
  // A previous version of this step collected all of these (plus a time
  // picker and a special-requests textarea) as editable inputs that were
  // silently discarded on submit -- decided to strip them rather than
  // add unneeded backend fields, since a Visitor's booking is already
  // fully described by its items + date.
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string | null;
  onBack: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export function BookingSummary({
  items,
  visitDate,
  visitorName,
  visitorEmail,
  visitorPhone,
  onBack,
  onConfirm,
  isProcessing = false,
}: BookingSummaryProps) {
  const { t, locale } = useTranslation();

  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = items.map((item) => {
    const category = categories.find((c) => c.id === item.categoryId) ?? null;
    const unitPrice = category ? parseFloat(category.price_etb) : 0;
    return { ...item, category, subtotal: unitPrice * item.quantity };
  });
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.subtotal, 0).toFixed(2);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-lg font-semibold text-stone-900 mb-4">
          {t('booking')} {t('summary') || 'Summary'}
        </h3>

        <div className="space-y-3 divide-y divide-stone-100">
          {/* One line per category -- see the `items` prop note above. */}
          <div className="space-y-2 pb-3">
            <div className="text-stone-500">{t('category')}</div>
            {rows.map((row) => (
              <div key={row.categoryId} className="grid grid-cols-3 gap-2 text-sm">
                <div className="font-medium text-stone-900 col-span-2">
                  {locale === 'en' ? row.category?.name_en : row.category?.name_am}
                </div>
                <div className="font-medium text-stone-900 text-right">
                  x{row.quantity} = ETB {row.subtotal.toFixed(2)}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="text-stone-500">{t('quantity')}</div>
              <div className="font-medium text-stone-900 text-right">{totalQuantity}</div>
            </div>
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-2 py-3">
            <div className="text-stone-500">{t('date') || 'Date'}</div>
            <div className="font-medium text-stone-900 text-right">{formatDate(visitDate)}</div>
          </div>

          {/* Visitor identity, read-only from the account -- not part of
              the booking request, see the prop-level note above. */}
          <div className="grid grid-cols-2 gap-2 py-3">
            <div className="text-stone-500">{t('name') || 'Name'}</div>
            <div className="font-medium text-stone-900 text-right">{visitorName}</div>
            <div className="text-stone-500">{t('email')}</div>
            <div className="font-medium text-stone-900 text-right">{visitorEmail}</div>
            {visitorPhone && (
              <>
                <div className="text-stone-500">{t('phone')}</div>
                <div className="font-medium text-stone-900 text-right">{visitorPhone}</div>
              </>
            )}
          </div>

          {/* Total */}
          <div className="pt-4 flex justify-between items-center border-t-2 border-dashed border-stone-300">
            <span className="text-lg font-semibold text-stone-900">{t('total')}</span>
            <span className="text-2xl text-primary-600 font-bold">
              ETB {totalAmount}
            </span>
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={onBack}
          disabled={isProcessing}
        >
          <ArrowLeft className="w-4 h-4" /> {t('back') || 'Back'}
        </Button>
        <Button
          size="lg"
          className="flex-1 bg-brand-primary hover:bg-primary-700"
          onClick={onConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? (
            t('processing') || 'Processing...'
          ) : (
            <>
              {t('confirm') || 'Confirm'} <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
