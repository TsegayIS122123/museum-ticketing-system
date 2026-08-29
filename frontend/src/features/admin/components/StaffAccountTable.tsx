'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { StaffAccountResponse } from '../api';

interface StaffAccountTableProps {
  staff: StaffAccountResponse[];
  isLoading?: boolean;
  onEdit: (account: StaffAccountResponse) => void;
  onDeactivate: (id: string) => void;
  onActivate: (id: string) => void;
  onRefresh?: () => void;
}

export function StaffAccountTable({
  staff,
  isLoading = false,
  onEdit,
  onDeactivate,
  onActivate,
  onRefresh,
}: StaffAccountTableProps) {
  const { t } = useTranslation();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'cashier':
        return <StatusBadge status="pending" />;
      case 'museum_manager':
        return <StatusBadge status="pending_approval" />;
      case 'platform_admin':
        return <StatusBadge status="visited" />;
      default:
        return <StatusBadge status="pending" />;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-60 bg-stone-100 rounded" />
      </Card>
    );
  }

  if (staff.length === 0) {
    return (
      <EmptyState
        icon="👤"
        title={t('no_staff') || 'No Staff Accounts'}
        description={t('no_staff_description') || 'Create your first staff account to get started.'}
      />
    );
  }

  const headers = [
    t('name') || 'Name',
    t('email') || 'Email',
    t('role') || 'Role',
    t('status') || 'Status',
    t('last_login') || 'Last Login',
    t('actions') || 'Actions',
  ];

  const rows = staff.map((account) => [
    <div key="name">
      <div className="font-medium text-stone-900">{account.fullName}</div>
      <div className="text-xs text-stone-400">{account.phone || '—'}</div>
    </div>,
    <div key="email">
      <div className="text-sm text-stone-700">{account.email}</div>
      <div className="text-xs text-stone-400">
        {t('created') || 'Created'}: {formatDate(account.createdAt)}
      </div>
    </div>,
    <div key="role">{getRoleBadge(account.role)}</div>,
    <div key="status">
      <StatusBadge status={account.active ? 'pending' : 'cancelled'} />
    </div>,
    <div key="lastLogin" className="text-sm text-stone-500">
      {formatDate(account.lastLogin)}
    </div>,
    <div key="actions" className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onEdit(account)}
      >
        ✏️ {t('edit') || 'Edit'}
      </Button>
      {account.active ? (
        <Button
          size="sm"
          variant="danger"
          onClick={() => onDeactivate(account.id)}
        >
          {t('deactivate') || 'Deactivate'}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          onClick={() => onActivate(account.id)}
        >
          {t('activate') || 'Activate'}
        </Button>
      )}
    </div>,
  ]);

  return (
    <div className="space-y-4">
      {onRefresh && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            🔄 {t('refresh') || 'Refresh'}
          </Button>
        </div>
      )}
      <Card padding={false}>
        <Table headers={headers} rows={rows} />
      </Card>
    </div>
  );
}
