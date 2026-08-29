'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import type { Category } from '@/lib/constants/categories';
import { categorySchema, type CategoryFormInput } from '../schemas';

interface CategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CategoryFormInput) => Promise<void>;
  initialData?: Category | null;
  isSubmitting?: boolean;
}

export function CategoryFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  isSubmitting = false,
}: CategoryFormModalProps) {
  const { t } = useTranslation();

  const [formData, setFormData] = useState<CategoryFormInput>({
    nameEn: '',
    nameAm: '',
    priceEtb: 0,
    isFree: false,
    descriptionEn: '',
    descriptionAm: '',
    active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isEditing = !!initialData;

  useEffect(() => {
    if (initialData) {
      setFormData({
        nameEn: initialData.nameEn,
        nameAm: initialData.nameAm,
        priceEtb: initialData.priceEtb,
        isFree: initialData.isFree,
        descriptionEn: initialData.descriptionEn || '',
        descriptionAm: initialData.descriptionAm || '',
        active: initialData.active,
      });
    } else {
      setFormData({
        nameEn: '',
        nameAm: '',
        priceEtb: 0,
        isFree: false,
        descriptionEn: '',
        descriptionAm: '',
        active: true,
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  const handleChange = (field: keyof CategoryFormInput, value: string | number | boolean) => {
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
    const result = categorySchema.safeParse(formData);
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
          ? t('category_updated') || 'Category updated successfully!'
          : t('category_created') || 'Category created successfully!',
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

  const isFree = formData.isFree;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditing ? t('edit_category') || 'Edit Category' : t('add_category') || 'Add Category'}
    >
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            id="nameEn"
            label={t('name_english') || 'Name (English)'}
            value={formData.nameEn}
            onChange={(e) => handleChange('nameEn', e.target.value)}
            error={errors.nameEn}
            required
            placeholder="e.g., Adult / Teacher"
          />
          <TextField
            id="nameAm"
            label={t('name_amharic') || 'Name (Amharic)'}
            value={formData.nameAm}
            onChange={(e) => handleChange('nameAm', e.target.value)}
            error={errors.nameAm}
            required
            placeholder="e.g., አዋቂ / መምህር"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-stone-700">
              {t('price') || 'Price (ETB)'}
            </label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="number"
                value={formData.priceEtb}
                onChange={(e) => handleChange('priceEtb', parseFloat(e.target.value) || 0)}
                min={0}
                step={1}
                disabled={isFree}
                className={`w-full px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.priceEtb ? 'border-red-400' : 'border-stone-300'
                } ${isFree ? 'bg-stone-100 text-stone-400' : ''}`}
              />
            </div>
            {errors.priceEtb && (
              <span className="text-xs text-red-500 mt-1">{errors.priceEtb}</span>
            )}
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => {
                  handleChange('isFree', e.target.checked);
                  if (e.target.checked) {
                    handleChange('priceEtb', 0);
                  }
                }}
                className="w-4 h-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-stone-700">
                {t('free_category') || 'Free Category (Exempt/AAU Staff)'}
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            id="descriptionEn"
            label={t('description_english') || 'Description (English)'}
            value={formData.descriptionEn}
            onChange={(e) => handleChange('descriptionEn', e.target.value)}
            error={errors.descriptionEn}
            placeholder="e.g., Standard adult admission"
          />
          <TextField
            id="descriptionAm"
            label={t('description_amharic') || 'Description (Amharic)'}
            value={formData.descriptionAm}
            onChange={(e) => handleChange('descriptionAm', e.target.value)}
            error={errors.descriptionAm}
            placeholder="e.g., መደበኛ የአዋቂ መግቢያ"
          />
        </div>

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
