'use client';

import { useState } from 'react';
import { Pin } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import type { StaffAccountResponse } from '../api';
import { staffCreateSchema, staffUpdateSchema, type StaffCreateInput, type StaffUpdateInput } from '../schemas';

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
    full_name: '',
    role: 'cashier',
  });
  const [editRole, setEditRole] = useState<'cashier' | 'museum_manager'>('cashier');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isEditing = !!initialData;

  // Reset the form fields whenever the modal is (re)opened or handed a
  // different account to edit -- adjusted during render rather than in
  // an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (initialData !== prevInitialData || isOpen !== prevIsOpen) {
    setPrevInitialData(initialData);
    setPrevIsOpen(isOpen);

    if (initialData) {
      setFormData({
        email: initialData.email,
        phone: initialData.phone || '',
        full_name: initialData.full_name,
        role:
          initialData.role === 'platform_admin' || initialData.role === 'visitor'
            ? 'museum_manager'
            : initialData.role,
      });
      setEditRole(
        initialData.role === 'platform_admin' || initialData.role === 'visitor'
          ? 'museum_manager'
          : initialData.role
      );
    } else {
      setFormData({
        email: '',
        phone: '',
        full_name: '',
        role: 'cashier',
      });
    }
    setErrors({});
  }

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
    if (isEditing) {
      // Nothing to validate client-side for edit mode -- editRole is
      // always one of the two valid enum values from the <select>.
      setErrors({});
      return true;
    }
    const result = staffCreateSchema.safeParse(formData);
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
      await onSubmit(
        isEditing
          ? {
              email: formData.email,
              phone: formData.phone,
              full_name: formData.full_name,
              role: editRole,
            }
          : formData
      );
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
        {isEditing && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs text-stone-500">
            {t('staff_edit_note') ||
              'Changing email or phone invalidates the current password setup link. A new link must be requested separately.'}
          </div>
        )}

        <TextField
          id="full_name"
          label={t('full_name') || 'Full Name'}
          value={formData.full_name}
          onChange={(e) => handleChange('full_name', e.target.value)}
          error={errors.full_name}
          required={!isEditing}
          placeholder="e.g., Nurul Hana"
        />

        <TextField
          id="email"
          label={t('email')}
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          error={errors.email}
          required={!isEditing}
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
          <label htmlFor="staff-role" className="text-sm font-medium text-stone-700">
            {t('role') || 'Role'}
          </label>
          <select
            id="staff-role"
            value={isEditing ? editRole : formData.role}
            onChange={(e) =>
              isEditing
                ? setEditRole(e.target.value as 'cashier' | 'museum_manager')
                : handleChange('role', e.target.value)
            }
            className="w-full mt-1 px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary-500"
          >
            <option value="cashier">{t('cashier') || 'Cashier'}</option>
            <option value="museum_manager">{t('museum_manager') || 'Museum Manager'}</option>
          </select>
          {errors.role && (
            <span className="text-xs text-red-500 mt-1">{errors.role}</span>
          )}
        </div>

        {!isEditing && (
          <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-3 text-xs text-secondary-700">
            <span className="font-semibold inline-flex items-center gap-1.5"><Pin className="w-3.5 h-3.5" /> {t('set_password_note') || 'Set-Password Link'}</span>
            <p className="mt-1">
              {t('set_password_note_description') || 'The new account has no password yet. A link to set one will be sent to the staff email address; there is no temporary password to reset.'}
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
            className="flex-1 bg-brand-primary hover:bg-primary-700"
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
