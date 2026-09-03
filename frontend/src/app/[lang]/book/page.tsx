'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { DateCategoryPicker } from '@/features/booking/components/DateCategoryPicker';
import { BookingSummary } from '@/features/booking/components/BookingSummary';
import { createBooking } from '@/features/booking/api';
import { Toast } from '@/components/ui/Toast';
import { VisitorSidebar } from '@/components/layout/VisitorSidebar';

type Step = 'category' | 'datetime' | 'payment';

export default function BookPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [currentStep, setCurrentStep] = useState<Step>('category');
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [visitDate, setVisitDate] = useState('');

  // Login gate -- mirrors group-visits/new/page.tsx, which already does
  // this correctly. This page previously let a visitor fill out the
  // entire wizard (including a "Details" step collecting name/email/
  // phone that were never sent anywhere -- see the BookingSummary note
  // below) before finding out at the final confirm click that she
  // wasn't logged in.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(`/${locale}/verify?redirect=/book`);
    }
  }, [isAuthenticated, authLoading, locale, router]);

  const steps = [
    t('tickets') || 'Tickets',
    t('date_time') || 'Date & Time',
    t('payment') || 'Payment',
  ];

  const stepIndex = ['category', 'datetime', 'payment'].indexOf(currentStep);

  const handleCategoryNext = () => {
    if (categoryId && quantity > 0) {
      setCurrentStep('datetime');
    }
  };

  const handleDateTimeNext = () => {
    if (visitDate) {
      setCurrentStep('payment');
    }
  };

  const handleConfirmBooking = async () => {
    if (!categoryId) return;

    setIsProcessing(true);
    try {
      const booking = await createBooking({
        visitDate,
        categoryId,
        quantity,
        bookingType: 'individual',
      });

      // Show success message
      setToast({
        message: t('booking_created') || 'Booking created successfully! Reference: ' + booking.reference,
        type: 'success',
      });

      // Redirect to bookings page after short delay
      setTimeout(() => {
        router.push(`/${locale}/bookings`);
      }, 2000);
    } catch (error: any) {
      setToast({
        message: error.message || 'Failed to create booking. Please try again.',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'category':
        return (
          <DateCategoryPicker
            selectedCategoryId={categoryId}
            selectedQuantity={quantity}
            onCategorySelect={setCategoryId}
            onQuantityChange={setQuantity}
            onNext={handleCategoryNext}
          />
        );

      case 'datetime':
        return (
          <div className="space-y-6">
            <Card>
              <h3 className="text-lg font-semibold text-stone-900 mb-4">
                {t('date') || 'Date'}
              </h3>
              {/* Time-of-day was removed from this step -- the booking
                  contract has no time concept at all (a booking is for a
                  visitDate, full stop), so a time picker here could never
                  have been anything but decoration. */}
              <div>
                <label className="text-sm font-medium text-stone-700">
                  {t('date') || 'Date'}
                </label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500"
                />
              </div>
            </Card>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setCurrentStep('category')}>
                ← {t('back') || 'Back'}
              </Button>
              <Button
                className="bg-brand-primary hover:bg-primary-700"
                disabled={!visitDate}
                onClick={handleDateTimeNext}
              >
                {t('continue')} →
              </Button>
            </div>
          </div>
        );

      case 'payment':
        return (
          <BookingSummary
            categoryId={categoryId!}
            quantity={quantity}
            visitDate={visitDate}
            visitorName={user?.full_name ?? ''}
            visitorEmail={user?.email ?? ''}
            visitorPhone={user?.phone ?? null}
            onBack={() => setCurrentStep('datetime')}
            onConfirm={handleConfirmBooking}
            isProcessing={isProcessing}
          />
        );
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col" data-surface="visitor">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-stone-500">{t('loading')}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <div className="flex flex-1">
        <VisitorSidebar />
        <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-stone-900">
            {t('book_a_visit') || 'Book a Visit'}
          </h1>
          <StepIndicator
            steps={steps}
            current={stepIndex}
            className="mt-4"
          />
        </div>

        {renderStep()}
        </main>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
