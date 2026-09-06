'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { OrbitMotif } from '@/components/ui/OrbitMotif';
import { DateCategoryPicker, type BookingItemInput } from '@/features/booking/components/DateCategoryPicker';
import { AvailabilityDatePicker } from '@/features/booking/components/AvailabilityDatePicker';
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

  // One entry per category the visitor has put a quantity against -- a
  // father booking one Adult ticket for himself and two Student tickets
  // for his kids ends up with two entries here, in one booking, instead
  // of being limited to a single category/quantity pair.
  const [items, setItems] = useState<BookingItemInput[]>([]);
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
    if (items.length > 0) {
      setCurrentStep('datetime');
    }
  };

  const handleDateTimeNext = () => {
    if (visitDate) {
      setCurrentStep('payment');
    }
  };

  const handleConfirmBooking = async () => {
    if (items.length === 0) return;

    setIsProcessing(true);
    try {
      const booking = await createBooking({
        visitDate,
        items,
        bookingType: 'individual',
      });

      // Show success message. Note: `t('booking_created')` resolves to a
      // translated string ending in "Reference:" with no interpolation
      // support in `t()` -- the reference must be appended explicitly
      // here, not folded into the `||` fallback (which never runs once
      // the translation key exists, silently dropping the reference).
      setToast({
        message: `${t('booking_created') || 'Booking created successfully! Reference:'} ${booking.reference}`,
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
            items={items}
            onItemsChange={setItems}
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
                  have been anything but decoration.

                  Closed dates (set by the Museum Manager on
                  staff/availability) are fetched here and disabled
                  directly on the calendar grid -- previously this was a
                  bare input[type=date] with no awareness of closed
                  dates at all, so a visitor could pick one freely and
                  would only find out it was rejected after reaching the
                  payment step (services.is_date_open_for_booking's 409
                  Conflict, "This date is closed to online booking."). */}
              <AvailabilityDatePicker value={visitDate} onChange={setVisitDate} />
            </Card>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setCurrentStep('category')}>
                <ArrowLeft className="w-4 h-4" /> {t('back') || 'Back'}
              </Button>
              <Button
                className="bg-brand-primary hover:bg-primary-700"
                disabled={!visitDate}
                onClick={handleDateTimeNext}
              >
                {t('continue')} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );

      case 'payment':
        return (
          <BookingSummary
            items={items}
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
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-stone-900">
              {t('book_a_visit') || 'Book a Visit'}
            </h1>
            <StepIndicator
              steps={steps}
              current={stepIndex}
              className="mt-4"
            />
          </div>
          {/* Compact echo of the landing-page hero motif, sized down so
              it reads as chrome rather than competing with the wizard
              for attention. Hidden on small screens where the step
              indicator already needs the full width. */}
          <OrbitMotif size="compact" className="hidden sm:block w-16 h-16 shrink-0 mt-1" />
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