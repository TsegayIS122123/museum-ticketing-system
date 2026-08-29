'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SEEDED_CATEGORIES } from '@/lib/constants/categories';

interface BookingSummaryProps {
  categoryId: string;
  quantity: number;
  visitDate: string;
  visitTime: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  specialRequests?: string;
  onBack: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export function BookingSummary({
  categoryId,
  quantity,
  visitDate,
  visitTime,
  visitorName,
  visitorEmail,
  visitorPhone,
  specialRequests,
  onBack,
  onConfirm,
  isProcessing = false,
}: BookingSummaryProps) {
  const { t, locale } = useTranslation();
  
  const category = SEEDED_CATEGORIES.find(c => c.id === categoryId);
  const totalAmount = category ? category.priceEtb * quantity : 0;

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
          {/* Category & Quantity */}
          <div className="grid grid-cols-2 gap-2 pb-3">
            <div className="text-stone-500">{t('category')}</div>
            <div className="font-medium text-stone-900 text-right">
              {locale === 'en' ? category?.nameEn : category?.nameAm}
            </div>
            <div className="text-stone-500">{t('quantity')}</div>
            <div className="font-medium text-stone-900 text-right">{quantity}</div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2 py-3">
            <div className="text-stone-500">{t('date') || 'Date'}</div>
            <div className="font-medium text-stone-900 text-right">{formatDate(visitDate)}</div>
            <div className="text-stone-500">{t('time') || 'Time'}</div>
            <div className="font-medium text-stone-900 text-right">{visitTime}</div>
          </div>

          {/* Visitor Details */}
          <div className="grid grid-cols-2 gap-2 py-3">
            <div className="text-stone-500">{t('name') || 'Name'}</div>
            <div className="font-medium text-stone-900 text-right">{visitorName}</div>
            <div className="text-stone-500">{t('email')}</div>
            <div className="font-medium text-stone-900 text-right">{visitorEmail}</div>
            <div className="text-stone-500">{t('phone')}</div>
            <div className="font-medium text-stone-900 text-right">{visitorPhone}</div>
          </div>

          {specialRequests && (
            <div className="pt-3">
              <div className="text-stone-500 text-sm">{t('special_requests') || 'Special Requests'}</div>
              <div className="text-stone-700 text-sm mt-1">{specialRequests}</div>
            </div>
          )}

          {/* Total */}
          <div className="pt-4 flex justify-between items-center border-t-2 border-stone-200">
            <span className="text-lg font-semibold text-stone-900">{t('total')}</span>
            <span className="text-2xl font-bold text-amber-600 font-serif">
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
          ← {t('back') || 'Back'}
        </Button>
        <Button
          size="lg"
          className="flex-1 bg-amber-600 hover:bg-amber-700"
          onClick={onConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? t('processing') || 'Processing...' : `${t('confirm') || 'Confirm'} →`}
        </Button>
      </div>
    </div>
  );
}
