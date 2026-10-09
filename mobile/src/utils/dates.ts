import { format, parseISO } from 'date-fns';

/**
 * Parse an ISO date string (YYYY-MM-DD) as a calendar date in the device's
 * local timezone, without the UTC shift that `new Date('2026-03-05')`
 * introduces.
 */
export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateOnly(iso: string, pattern = 'EEE, d MMM yyyy'): string {
  return format(parseDateOnly(iso), pattern);
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy, HH:mm');
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
