'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { DateCategoryPicker } from '@/features/booking/components/DateCategoryPicker';
import { BookingSummary } from '@/features/booking/components/BookingSummary';
import { createBooking } from '@/features/booking/api';
import { Toast } from '@/components/ui/Toast';

type Step = 'category' | 'datetime' | 'details' | 'payment';

export default function BookPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('category');
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitorName, setVisitorName] = useState(user?.fullName || '');
  const [visitorEmail, setVisitorEmail] = useState(user?.email || '');
  const [visitorPhone, setVisitorPhone] = useState(user?.phone || '');
  const [specialRequests, setSpecialRequests] = useState('');

  const steps = [
    t('tickets') || 'Tickets',
    t('date_time') || 'Date & Time',
    t('details') || 'Details',
    t('payment') || 'Payment',
  ];

  const stepIndex = steps.indexOf(t(steps[currentStep] as any) || 'Tickets');

  const handleCategoryNext = () => {
    if (categoryId && quantity > 0) {
      setCurrentStep('datetime');
    }
  };

  const handleDateTimeNext = () => {
    if (visitDate && visitTime) {
      setCurrentStep('details');
    }
  };

  const handleDetailsNext = () => {
    if (visitorName && visitorEmail && visitorPhone) {
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
        visitorName,
        visitorEmail,
        visitorPhone,
        specialRequests: specialRequests || undefined,
      });

      // Redirect to checkout (if URL provided) or confirmation
      if (booking.checkoutUrl) {
        window.location.href = booking.checkoutUrl;
      } else {
        router.push(`/${locale}/book/confirmation?reference=${booking.reference}`);
      }
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
                {t('date_time') || 'Date & Time'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    {t('date') || 'Date'}
                  </label>
                  <input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    {t('time') || 'Time'}
                  </label>
                  <select
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">{t('select_time') || 'Select time'}</option>
                    {['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'].map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setCurrentStep('category')}>
                ← {t('back') || 'Back'}
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                disabled={!visitDate || !visitTime}
                onClick={handleDateTimeNext}
              >
                {t('continue')} →
              </Button>
            </div>
          </div>
        );

      case 'details':
        return (
          <div className="space-y-6">
            <Card>
              <h3 className="text-lg font-semibold text-stone-900 mb-4">
                {t('visitor_details') || 'Visitor Details'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    {t('full_name') || 'Full Name'} *
                  </label>
                  <input
                    type="text"
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder={t('enter_full_name') || 'Enter your full name'}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    {t('email')} *
                  </label>
                  <input
                    type="email"
                    value={visitorEmail}
                    onChange={(e) => setVisitorEmail(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    {t('phone')} *
                  </label>
                  <input
                    type="tel"
                    value={visitorPhone}
                    onChange={(e) => setVisitorPhone(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="+251 912 345 678"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    {t('special_requests') || 'Special Requests'}
                  </label>
                  <textarea
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    rows={3}
                    placeholder={t('special_requests_placeholder') || 'Any special needs or requests?'}
                  />
                </div>
              </div>
            </Card>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setCurrentStep('datetime')}>
                ← {t('back') || 'Back'}
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                disabled={!visitorName || !visitorEmail || !visitorPhone}
                onClick={handleDetailsNext}
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
            visitTime={visitTime}
            visitorName={visitorName}
            visitorEmail={visitorEmail}
            visitorPhone={visitorPhone}
            specialRequests={specialRequests}
            onBack={() => setCurrentStep('details')}
            onConfirm={handleConfirmBooking}
            isProcessing={isProcessing}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
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

// Import Card for the datetime step
import { Card } from '@/components/ui/Card';
