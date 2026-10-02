/**
 * Calendar-date helpers for "YYYY-MM-DD" strings.
 *
 * Never build one with `date.toISOString().split('T')[0]`: that converts to
 * UTC first, so in any timezone east of UTC (Addis Ababa is UTC+3) local
 * midnight lands on the *previous* day -- the calendar then shows the wrong
 * day closed and submits the wrong visit date. Always format from the local
 * year/month/day, and parse back as a local date, not as UTC.
 */

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "2026-10-04" -> local-midnight Date (`new Date('2026-10-04')` would be UTC). */
export function parseLocalIsoDate(iso: string): Date {
  // A full timestamp (has a time part) is a real instant: parse it as one.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(iso);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
