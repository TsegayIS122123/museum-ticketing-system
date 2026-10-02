'use client';

import { useState } from 'react';
import { SearchX, DoorOpen, Lightbulb } from 'lucide-react';
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
      setError(err.message || t('booking_not_found_message') || 'Booking not found. Please check the reference and try again.');
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

      <div className="mb-4">
        <h1 className="font-serif font-semibold text-2xl text-stone-900">
          {t('gate_check_in') || 'Gate Check-in'}
        </h1>
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-stone-500 mt-0.5">
          <span>{t('gate_check_in_description') || 'Look up bookings and record visitor attendance'}</span>
          {user && (
            <span className="text-stone-500">
              · {t('cashier')}: {user.full_name || user.email} · {new Date().toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {state === 'idle' && (
        <div className="space-y-4">
          {/* isLoading is always false here, not a placeholder --
              this whole block only renders when state === 'idle', so
              TypeScript correctly narrows state to the literal 'idle'
              within it and flags `state === 'loading'` as impossible.
              The separate `state === 'loading'` block below (a
              full-page spinner) is what actually renders during a
              lookup. */}
          <ReferenceLookupField
            onLookup={handleLookup}
            isLoading={false}
            error={null}
          />
          <Card className="bg-stone-50 border-dashed border border-stone-200">
            <div className="text-center py-5">
              <div className="mb-2 flex justify-center text-stone-500">
                <DoorOpen className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-semibold text-stone-700">
                {t('ready_to_check_in') || 'Ready to Check In Visitors'}
              </h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1">
                {t('ready_to_check_in_description') || 'Type or scan a booking reference to start the check-in process.'}
              </p>
              <div className="mt-3 text-xs text-stone-500 flex items-center justify-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> {t('keyboard_wedge_hint') || 'Keyboard wedge QR scanners work in the reference field'}
              </div>
            </div>
          </Card>
        </div>
      )}

      {state === 'loading' && (
        <Card>
          <div className="text-center py-8">
            <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-stone-500 mt-3 text-sm">{t('searching_for_booking') || 'Searching for booking...'}</p>
          </div>
        </Card>
      )}

      {state === 'not_found' && (
        <Card className="bg-red-50 border-red-200">
          <div className="text-center py-8">
            <div className="mb-3 flex justify-center text-red-400">
              <SearchX className="w-12 h-12" />
            </div>
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
