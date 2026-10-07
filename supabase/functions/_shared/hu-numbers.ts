// Card a96dd8e2 #14 (common test 2026-10-07): the generated PDF text said "50.000.000 Ft". Hungarian groups
// thousands with a space; a no-break space keeps the number on one line in the PDF.
const NBSP = String.fromCharCode(0xa0);

/**
 * "50.000.000 Ft" -> "50 000 000 Ft" (no-break spaces). Only a 1-3 digit group followed by whole groups of
 * exactly three digits counts, so dates (2025.10.07), decimals (3.14159, 12.34) and versions stay as they are.
 */
export function huThousands(text: string): string {
  return text.replace(/(?<![\d.])\d{1,3}(?:\.\d{3})+(?![\d.])/g, (m) => m.replace(/\./g, NBSP));
}
