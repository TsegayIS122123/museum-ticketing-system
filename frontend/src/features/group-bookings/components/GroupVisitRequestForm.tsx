'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import { submitGroupBooking } from '../api';
import { groupVisitRequestSchema } from '../schemas';
import { getCategories } from '@/features/catalog/api';
import type { Category } from '@/features/catalog/schemas';

interface GroupVisitRequestFormProps {
  onSuccess?: () => void;
}

export function GroupVisitRequestForm({ onSuccess }: GroupVisitRequestFormProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // POST /bookings/ requires the visitor to already be logged in/OTP
  // verified -- there is no anonymous path. Redirect rather than let the
  // submit silently 401.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/${locale}/verify?next=/${locale}/group-visits/new`);
    }
  }, [authLoading, isAuthenticated, locale, router]);

  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const [formData, setFormData] = useState({
    categoryId: '',
    visitDate: '',
    quantity: 10,
    groupName: '',
    groupContactPhone: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const result = groupVisitRequestSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      setToast({
        message: t('please_fix_errors') || 'Please fix the errors in the form.',
        type: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitGroupBooking({
        categoryId: formData.categoryId,
        visitDate: formData.visitDate,
        quantity: formData.quantity,
        groupName: formData.groupName || null,
        groupContactPhone: formData.groupContactPhone || null,
      });
      setToast({
        message: t('group_request_submitted') || 'Group visit request submitted successfully! You will be notified once approved.',
        type: 'success',
      });

      if (onSuccess) {
        onSuccess();
      } else {
        setTimeout(() => {
          router.push(`/${locale}/bookings`);
        }, 3000);
      }
    } catch (error: any) {
      setToast({
        message: error.message || t('group_request_failed') || 'Failed to submit group visit request.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-stone-900">
            {t('group_details') || 'Group Details'}
          </h3>

          <TextField
            id="groupName"
            label={t('group_name') || 'Group / School Name (optional)'}
            placeholder="e.g., Addis Ababa University"
            value={formData.groupName}
            onChange={(e) => handleChange('groupName', e.target.value)}
            error={errors.groupName}
          />

          <TextField
            id="groupContactPhone"
            label={t('group_contact_phone') || 'Group Contact Phone (optional)'}
            placeholder="+251 912 345 678"
            value={formData.groupContactPhone}
            onChange={(e) => handleChange('groupContactPhone', e.target.value)}
            error={errors.groupContactPhone}
          />

          {/* No organization/contact-person/email/visit-time/special-requests
              fields here -- none of them exist on the backend
              (BookingCreateRequest). Your account's own email/phone are
              used for any notifications. */}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-stone-900">
            {t('visit_details') || 'Visit Details'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-stone-700">
                {t('visit_date') || 'Visit Date'} *
              </label>
              <input
                type="date"
                value={formData.visitDate}
                onChange={(e) => handleChange('visitDate', e.target.value)}
                min={today}
                className={`w-full mt-1 px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500 ${
                  errors.visitDate ? 'border-red-400' : 'border-stone-300'
                }`}
              />
              {errors.visitDate && (
                <span className="text-xs text-red-500 mt-1">{errors.visitDate}</span>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-stone-700">
                {t('category')} *
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => handleChange('categoryId', e.target.value)}
                className={`w-full mt-1 px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500 ${
                  errors.categoryId ? 'border-red-400' : 'border-stone-300'
                }`}
              >
                <option value="">{t('select_category') || 'Select category'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === 'en' ? c.name_en : c.name_am}
                    {` (ETB ${c.price_etb})`}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <span className="text-xs text-red-500 mt-1">{errors.categoryId}</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-stone-700">
              {t('group_size') || 'Group Size'} *
            </label>
            <div className="flex items-center gap-3 mt-1">
              <button
                type="button"
                onClick={() => handleChange('quantity', Math.max(1, formData.quantity - 5))}
                className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50"
              >
                −
              </button>
              <input
                type="number"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', parseInt(e.target.value) || 1)}
                min={1}
                className={`w-20 text-center px-2 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500 ${
                  errors.quantity ? 'border-red-400' : 'border-stone-300'
                }`}
              />
              <button
                type="button"
                onClick={() => handleChange('quantity', formData.quantity + 5)}
                className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50"
              >
                +
              </button>
            </div>
            {errors.quantity && (
              <span className="text-xs text-red-500 mt-1">{errors.quantity}</span>
            )}
          </div>

          <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-3 text-sm text-secondary-700">
            <span className="font-semibold">📌 {t('group_booking_note') || 'Important Information'}</span>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
              <li>{t('group_booking_note_1') || 'Group bookings require Manager approval before payment'}</li>
              <li>{t('group_booking_note_2') || 'You will be notified once your request is reviewed'}</li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={() => router.push(`/${locale}`)}
          disabled={isSubmitting}
        >
          {t('cancel') || 'Cancel'}
        </Button>
        <Button
          type="submit"
          size="lg"
          className="flex-1 bg-primary-600 hover:bg-primary-700"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('submitting') || 'Submitting...' : t('submit_request') || 'Submit Request →'}
        </Button>
      </div>
    </form>
  );
}
