/** "12345678-2-44", "HU 12345678", "12 345 678" -> "12345678"; null until 8 digits are present. */
export function normalizeHuTaxNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/^\s*HU/i, '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(0, 8);
}

// Weights of the törzsszám check digit: digits 1-7 weighted 9,7,3,1,9,7,3; the 8th digit makes the sum
// a multiple of 10.
const TORZSSZAM_WEIGHTS = [9, 7, 3, 1, 9, 7, 3];

/**
 * A warning for a malformed Hungarian tax number, or null when it is empty or looks right. The field stays
 * optional and a warning never blocks saving (owner GO, Telegram 10614): the form only says it looks wrong.
 * Shape: 8-1-2 digits ("12345678-1-12", dashes or spaces optional); the 8th digit is the törzsszám check digit.
 */
export function huTaxNumberWarning(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const match = raw.replace(/\s/g, '').match(/^(\d{8})-?\d-?\d{2}$/);
  if (!match) return 'Ez nem tűnik magyar adószámnak (formája: 12345678-1-12). Ellenőrizd, de így is mentheted.';
  const digits = match[1].split('').map(Number);
  const sum = TORZSSZAM_WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  if ((10 - (sum % 10)) % 10 !== digits[7]) {
    return 'Az adószám első 8 számjegye hibásnak tűnik (nem stimmel az ellenőrző számjegy). Ellenőrizd, de így is mentheted.';
  }
  return null;
}
