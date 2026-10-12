/**
 * The 8-character booking reference alphabet, from the contract's
 * `Booking.reference` — the full A-Z/0-9 set minus ambiguous I, O, 0, 1.
 * Pattern: ^[A-HJ-NP-Z2-9]{8}$
 */
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export function isValidReference(value: string): boolean {
  return REFERENCE_RE.test(value);
}

export function referenceAlphabet(): string {
  return REFERENCE_ALPHABET;
}
