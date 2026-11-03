// Card [H2] (review 2026-10-25): a grant's deadline is stored as the Budapest midnight that starts its last day, the
// convention the app (isOpenGrant, formatDeadline) and the matching (openGrantCutoffIso) share. Two loaders write it:
// scripts/ingest-grants (palyazat.gov.hu endTime) and ingest-n8n-grants. Measured live 2026-10-25: the source's
// winter dates came as Budapest 23:00 of the day before (an hour off), and a hand seed used UTC end of day
// (23:59:59Z), which the app showed one day late. A deadline with a real time of day (e.g. 18:00) is kept as it is.
// Plain TypeScript, no Deno or Node API: the Node loader imports this file too.

const TZ = 'Europe/Budapest';
const HOUR_MS = 60 * 60 * 1000;

type Parts = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

function localParts(t: number): Parts {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(t)).map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

/** The UTC instant of Budapest 00:00 on y-m-d (CET +1 or CEST +2, whichever is in force that day). */
export function budapestMidnightIso(y: number, m: number, d: number): string {
  for (const offsetHours of [1, 2]) {
    const t = Date.UTC(y, m - 1, d) - offsetHours * HOUR_MS;
    const p = localParts(t);
    if (p.y === y && p.m === m && p.d === d && p.hh === 0 && p.mm === 0 && p.ss === 0) return new Date(t).toISOString();
  }
  throw new Error(`no Budapest midnight for ${y}-${m}-${d}`);
}

/** The next calendar day of y-m-d. */
function nextDay(y: number, m: number, d: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

/**
 * The deadline as the loaders should store it, or null when there is none or it cannot be read.
 * - a date alone ("2029-12-31", "2029.12.31.", "2029. 12. 31.") -> Budapest midnight of that day;
 * - UTC end of day ("...T23:59:59Z") -> Budapest midnight of that UTC date;
 * - exactly Budapest 23:00 (the source's winter dates, an hour off) -> Budapest midnight of the next day;
 * - anything else (already a Budapest midnight, or a real time of day) -> unchanged.
 */
export function normalizeDeadline(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const dateOnly = s.match(/^(\d{4})[-.]\s?(\d{1,2})[-.]\s?(\d{1,2})\.?$/);
  if (dateOnly) {
    const [y, m, d] = [+dateOnly[1], +dateOnly[2], +dateOnly[3]];
    const check = new Date(Date.UTC(y, m - 1, d));
    // "2029.13.40." is not a date (Date.UTC would roll it over into another one).
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
    return budapestMidnightIso(y, m, d);
  }

  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const at = new Date(t);

  if (at.getUTCHours() === 23 && at.getUTCMinutes() === 59 && at.getUTCSeconds() === 59) {
    return budapestMidnightIso(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
  }
  const p = localParts(t);
  if (p.hh === 23 && p.mm === 0 && p.ss === 0) return budapestMidnightIso(...nextDay(p.y, p.m, p.d));
  return at.toISOString();
}
