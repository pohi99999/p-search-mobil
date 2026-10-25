// Card [A] (review 2026-10-25): the grant's submission deadline was in the data (grants.deadline,
// timestamptz) but never on screen, and 10 of the 63 live grants had already expired.

/** Fewer days left than this marks the deadline as close. */
export const DEADLINE_SOON_DAYS = 14;

export type DeadlineTone = 'expired' | 'soon' | 'normal' | 'unknown';

export interface DeadlineInfo {
  tone: DeadlineTone;
  /** The line on the card, e.g. "Beadás: 2026. 11. 30. (még 36 nap)". */
  label: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Calendar days from today to the deadline's day, in the device's time zone (0 = today). */
function calendarDaysUntil(deadline: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(deadline) - startOfDay(now)) / MS_PER_DAY);
}

export function formatDeadline(deadline: string | null | undefined, now: Date = new Date()): DeadlineInfo {
  const date = deadline ? new Date(deadline) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { tone: 'unknown', label: 'Beadási határidő: nincs megadva' };
  }
  const day = date.toLocaleDateString('hu-HU');
  // Open through the deadline's own day, expired from the next day on: the same rule as isOpenGrant
  // in matchStatus.ts ([C]). Deadlines are mostly stored as midnight, so a moment check said
  // "Lejárt" all day on the last day while [C] still kept the grant on the list.
  const days = calendarDaysUntil(date, now);
  if (days < 0) {
    return { tone: 'expired', label: `Lejárt: ${day}` };
  }
  const left = days === 0 ? 'ma jár le' : `még ${days} nap`;
  return { tone: days < DEADLINE_SOON_DAYS ? 'soon' : 'normal', label: `Beadás: ${day} (${left})` };
}
