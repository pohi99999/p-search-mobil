// Card 378073ce: the match cards printed "1 Ft - 138 937 500 000 Ft". Measured on the live grants table
// (2026-10-15): 9 rows carry amount_min = 1 (a placeholder from the source, not a real lower bound) and
// 13 rows carry amount_max above 10 billion Ft, which is the programme's whole budget (keretösszeg),
// not a per-project ceiling. The card must say what the data can support, not invent a range.

/** A minimum of 1 Ft (or less) is a placeholder, not a bound. */
export const PLACEHOLDER_MIN_FT = 1;
/** Above this (exclusive) a "maximum" is a programme budget, not a per-project amount. */
export const PROGRAMME_BUDGET_FT = 10_000_000_000;

// hu-HU grouping uses a no-break space (U+00A0, on some engines U+202F); the card and the tests
// want a plain space, like the rest of the app's copy.
const huf = (n: number): string => `${Math.round(n).toLocaleString('hu-HU').replace(/[\u00A0\u202F]/g, ' ')} Ft`;

/**
 * The amount line of a grant card, or null when there is nothing honest to say.
 * - real min and real max: "5 000 000 Ft - 150 000 000 Ft"
 * - placeholder min, real max: "legfeljebb 150 000 000 Ft"
 * - real min, no max: "legalább 5 000 000 Ft"
 * - a max that is a programme budget: "keretösszeg 138 937 500 000 Ft" (with a real min: "legalább X Ft, keretösszeg Y Ft")
 * - nothing usable: null (the card shows no amount line)
 */
export function formatGrantAmount(amountMin: number | null | undefined, amountMax: number | null | undefined): string | null {
  const min = typeof amountMin === 'number' && amountMin > PLACEHOLDER_MIN_FT ? amountMin : null;
  const max = typeof amountMax === 'number' && amountMax > 0 ? amountMax : null;
  if (max != null && max > PROGRAMME_BUDGET_FT) {
    return min != null ? `legalább ${huf(min)}, keretösszeg ${huf(max)}` : `keretösszeg ${huf(max)}`;
  }
  if (min != null && max != null) return min === max ? huf(min) : `${huf(min)} - ${huf(max)}`;
  if (max != null) return `legfeljebb ${huf(max)}`;
  if (min != null) return `legalább ${huf(min)}`;
  return null;
}
