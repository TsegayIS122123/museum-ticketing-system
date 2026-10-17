import { parseDateOnly, formatDateOnly, formatDateTime, toIsoDate } from '../dates';

/**
 * The suite pins TZ to Africa/Addis_Ababa (UTC+3) in jest.setup.js, so the
 * local-time expectations here are deterministic.
 */
describe('date helpers format in Africa/Addis_Ababa', () => {
  it('parses a date-only string as a local calendar date (no UTC shift)', () => {
    const d = parseDateOnly('2026-03-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(5);
  });

  it('formats a date-only string', () => {
    expect(formatDateOnly('2026-03-05')).toBe('Thu, 5 Mar 2026');
    expect(formatDateOnly('2026-01-01')).toBe('Thu, 1 Jan 2026');
  });

  it('formats an instant in the museum timezone (UTC+3)', () => {
    expect(formatDateTime('2026-03-05T00:30:00Z')).toBe('5 Mar 2026, 03:30');
    expect(formatDateTime('2026-03-05T21:30:00Z')).toBe('6 Mar 2026, 00:30');
  });

  it('serialises a local Date to YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 2, 5))).toBe('2026-03-05');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});
