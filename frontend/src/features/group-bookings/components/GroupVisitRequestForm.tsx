'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import { submitGroupBooking } from '../api';
import { groupVisitRequestSchema } from '../schemas';

interface GroupVisitRequestFormProps {
  onSuccess?: () => void;
}

export function GroupVisitRequestForm({ onSuccess }: GroupVisitRequestFormProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [formData, setFormData] = useState({
    organizationName: '',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    visitDate: '',
    visitTime: '',
    groupSize: 10,
    category: 'student' as const,
    specialRequests: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
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
      const booking = await submitGroupBooking(formData);
      setToast({
        message: t('group_request_submitted') || 'Group visit request submitted successfully! You will be notified once approved.',
        type: 'success',
      });

      if (onSuccess) {
        onSuccess();
      } else {
        // Redirect to bookings page after short delay
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
            {t('organization_details') || 'Organization Details'}
          </h3>

          <TextField
            id="organizationName"
            label={t('organization_school_name') || 'Organization / School Name'}
            placeholder="e.g., Addis Ababa University"
            value={formData.organizationName}
            onChange={(e) => handleChange('organizationName', e.target.value)}
            error={errors.organizationName}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
              id="contactPerson"
              label={t('contact_person') || 'Contact Person'}
              placeholder="e.g., Dr. Tadesse"
              value={formData.contactPerson}
              onChange={(e) => handleChange('contactPerson', e.target.value)}
              error={errors.contactPerson}
              required
            />
            <TextField
              id="contactPhone"
              label={t('phone')}
              placeholder="+251 912 345 678"
              value={formData.contactPhone}
              onChange={(e) => handleChange('contactPhone', e.target.value)}
              error={errors.contactPhone}
              required
            />
          </div>

          <TextField
            id="contactEmail"
            label={t('email')}
            type="email"
            placeholder="contact@school.edu.et"
            value={formData.contactEmail}
            onChange={(e) => handleChange('contactEmail', e.target.value)}
            error={errors.contactEmail}
            required
          />
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
                className={`w-full mt-1 px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.visitDate ? 'border-red-400' : 'border-stone-300'
                }`}
              />
              {errors.visitDate && (
                <span className="text-xs text-red-500 mt-1">{errors.visitDate}</span>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-stone-700">
                {t('visit_time') || 'Visit Time'} *
              </label>
              <select
                value={formData.visitTime}
                onChange={(e) => handleChange('visitTime', e.target.value)}
                className={`w-full mt-1 px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.visitTime ? 'border-red-400' : 'border-stone-300'
                }`}
              >
                <option value="">{t('select_time') || 'Select time'}</option>
                {['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'].map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
              {errors.visitTime && (
                <span className="text-xs text-red-500 mt-1">{errors.visitTime}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-stone-700">
                {t('group_size') || 'Group Size'} *
              </label>
              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => handleChange('groupSize', Math.max(10, formData.groupSize - 5))}
                  className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50"
                >
                  −
                </button>
                <input
                  type="number"
                  value={formData.groupSize}
                  onChange={(e) => handleChange('groupSize', parseInt(e.target.value) || 10)}
                  min={10}
                  max={200}
                  className={`w-20 text-center px-2 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    errors.groupSize ? 'border-red-400' : 'border-stone-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => handleChange('groupSize', Math.min(200, formData.groupSize + 5))}
                  className="w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center hover:bg-stone-50"
                >
                  +
                </button>
                <span className="text-sm text-stone-500">(min 10, max 200)</span>
              </div>
              {errors.groupSize && (
                <span className="text-xs text-red-500 mt-1">{errors.groupSize}</span>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-stone-700">
                {t('category')} *
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="student">{t('student')}</option>
                <option value="adult_teacher">{t('adult_teacher')}</option>
                <option value="foreign_resident">{t('foreign_resident')}</option>
                <option value="non_resident">{t('non_resident')}</option>
                <option value="exempt">{t('exempt')}</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-stone-900">
            {t('additional_info') || 'Additional Information'}
          </h3>

          <div>
            <label className="text-sm font-medium text-stone-700">
              {t('special_requests') || 'Special Requests'}
            </label>
            <textarea
              value={formData.specialRequests}
              onChange={(e) => handleChange('specialRequests', e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={3}
              placeholder={t('special_requests_placeholder') || 'Any special needs or requests? (e.g., wheelchair access, specific time requirements)'}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            <span className="font-semibold">📌 {t('group_booking_note') || 'Important Information'}</span>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
              <li>{t('group_booking_note_1') || 'Group bookings require Manager approval before payment'}</li>
              <li>{t('group_booking_note_2') || 'You will be notified via email once your request is reviewed'}</li>
              <li>{t('group_booking_note_3') || 'A minimum of 10 visitors is required for group bookings'}</li>
              <li>{t('group_booking_note_4') || 'Please submit your request at least 3 business days in advance'}</li>
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
          className="flex-1 bg-amber-600 hover:bg-amber-700"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('submitting') || 'Submitting...' : t('submit_request') || 'Submit Request →'}
        </Button>
      </div>
    </form>
  );
}
