/** "12345678-2-44", "HU 12345678", "12 345 678" -> "12345678"; null until 8 digits are present. */
export function normalizeHuTaxNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/^\s*HU/i, '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(0, 8);
}
