/**
 * Shared helpers for the Manager reports surface (UAT round 1, Phase 7c).
 *
 * Everything that formats a date, a money amount or a percentage for the
 * reports UI goes through this file, so a later change (an Ethiopian
 * calendar alongside the Gregorian one -- Section 8, open decision #6 --
 * or a different money style) is a one-file edit instead of fifty.
 */
import type { DateRange } from './api';

// ---------------------------------------------------------------------
// Dates -- single formatting seam. Gregorian only for now.
// ---------------------------------------------------------------------

type Locale = 'en' | 'am';

const intlLocale = (locale: Locale) => (locale === 'am' ? 'am-ET' : 'en-US');

/** "2026-09-30" -> a Date at local midnight (never `new Date('YYYY-MM-DD')`,
 *  which parses as UTC and shifts a day in zones west of UTC). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** THE date formatter for the reports UI. Swap its body to add the
 *  Ethiopian calendar later. */
export function formatReportDate(
  iso: string,
  locale: Locale,
  style: 'short' | 'long' | 'day-month' = 'short'
): string {
  const date = parseIsoDate(iso);
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'day-month'
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleDateString(intlLocale(locale), options);
}

export function formatReportDateTime(iso: string | null, locale: Locale): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Addis_Ababa',
  });
}

// ---------------------------------------------------------------------
// Money & numbers. Money arrives as a Decimal *string*; it is parsed only
// to format/plot it, and every total shown is the backend's own figure,
// never a sum of floats computed here.
// ---------------------------------------------------------------------

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** "ETB 1,234.56" */
export function formatEtb(value: string | number | null | undefined): string {
  return `ETB ${toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatInt(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('en-US');
}

/** 12.345 -> "12.3%"; null (no baseline / no data) -> "-". */
export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(digits)}%`;
}

/** Signed delta: "+12.0%" / "-3.5%" / null when there is no baseline. */
export function formatDelta(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// ---------------------------------------------------------------------
// Range presets -- resolved client-side (so the URL can carry a concrete,
// shareable from/to) against the *browser's* clock. The museum and its
// Managers are in Africa/Addis_Ababa; the backend scopes by that zone, and
// these presets are computed from "today" as the user sees it, which is
// the same calendar day for anyone using this surface on site.
// ---------------------------------------------------------------------

export type PresetKey =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_fiscal_year'
  | 'last_30_days';

export const PRESET_ORDER: PresetKey[] = [
  'today',
  'this_week',
  'this_month',
  'this_quarter',
  'last_quarter',
  'this_fiscal_year',
  'last_30_days',
];

// Mirrors backend settings.FISCAL_YEAR_START_MONTH/DAY (defaults 7 / 1).
// Override both via NEXT_PUBLIC_FISCAL_YEAR_START_MONTH/_DAY so the chip
// matches whatever the backend is configured with -- the *numbers* in
// every report still come from the backend; this only seeds the chip's
// from/to. (The Ethiopian fiscal year starts 1 Hamle = 8 July -- see the
// open decision on which calendar the museum's quarterly reports follow.)
const FISCAL_START_MONTH = Number(process.env.NEXT_PUBLIC_FISCAL_YEAR_START_MONTH ?? 7);
const FISCAL_START_DAY = Number(process.env.NEXT_PUBLIC_FISCAL_YEAR_START_DAY ?? 1);

function startOfWeekMonday(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (out.getDay() + 6) % 7; // Monday = 0
  out.setDate(out.getDate() - offset);
  return out;
}

export function resolvePreset(preset: PresetKey, today: Date = new Date()): DateRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (preset) {
    case 'today':
      return { from: toIsoDate(t), to: toIsoDate(t) };
    case 'this_week': {
      const start = startOfWeekMonday(t);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'this_month':
      return {
        from: toIsoDate(new Date(t.getFullYear(), t.getMonth(), 1)),
        to: toIsoDate(new Date(t.getFullYear(), t.getMonth() + 1, 0)),
      };
    case 'this_quarter':
    case 'last_quarter': {
      const offset = preset === 'last_quarter' ? 1 : 0;
      const q = Math.floor(t.getMonth() / 3) - offset;
      const startMonth = q * 3; // may be negative -> Date normalises the year
      return {
        from: toIsoDate(new Date(t.getFullYear(), startMonth, 1)),
        to: toIsoDate(new Date(t.getFullYear(), startMonth + 3, 0)),
      };
    }
    case 'this_fiscal_year': {
      const startsThisYear = new Date(t.getFullYear(), FISCAL_START_MONTH - 1, FISCAL_START_DAY);
      const startYear = t >= startsThisYear ? t.getFullYear() : t.getFullYear() - 1;
      const start = new Date(startYear, FISCAL_START_MONTH - 1, FISCAL_START_DAY);
      const end = new Date(startYear + 1, FISCAL_START_MONTH - 1, FISCAL_START_DAY - 1);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'last_30_days': {
      const start = new Date(t);
      start.setDate(start.getDate() - 29);
      return { from: toIsoDate(start), to: toIsoDate(t) };
    }
  }
}

/** Which preset (if any) a concrete range corresponds to -- lets the chip
 *  highlight itself when the URL carries a matching from/to. */
export function matchPreset(range: DateRange, today: Date = new Date()): PresetKey | null {
  for (const key of PRESET_ORDER) {
    const r = resolvePreset(key, today);
    if (r.from === range.from && r.to === range.to) return key;
  }
  return null;
}

// ---------------------------------------------------------------------
// URL state: ?from=YYYY-MM-DD&to=YYYY-MM-DD&tab=schools
// ---------------------------------------------------------------------

export const TAB_KEYS = ['overview', 'schools', 'categories', 'attendance', 'revenue'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidRange(from: string | null, to: string | null): from is string {
  return !!from && !!to && ISO_RE.test(from) && ISO_RE.test(to) && from <= to;
}

export function parseTab(raw: string | null): TabKey {
  return (TAB_KEYS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'overview';
}

/** Default range when the URL has none: this month. */
export function defaultRange(today: Date = new Date()): DateRange {
  return resolvePreset('this_month', today);
}

export function buildQuery(range: DateRange, tab: TabKey): string {
  return `?from=${range.from}&to=${range.to}&tab=${tab}`;
}

/** Inclusive number of calendar days in a range. */
export function daysInRange(range: DateRange): number {
  const ms = parseIsoDate(range.to).getTime() - parseIsoDate(range.from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export type Granularity = 'daily' | 'weekly' | 'monthly';

/** Axis/row label for a time bucket, via the single date formatter. */
export function bucketLabel(iso: string, granularity: Granularity, locale: Locale): string {
  if (granularity === 'monthly') {
    return parseIsoDate(iso).toLocaleDateString(intlLocale(locale), { month: 'short', year: 'numeric' });
  }
  return formatReportDate(iso, locale, 'day-month');
}

/** Heads-up: a filename-safe slug for CSV downloads. */
export function csvName(report: string, range: DateRange): string {
  return `${report}-${range.from}-to-${range.to}.csv`;
}
