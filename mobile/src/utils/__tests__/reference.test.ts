import { isValidReference, referenceAlphabet } from '../reference';

describe('booking reference validation', () => {
  it('accepts an 8-character reference from the allowed alphabet', () => {
    expect(isValidReference('ABCDEFGH')).toBe(true);
    expect(isValidReference('2A3B4C5D')).toBe(true);
    expect(isValidReference('ZYXWVUT2')).toBe(true);
  });

  it('rejects ambiguous glyphs I, O, 0 and 1', () => {
    expect(isValidReference('ABCDEFGI')).toBe(false);
    expect(isValidReference('ABCDEFGO')).toBe(false);
    expect(isValidReference('ABCDEFG0')).toBe(false);
    expect(isValidReference('ABCDEFG1')).toBe(false);
  });

  it('rejects wrong lengths', () => {
    expect(isValidReference('ABCDEFG')).toBe(false);
    expect(isValidReference('ABCDEFGHI')).toBe(false);
    expect(isValidReference('')).toBe(false);
  });

  it('rejects lowercase', () => {
    expect(isValidReference('abcdefgh')).toBe(false);
  });

  it('alphabet excludes I, O, 0 and 1', () => {
    const alphabet = referenceAlphabet();
    expect(alphabet).toHaveLength(32);
    for (const ch of ['I', 'O', '0', '1']) {
      expect(alphabet).not.toContain(ch);
    }
  });
});
