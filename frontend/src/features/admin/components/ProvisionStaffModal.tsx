'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import type { StaffAccountResponse } from '../api';
import { staffAccountSchema, type StaffCreateInput, type StaffUpdateInput } from '../schemas';

interface ProvisionStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: StaffCreateInput | StaffUpdateInput) => Promise<void>;
  initialData?: StaffAccountResponse | null;
  isSubmitting?: boolean;
}

export function ProvisionStaffModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  isSubmitting = false,
}: ProvisionStaffModalProps) {
  const { t } = useTranslation();

  const [formData, setFormData] = useState<StaffCreateInput>({
    email: '',
    phone: '',
    fullName: '',
    role: 'cashier',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isEditing = !!initialData;

  useEffect(() => {
    if (initialData) {
      setFormData({
        email: initialData.email,
        phone: initialData.phone || '',
        fullName: initialData.fullName,
        role: initialData.role === 'platform_admin' ? 'museum_manager' : initialData.role,
      });
    } else {
      setFormData({
        email: '',
        phone: '',
        fullName: '',
        role: 'cashier',
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  const handleChange = (field: keyof StaffCreateInput, value: string) => {
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
    const result = staffAccountSchema.safeParse(formData);
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

    try {
      await onSubmit(formData);
      setToast({
        message: isEditing
          ? t('staff_updated') || 'Staff account updated successfully!'
          : t('staff_created') || 'Staff account created successfully!',
        type: 'success',
      });
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error: any) {
      setToast({
        message: error.message || t('operation_failed') || 'Operation failed. Please try again.',
        type: 'error',
      });
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditing ? t('edit_staff') || 'Edit Staff Account' : t('create_staff') || 'Create Staff Account'}
    >
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          id="fullName"
          label={t('full_name') || 'Full Name'}
          value={formData.fullName}
          onChange={(e) => handleChange('fullName', e.target.value)}
          error={errors.fullName}
          required
          placeholder="e.g., Nurul Hana"
        />

        <TextField
          id="email"
          label={t('email')}
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          error={errors.email}
          required
          placeholder="staff@museum.et"
        />

        <TextField
          id="phone"
          label={t('phone')}
          value={formData.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          error={errors.phone}
          placeholder="+251 912 345 678"
        />

        <div>
          <label className="text-sm font-medium text-stone-700">
            {t('role') || 'Role'}
          </label>
          <select
            value={formData.role}
            onChange={(e) => handleChange('role', e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="cashier">{t('cashier') || 'Cashier'}</option>
            <option value="museum_manager">{t('museum_manager') || 'Museum Manager'}</option>
          </select>
          {errors.role && (
            <span className="text-xs text-red-500 mt-1">{errors.role}</span>
          )}
        </div>

        {!isEditing && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            <span className="font-semibold">📌 {t('temp_password_note') || 'Temporary Password'}</span>
            <p className="mt-1">
              {t('temp_password_description') || 'A temporary password will be sent to the staff email address upon account creation. The staff member can reset it on first login.'}
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-stone-100">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('cancel') || 'Cancel'}
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-amber-600 hover:bg-amber-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
                {t('saving') || 'Saving...'}
              </>
            ) : (
              isEditing ? t('update') || 'Update' : t('create') || 'Create'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
