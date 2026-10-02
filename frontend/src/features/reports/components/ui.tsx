'use client';

import { useState } from 'react';
import { Download, TrendingDown, TrendingUp, Minus, Info, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { DateRange } from '../api';
import { PRESET_ORDER, formatDelta, matchPreset, resolvePreset, isValidRange, type PresetKey } from '../lib';

// ---------------------------------------------------------------------
// Range control: preset chips + custom from/to. Drives every tab.
// ---------------------------------------------------------------------

export function RangeControl({ range, onChange }: { range: DateRange; onChange: (r: DateRange) => void }) {
  const { t } = useTranslation();
  const active = matchPreset(range);
  const [draft, setDraft] = useState<DateRange>(range);
  const [prevRange, setPrevRange] = useState(range);
  // Keep the custom inputs in step when a chip (or the URL) changes the range.
  if (prevRange.from !== range.from || prevRange.to !== range.to) {
    setPrevRange(range);
    setDraft(range);
  }
  const valid = isValidRange(draft.from, draft.to);
  const dirty = draft.from !== range.from || draft.to !== range.to;

  return (
    <div className="no-print rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div role="group" aria-label={t('rpt_range_presets')} className="flex flex-wrap gap-2">
        {PRESET_ORDER.map((key: PresetKey) => (
          <button
            key={key}
            type="button"
            aria-pressed={active === key}
            onClick={() => onChange(resolvePreset(key))}
            className={cn(
              'min-h-[40px] cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary',
              active === key
                ? 'border-brand-primary bg-brand-primary text-white'
                : 'border-stone-300 bg-white text-stone-700 hover:border-brand-primary'
            )}
          >
            {t(`rpt_preset_${key}`)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-stone-600">
          {t('rpt_from')}
          <input
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            className="mt-1 block min-h-[40px] rounded-lg border border-stone-300 px-3 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-brand-primary"
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          {t('rpt_to')}
          <input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            className="mt-1 block min-h-[40px] rounded-lg border border-stone-300 px-3 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-brand-primary"
          />
        </label>
        <Button size="sm" variant={active ? 'secondary' : 'primary'} disabled={!valid || !dirty} onClick={() => onChange(draft)}>
          {t('rpt_apply_range')}
        </Button>
        {!active && <span className="text-xs text-stone-500">{t('rpt_custom_range_active')}</span>}
        {!valid && <span role="alert" className="text-xs text-red-600">{t('rpt_range_invalid')}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Definitions, deltas, states
// ---------------------------------------------------------------------

/** The on-screen "what exactly does this count?" line every report carries. */
export function DefinitionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs leading-relaxed text-primary-800">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function DeltaBadge({ pct, baseline }: { pct: number | null | undefined; baseline: string }) {
  const { t } = useTranslation();
  const text = formatDelta(pct);
  if (text === null) {
    return <span className="text-xs text-stone-500">{t('rpt_no_baseline')}</span>;
  }
  const up = (pct ?? 0) > 0;
  const flat = (pct ?? 0) === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
          flat ? 'bg-stone-100 text-stone-700' : up ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {text}
      </span>
      <span className="text-stone-500">{baseline}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  caption,
  footer,
}: {
  label: string;
  value: string;
  caption: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="text-xs font-medium uppercase tracking-wider text-stone-600">{label}</div>
      <div className="font-serif text-3xl font-semibold tabular-nums text-stone-900">{value}</div>
      <div className="text-xs leading-snug text-stone-600">{caption}</div>
      {footer && <div className="mt-1">{footer}</div>}
    </Card>
  );
}

export function SectionCard({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-stone-900">{title}</h2>
          {caption && <p className="mt-0.5 text-xs text-stone-600">{caption}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function ReportSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export function ReportError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <div role="alert" className="flex items-center gap-2 text-sm text-red-700">
        <AlertTriangle className="h-4 w-4" aria-hidden /> {t('rpt_load_failed')}: {message}
      </div>
    </Card>
  );
}

export function EmptyRange() {
  const { t } = useTranslation();
  return <div className="py-10 text-center text-sm text-stone-600">{t('rpt_no_visits')}</div>;
}

export function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={disabled} className="no-print">
      <Download className="h-4 w-4" /> {t('rpt_export_csv')}
    </Button>
  );
}
