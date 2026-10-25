// How a grant's deadline and amount reach a model prompt (Copilot card, vc 18 E2E; Brunella 4802/4853).
// The prompts got the raw values: "Határidő: 2026-12-01T23:00:00.000Z" (BAY_VOUCHER), so the chat answered
// "december 1." while the source and the app say 2026. 12. 02.; and "1 - 138 937 500 000 Ft", a placeholder
// minimum and a programme budget. Both now follow the app's own rules.
// Plain TypeScript, no Deno API.

const TZ = 'Europe/Budapest';

/**
 * The deadline as the app shows it: the Budapest calendar day ("2026. 12. 02."), since a deadline is stored as the
 * Budapest midnight that starts its last day (4738, src/lib/deadline.ts formatDeadline). A real time of day
 * (e.g. 18:00) is added after the date. null when there is none or it cannot be read.
 */
export function formatDeadlineHu(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const at = new Date(deadline);
  if (Number.isNaN(at.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  const day = `${p.year}. ${p.month}. ${p.day}.`;
  return p.hour === '00' && p.minute === '00' ? day : `${day} ${p.hour}:${p.minute}`;
}

// The same thresholds as the app's card (src/lib/grantAmount.ts, card 378073ce); grant-text.test.ts checks
// that both give the same line.
const PLACEHOLDER_MIN_FT = 1;
const PROGRAMME_BUDGET_FT = 10_000_000_000;
const huf = (n: number): string => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`;

/** The amount line as on the app's card, or null when there is nothing honest to say. */
export function formatAmountHu(amountMin: number | null | undefined, amountMax: number | null | undefined): string | null {
  const min = typeof amountMin === 'number' && amountMin > PLACEHOLDER_MIN_FT ? amountMin : null;
  const max = typeof amountMax === 'number' && amountMax > 0 ? amountMax : null;
  if (max != null && max >= PROGRAMME_BUDGET_FT) {
    return min != null ? `legalább ${huf(min)}, keretösszeg ${huf(max)}` : `keretösszeg ${huf(max)}`;
  }
  if (min != null && max != null) return min === max ? huf(min) : `${huf(min)} - ${huf(max)}`;
  if (max != null) return `legfeljebb ${huf(max)}`;
  if (min != null) return `legalább ${huf(min)}`;
  return null;
}
