'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Category } from '../schemas';

interface CategoryTableProps {
  categories: Category[];
  isLoading?: boolean;
  onEdit: (category: Category) => void;
  onRetire: (id: string) => void;
  onActivate: (id: string) => void;
  onRefresh?: () => void;
}

export function CategoryTable({
  categories,
  isLoading = false,
  onEdit,
  onRetire,
  onActivate,
  onRefresh,
}: CategoryTableProps) {
  const { t, locale } = useTranslation();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-60 bg-stone-100 rounded" />
      </Card>
    );
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        icon="💲"
        title={t('no_categories') || 'No Categories'}
        description={t('no_categories_description') || 'Create your first ticket category to get started.'}
      />
    );
  }

  const headers = [
    t('category') || 'Category',
    t('price') || 'Price',
    t('status') || 'Status',
    t('actions') || 'Actions',
  ];

  const rows = categories.map((category) => [
    <div key="name">
      <div className="font-medium text-stone-900">
        {locale === 'en' ? category.name_en : category.name_am}
      </div>
      <div className="text-xs text-stone-400">
        {locale === 'en' ? category.name_am : category.name_en}
      </div>
    </div>,
    <div key="price" className="font-bold text-primary-600 font-serif">
      {category.is_free ? 'FREE' : `ETB ${category.price_etb}`}
    </div>,
    <div key="status">
      <StatusBadge status={category.active ? 'pending' : 'cancelled'} />
    </div>,
    <div key="actions" className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onEdit(category)}
      >
        ✏️ {t('edit') || 'Edit'}
      </Button>
      {category.active ? (
        <Button
          size="sm"
          variant="danger"
          onClick={() => onRetire(category.id)}
        >
          {t('retire') || 'Retire'}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          onClick={() => onActivate(category.id)}
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
