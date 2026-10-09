/**
 * Money is stored and transmitted as decimal strings (e.g. "100.00").
 * Never coerce to a JS number for arithmetic — use these helpers.
 */

function toMinorUnits(value: string | number): bigint {
  const s = typeof value === 'number' ? value.toFixed(2) : value;
  const [whole, frac = '00'] = s.split('.');
  const padded = (frac + '00').slice(0, 2);
  return BigInt(whole) * 100n + BigInt(padded);
}

function fromMinorUnits(minor: bigint): string {
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

export function addMoney(a: string | number, b: string | number): string {
  return fromMinorUnits(toMinorUnits(a) + toMinorUnits(b));
}

export function subtractMoney(a: string | number, b: string | number): string {
  return fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));
}

export function multiplyMoney(amount: string | number, quantity: number): string {
  return fromMinorUnits(toMinorUnits(amount) * BigInt(quantity));
}

export function formatEtb(amount: string | number): string {
  const [whole, frac = '00'] = String(amount).split('.');
  const padded = (frac + '00').slice(0, 2);
  return `ETB ${whole}.${padded}`;
}
