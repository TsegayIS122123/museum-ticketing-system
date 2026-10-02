'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { getAvailability } from '@/features/availability/api';
import { parseLocalIsoDate, toLocalIsoDate } from '@/lib/utils/dates';

interface AvailabilityDatePickerProps {
  value: string;
  onChange: (date: string) => void;
}

// Mirrors [lang]/staff/availability/page.tsx's month-grid approach --
// same "no row = open by default" contract from the backend
// (services.is_date_open_for_booking), just read-only here and with
// closed/past cells disabled instead of clickable for editing.
const toIsoDate = toLocalIsoDate;

const buildMonthDates = (year: number, month: number): string[] => {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(toIsoDate(new Date(year, month, day)));
  }
  return dates;
};

export function AvailabilityDatePicker({ value, onChange }: AvailabilityDatePickerProps) {
  const { t, locale } = useTranslation();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [weeklyClosedDates, setWeeklyClosedDates] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const todayIso = toIsoDate(today);
  const gridRef = useRef<HTMLDivElement>(null);
  const intlLocale = locale === 'en' ? 'en-US' : 'am-ET';
  // Weekday headers in the page language, Sunday first (matches the grid).
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(intlLocale, { weekday: 'short' })
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setLoadError(null);

      const monthDates = buildMonthDates(viewYear, viewMonth);
      const from = monthDates[0];
      const to = monthDates[monthDates.length - 1];

      // GET /availability is public (FR-BOOK-008) -- no auth needed for a
      // visitor to see which dates the Museum Manager has closed.
      try {
        const records = await getAvailability(from, to);
        if (cancelled) return;
        const closed = new Set(
          records.filter((r) => !r.isOpenForBooking).map((r) => r.date)
        );
        setClosedDates(closed);
        setWeeklyClosedDates(
          new Set(
            records.filter((r) => r.closedReason === 'weekly_closure').map((r) => r.date)
          )
        );
      } catch {
        if (!cancelled) {
          setLoadError(t('failed_to_load_availability') || 'Could not load date availability.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `t` intentionally excluded: useTranslation() returns a new
    // function reference every render, so including it here retriggers
    // this fetch on every render (setIsLoading(true) -> re-render ->
    // new t -> effect re-fires), leaving the calendar stuck in the
    // loading state almost permanently -- which reads as every date
    // being closed, not just the genuinely closed ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    const prev = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(prev.getFullYear());
    setViewMonth(prev.getMonth());
  };

  const goToNextMonth = () => {
    const next = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  // Don't let the visitor navigate to a month entirely before the
  // current one -- nothing bookable lives there anyway.
  const isPrevDisabled = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const monthDates = buildMonthDates(viewYear, viewMonth);
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const leadingBlanks = Array.from({ length: firstWeekday });

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-date]') ?? []);
    const enabled = buttons.filter((b) => !b.disabled);
    if (enabled.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let target: HTMLButtonElement | undefined;
    if (e.key === 'Home') target = enabled[0];
    else if (e.key === 'End') target = enabled[enabled.length - 1];
    else if (e.key in step && current >= 0) {
      // Walk in the arrow's direction to the next *enabled* day.
      const dir = Math.sign(step[e.key]);
      for (let i = current + step[e.key]; i >= 0 && i < buttons.length; i += dir) {
        if (!buttons[i].disabled) {
          target = buttons[i];
          break;
        }
      }
    } else return;
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString(
    locale === 'en' ? 'en-US' : 'am-ET',
    { month: 'long', year: 'numeric' }
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          type="button"
          onClick={goToPrevMonth}
          disabled={isPrevDisabled}
          className="shrink-0 px-2 py-1 rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label={t('previous_month') || 'Previous month'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="font-semibold text-stone-900 truncate text-center">{monthLabel}</div>
        <button
          type="button"
          onClick={goToNextMonth}
          className="shrink-0 px-2 py-1 rounded-lg text-stone-500 hover:bg-stone-100 cursor-pointer"
          aria-label={t('next_month') || 'Next month'}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loadError && (
        <div className="text-sm text-red-600 mb-3">{loadError}</div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {weekdayLabels.map((d, i) => (
          <div key={i} className="text-xs font-semibold text-stone-500 py-1" aria-hidden="true">
            {d}
          </div>
        ))}
      </div>

      {/* Arrow keys move between enabled days (Left/Right = +-1 day, Up/Down
          = +-1 week, Home/End = first/last enabled day of the month); Tab
          still reaches every enabled day, so nothing depends on the arrows. */}
      <div
        ref={gridRef}
        role="group"
        aria-label={monthLabel}
        className="grid grid-cols-7 gap-1"
        onKeyDown={onGridKeyDown}
      >
        {leadingBlanks.map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {monthDates.map((date) => {
          const isPast = date < todayIso;
          // Fails safe: while still loading, or if the load failed,
          // don't let anything be selectable rather than risk offering
          // a date that turns out to be closed.
          const isClosed = isLoading || !!loadError || closedDates.has(date);
          const isDisabled = isPast || isClosed;
          const isSelected = value === date;

          const cellStyle = isPast
            ? 'bg-stone-50 text-stone-500 cursor-not-allowed line-through'
            : isClosed
            ? 'bg-stone-100 text-stone-500 cursor-not-allowed'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 cursor-pointer';

          return (
            <button
              key={date}
              type="button"
              data-date={date}
              aria-pressed={isSelected}
              aria-label={parseLocalIsoDate(date).toLocaleDateString(intlLocale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              onClick={() => !isDisabled && onChange(date)}
              disabled={isDisabled}
              title={
                isPast
                  ? undefined
                  : isClosed
                  ? weeklyClosedDates.has(date)
                    ? t('closed_every_sunday') || 'The museum is closed every Sunday'
                    : t('date_closed_for_booking') || 'Closed for booking'
                  : undefined
              }
              className={`
                text-sm py-2.5 rounded-lg font-medium border-2 transition-all
                ${cellStyle}
                ${isSelected ? 'ring-2 ring-inset ring-secondary-500 border-secondary-600' : 'border-transparent'}
              `}
            >
              {parseLocalIsoDate(date).getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex gap-4 mt-4 pt-4 border-t border-stone-200 text-xs flex-wrap">
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">
          {t('available') || 'Available'}
        </span>
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border bg-stone-100 text-stone-500 border-stone-300">
          {t('closed') || 'Closed'}
        </span>
      </div>
    </div>
  );
}