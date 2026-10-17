import { addMoney, subtractMoney, multiplyMoney, toNumber, formatEtb } from '../money';

/**
 * Money is a decimal string end to end. These tests pin the exact-decimal
 * behaviour so no helper ever silently falls back to float arithmetic.
 */
describe('money helpers keep exact decimal strings', () => {
  it('adds without binary-float error and returns a string', () => {
    const result = addMoney('0.1', '0.2');
    expect(typeof result).toBe('string');
    expect(result).toBe('0.30');
    expect(result).not.toBe(String(0.1 + 0.2));
  });

  it('subtracts exactly', () => {
    expect(subtractMoney('100.00', '0.01')).toBe('99.99');
    expect(subtractMoney('0.01', '0.02')).toBe('-0.01');
  });

  it('multiplies by a quantity exactly', () => {
    expect(multiplyMoney('100.00', 3)).toBe('300.00');
    expect(multiplyMoney('0.10', 3)).toBe('0.30');
    expect(multiplyMoney('12.34', 0)).toBe('0.00');
  });

  it('accepts numbers only as inputs, never as an arithmetic type', () => {
    expect(addMoney(1.5, '0.25')).toBe('1.75');
    expect(typeof addMoney(1.5, '0.25')).toBe('string');
  });

  it('toNumber is display-only and never returns NaN', () => {
    expect(toNumber('123.45')).toBe(123.45);
    expect(toNumber('')).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('not-a-number')).toBe(0);
  });

  it('formats ETB with two decimal places', () => {
    expect(formatEtb('100')).toBe('ETB 100.00');
    expect(formatEtb('0.5')).toBe('ETB 0.50');
  });
});
