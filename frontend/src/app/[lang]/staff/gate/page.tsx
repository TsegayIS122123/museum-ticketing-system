'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { ReferenceLookupField } from '@/features/entrance/components/ReferenceLookupField';
import { AttendanceEntryForm } from '@/features/entrance/components/AttendanceEntryForm';
import { lookupBooking, type BookingLookupResponse } from '@/features/entrance/api';
import { Toast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';

type ViewState = 'idle' | 'loading' | 'found' | 'not_found' | 'error';

export default function GatePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [state, setState] = useState<ViewState>('idle');
  const [booking, setBooking] = useState<BookingLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleLookup = async (reference: string) => {
    setState('loading');
    setError(null);
    setBooking(null);

    try {
      const result = await lookupBooking(reference);
      setBooking(result);
      setState('found');
    } catch (err: any) {
      setError(err.message || t('booking_not_found') || 'Booking not found. Please check the reference and try again.');
      setState('not_found');
    }
  };

  const handleCheckInComplete = () => {
    setToast({
      message: t('check_in_complete') || 'Check-in completed successfully!',
      type: 'success',
    });
    // Reset to idle after a moment
    setTimeout(() => {
      setState('idle');
      setBooking(null);
    }, 2000);
  };

  const handleCancel = () => {
    setState('idle');
    setBooking(null);
    setError(null);
  };

  const handleReset = () => {
    setState('idle');
    setBooking(null);
    setError(null);
  };

  return (
    <PageContainer maxWidth="lg">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="font-serif text-3xl text-stone-900">
          {t('gate_check_in') || 'Gate Check-in'}
        </h1>
        <p className="text-stone-500 mt-1">
          {t('gate_check_in_description') || 'Look up bookings and record visitor attendance'}
        </p>
        {user && (
          <div className="text-sm text-stone-400 mt-1">
            {t('cashier')}: {user.fullName || user.email} · {new Date().toLocaleDateString()}
          </div>
        )}
      </div>

      {state === 'idle' && (
        <div className="space-y-6">
          <ReferenceLookupField
            onLookup={handleLookup}
            isLoading={state === 'loading'}
            error={null}
          />
          <Card className="bg-stone-50 border-dashed border-2 border-stone-200">
            <div className="text-center py-8">
              <div className="text-5xl mb-3">🚪</div>
              <h3 className="font-semibold text-stone-700">
                {t('ready_to_check_in') || 'Ready to Check In Visitors'}
              </h3>
              <p className="text-sm text-stone-400 max-w-sm mx-auto mt-1">
                {t('ready_to_check_in_description') || 'Type or scan a booking reference to start the check-in process.'}
              </p>
              <div className="mt-4 text-xs text-stone-400">
                💡 {t('keyboard_wedge_hint') || 'Keyboard wedge QR scanners work in the reference field'}
              </div>
            </div>
          </Card>
        </div>
      )}

      {state === 'loading' && (
        <Card>
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-stone-500 mt-4">{t('searching') || 'Searching for booking...'}</p>
          </div>
        </Card>
      )}

      {state === 'not_found' && (
        <Card className="bg-red-50 border-red-200">
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🔍</div>
            <h3 className="font-semibold text-red-800">
              {t('booking_not_found') || 'Booking Not Found'}
            </h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <div className="mt-4 flex gap-3 justify-center">
              <button
                onClick={handleReset}
                className="text-sm text-red-700 hover:text-red-900 underline"
              >
                {t('try_again') || 'Try Again'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {state === 'found' && booking && (
        <AttendanceEntryForm
          booking={booking}
          onCheckInComplete={handleCheckInComplete}
          onCancel={handleCancel}
        />
      )}
    </PageContainer>
  );
}
