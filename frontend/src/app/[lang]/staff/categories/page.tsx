'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryTable } from '@/features/catalog/components/CategoryTable';
import { CategoryFormModal } from '@/features/catalog/components/CategoryFormModal';
import { getCategories, createCategory, updateCategory, retireCategory, activateCategory } from '@/features/catalog/api';
import type { Category, CategoryFormInput } from '@/features/catalog/schemas';

export default function CategoriesPage() {
  const { t } = useTranslation();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    id: string;
    action: 'retire' | 'activate';
  }>({ open: false, id: '', action: 'retire' });

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      // Museum Manager-only `?active=all` -- includes retired categories
      // so "Activate" works on rows retired in an earlier session, not
      // just ones retired moments ago in this one.
      const data = await getCategories({ includeInactive: true });
      setCategories(data);
    } catch (error: any) {
      setToast({
        message: error.message || t('failed_to_load') || 'Failed to load categories.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadCategories();
    })();
    // `loadCategories` intentionally excluded: it's redefined every
    // render (and calls setState itself), so including it here would
    // refetch on every render instead of just once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = () => {
    setEditingCategory(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setIsFormModalOpen(true);
  };

  const handleSubmit = async (data: CategoryFormInput) => {
    setIsSubmitting(true);
    try {
      if (editingCategory) {
        const updated = await updateCategory(editingCategory.id, data);
        setCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        );
      } else {
        const created = await createCategory(data);
        setCategories((prev) => [...prev, created]);
      }
      setIsFormModalOpen(false);
      setEditingCategory(null);
      await loadCategories();
    } catch (error: any) {
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetire = (id: string) => {
    setConfirmDialog({ open: true, id, action: 'retire' });
  };

  const handleActivate = (id: string) => {
    setConfirmDialog({ open: true, id, action: 'activate' });
  };

  const handleConfirmAction = async () => {
    const { id, action } = confirmDialog;
    setConfirmDialog({ open: false, id: '', action: 'retire' });

    try {
      if (action === 'retire') {
        await retireCategory(id);
        setToast({
          message: t('category_retired') || 'Category retired successfully.',
          type: 'success',
        });
      } else {
        await activateCategory(id);
        setToast({
          message: t('category_activated') || 'Category activated successfully.',
          type: 'success',
        });
      }
      await loadCategories();
    } catch (error: any) {
      setToast({
        message: error.message || t('operation_failed') || 'Operation failed.',
        type: 'error',
      });
    }
  };

  const activeCount = categories.filter((c) => c.active).length;
  const inactiveCount = categories.filter((c) => !c.active).length;

  return (
    <PageContainer>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-stone-900">
            {t('ticket_categories') || 'Ticket Categories'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('ticket_categories_description') || 'Manage ticket categories, pricing, and availability'}
          </p>
          <div className="flex gap-4 mt-2 text-sm">
            <span className="text-stone-500">
              {t('active') || 'Active'}: <span className="font-semibold text-green-600">{activeCount}</span>
            </span>
            <span className="text-stone-500">
              {t('inactive') || 'Inactive'}: <span className="font-semibold text-stone-400">{inactiveCount}</span>
            </span>
          </div>
        </div>
        <Button
          size="lg"
          className="bg-brand-primary hover:bg-primary-700"
          onClick={handleCreate}
        >
          + {t('add_category') || 'Add Category'}
        </Button>
      </div>

      <CategoryTable
        categories={categories}
        isLoading={isLoading}
        onEdit={handleEdit}
        onRetire={handleRetire}
        onActivate={handleActivate}
        onRefresh={loadCategories}
      />

      <CategoryFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingCategory(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingCategory}
        isSubmitting={isSubmitting}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, id: '', action: 'retire' })}
        onConfirm={handleConfirmAction}
        title={confirmDialog.action === 'retire'
          ? t('retire_category') || 'Retire Category'
          : t('activate_category') || 'Activate Category'}
        message={confirmDialog.action === 'retire'
          ? t('retire_category_confirmation') || 'Are you sure you want to retire this category? Existing tickets will not be affected.'
          : t('activate_category_confirmation') || 'Are you sure you want to activate this category? It will become available for booking.'}
        confirmLabel={confirmDialog.action === 'retire'
          ? t('retire') || 'Retire'
          : t('activate') || 'Activate'}
        danger={confirmDialog.action === 'retire'}
      />
    </PageContainer>
  );
}
