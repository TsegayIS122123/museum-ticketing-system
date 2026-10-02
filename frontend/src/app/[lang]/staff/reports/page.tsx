'use client';

/**
 * Manager reports (UAT round 1, Phase 7c).
 *
 * One date range drives every tab. The range and the active tab live in
 * the URL (`?from=YYYY-MM-DD&to=YYYY-MM-DD&tab=schools`) so a Manager can
 * bookmark or share "Q1 report"; when the URL has no valid range we
 * default to this month and write that back, so the address bar always
 * describes what's on screen.
 */
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Printer } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import type { DateRange } from '@/features/reports/api';
import {
  TAB_KEYS,
  buildQuery,
  defaultRange,
  formatReportDate,
  isValidRange,
  parseTab,
  type TabKey,
} from '@/features/reports/lib';
import { RangeControl } from '@/features/reports/components/ui';
import { OverviewTab } from '@/features/reports/components/OverviewTab';
import { SchoolsTab } from '@/features/reports/components/SchoolsTab';
import { CategoriesTab } from '@/features/reports/components/CategoriesTab';
import { AttendanceTab } from '@/features/reports/components/AttendanceTab';
import { RevenueTab } from '@/features/reports/components/RevenueTab';

function ReportsContent() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  const urlValid = isValidRange(rawFrom, rawTo);
  const range: DateRange = urlValid ? { from: rawFrom as string, to: rawTo as string } : defaultRange();
  const tab = parseTab(params.get('tab'));

  const navigate = useCallback(
    (nextRange: DateRange, nextTab: TabKey) => {
      router.replace(`${pathname}${buildQuery(nextRange, nextTab)}`, { scroll: false });
    },
    [router, pathname]
  );

  // Normalise a missing/invalid range in the URL to a concrete one.
  useEffect(() => {
    if (!urlValid) navigate(range, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlValid]);

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % TAB_KEYS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TAB_KEYS.length) % TAB_KEYS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TAB_KEYS.length - 1;
    else return;
    e.preventDefault();
    navigate(range, TAB_KEYS[next]);
    tabRefs.current[TAB_KEYS[next]]?.focus();
  };

  return (
    <PageContainer className="reports-root">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900">{t('reports')}</h1>
          <p className="mt-1 text-stone-600">{t('reports_description')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => window.print()} className="no-print">
          <Printer className="h-4 w-4" /> {t('rpt_print')}
        </Button>
      </div>

      <RangeControl range={range} onChange={(r) => navigate(r, tab)} />

      {/* Always visible in print so a printed page says what period it covers. */}
      <p className="mt-4 text-sm font-medium text-stone-800">
        {t('rpt_showing_range', {
          from: formatReportDate(range.from, locale, 'long'),
          to: formatReportDate(range.to, locale, 'long'),
        })}
      </p>

      <div role="tablist" aria-label={t('rpt_tabs_label')} className="no-print mt-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TAB_KEYS.map((key, i) => (
          <button
            key={key}
            ref={(el) => {
              tabRefs.current[key] = el;
            }}
            role="tab"
            id={`rpt-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`rpt-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => navigate(range, key)}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            className={cn(
              'min-h-[44px] cursor-pointer whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-primary',
              tab === key ? 'border-brand-primary text-brand-primary' : 'border-transparent text-stone-600 hover:text-stone-900'
            )}
          >
            {t(`rpt_tab_${key}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`rpt-panel-${tab}`} aria-labelledby={`rpt-tab-${tab}`} className="mt-6">
        {tab === 'overview' && <OverviewTab range={range} />}
        {tab === 'schools' && <SchoolsTab range={range} />}
        {tab === 'categories' && <CategoriesTab range={range} />}
        {tab === 'attendance' && <AttendanceTab range={range} />}
        {tab === 'revenue' && <RevenueTab range={range} />}
      </div>
    </PageContainer>
  );
}

export default function ReportsPage() {
  // useSearchParams() needs a Suspense boundary for the production build.
  return (
    <Suspense fallback={null}>
      <ReportsContent />
    </Suspense>
  );
}
