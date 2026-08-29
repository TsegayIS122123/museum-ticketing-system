'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StaffAccountTable } from '@/features/admin/components/StaffAccountTable';
import { ProvisionStaffModal } from '@/features/admin/components/ProvisionStaffModal';
import { getStaffAccounts, createStaffAccount, updateStaffAccount, deactivateStaffAccount, activateStaffAccount, type StaffAccountResponse } from '@/features/admin/api';
import type { StaffCreateInput, StaffUpdateInput } from '@/features/admin/schemas';

export default function StaffManagementPage() {
  const { t } = useTranslation();

  const [staff, setStaff] = useState<StaffAccountResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StaffAccountResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    id: string;
    action: 'deactivate' | 'activate';
  }>({ open: false, id: '', action: 'deactivate' });

  const loadStaff = async () => {
    setIsLoading(true);
    try {
      const data = await getStaffAccounts();
      setStaff(data);
    } catch (error: any) {
      setToast({
        message: error.message || t('failed_to_load') || 'Failed to load staff accounts.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleCreate = () => {
    setEditingAccount(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (account: StaffAccountResponse) => {
    setEditingAccount(account);
    setIsFormModalOpen(true);
  };

  const handleSubmit = async (data: StaffCreateInput | StaffUpdateInput) => {
    setIsSubmitting(true);
    try {
      if (editingAccount) {
        const updated = await updateStaffAccount(editingAccount.id, data);
        setStaff((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );
      } else {
        const created = await createStaffAccount(data as StaffCreateInput);
        setStaff((prev) => [...prev, created]);
      }
      setIsFormModalOpen(false);
      setEditingAccount(null);
      await loadStaff();
    } catch (error: any) {
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = (id: string) => {
    setConfirmDialog({ open: true, id, action: 'deactivate' });
  };

  const handleActivate = (id: string) => {
    setConfirmDialog({ open: true, id, action: 'activate' });
  };

  const handleConfirmAction = async () => {
    const { id, action } = confirmDialog;
    setConfirmDialog({ open: false, id: '', action: 'deactivate' });

    try {
      if (action === 'deactivate') {
        await deactivateStaffAccount(id);
        setToast({
          message: t('staff_deactivated') || 'Staff account deactivated successfully.',
          type: 'success',
        });
      } else {
        await activateStaffAccount(id);
        setToast({
          message: t('staff_activated') || 'Staff account activated successfully.',
          type: 'success',
        });
      }
      await loadStaff();
    } catch (error: any) {
      setToast({
        message: error.message || t('operation_failed') || 'Operation failed.',
        type: 'error',
      });
    }
  };

  const activeCount = staff.filter((s) => s.active).length;
  const inactiveCount = staff.filter((s) => !s.active).length;

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
            {t('staff_accounts') || 'Staff Accounts'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('staff_accounts_description') || 'Manage cashier and museum manager accounts'}
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
          className="bg-amber-600 hover:bg-amber-700"
          onClick={handleCreate}
        >
          + {t('create_staff') || 'Create Staff Account'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label={t('total_staff') || 'Total Staff'}
          value={staff.length}
          sub={t('all_accounts') || 'All accounts'}
        />
        <StatCard
          label={t('active') || 'Active'}
          value={activeCount}
          sub={t('currently_active') || 'Currently active'}
          color="green"
        />
        <StatCard
          label={t('inactive') || 'Inactive'}
          value={inactiveCount}
          sub={t('deactivated') || 'Deactivated'}
          color="red"
        />
      </div>

      <StaffAccountTable
        staff={staff}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
        onRefresh={loadStaff}
      />

      <ProvisionStaffModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingAccount(null);
        }}
        onSubmit={handleSubmit}
        initialData={editingAccount}
        isSubmitting={isSubmitting}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, id: '', action: 'deactivate' })}
        onConfirm={handleConfirmAction}
        title={confirmDialog.action === 'deactivate'
          ? t('deactivate_account') || 'Deactivate Account'
          : t('activate_account') || 'Activate Account'}
        message={confirmDialog.action === 'deactivate'
          ? t('deactivate_confirmation') || 'Are you sure you want to deactivate this staff account? The staff member will no longer be able to log in.'
          : t('activate_confirmation') || 'Are you sure you want to activate this staff account? The staff member will regain access immediately.'}
        confirmLabel={confirmDialog.action === 'deactivate'
          ? t('deactivate') || 'Deactivate'
          : t('activate') || 'Activate'}
        danger={confirmDialog.action === 'deactivate'}
      />
    </PageContainer>
  );
}
