// Card [A] (review 2026-10-25): the grant's submission deadline was in the data (grants.deadline,
// timestamptz) but never on screen, and 10 of the 63 live grants had already expired.

/** Fewer days left than this marks the deadline as close. */
export const DEADLINE_SOON_DAYS = 14;

export type DeadlineTone = 'expired' | 'soon' | 'normal' | 'unknown';

export interface DeadlineInfo {
  tone: DeadlineTone;
  /** The line on the card, e.g. "Beadás: 2026. 11. 30. (még 36 nap)". */
  label: string;
  /** The deadline's day ("2026. 11. 30."), when there is one. */
  date?: string;
  /** Calendar days left (0 = today), when the deadline has not passed. */
  daysLeft?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The day a deadline belongs to. A deadline stored as exactly local midnight means "until the end of the
 * previous day": the source's 2026-12-01T23:00Z is 2026-12-02 00:00 in Budapest, and the card showed
 * "2026. 12. 02." while the call (and the server's `deadline >= now()`) closes at the end of 12-01
 * (Marveen 4801, measured against the source file). Used by the card, the detail view and isOpenGrant.
 */
export function deadlineDay(date: Date): Date {
  const atMidnight = date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
  return atMidnight ? new Date(date.getTime() - 1) : date;
}

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
  // Open through the deadline's own day, expired from the next day on: the same rule as isOpenGrant
  // in matchStatus.ts ([C]). A midnight deadline belongs to the day before (deadlineDay).
  const lastDay = deadlineDay(date);
  const day = lastDay.toLocaleDateString('hu-HU');
  const days = calendarDaysUntil(lastDay, now);
  if (days < 0) {
    return { tone: 'expired', label: `Lejárt: ${day}`, date: day };
  }
  const left = days === 0 ? 'ma jár le' : `még ${days} nap`;
  return { tone: days < DEADLINE_SOON_DAYS ? 'soon' : 'normal', label: `Beadás: ${day} (${left})`, date: day, daysLeft: days };
}

/** The deadline value on the detail view, under the "Beadási határidő" label (texts: Stratéga, card [B]). */
export function deadlineDetailText(info: DeadlineInfo): string {
  switch (info.tone) {
    case 'unknown':
      return 'A kiírás nem ad meg határidőt.';
    case 'expired':
      return info.label;
    case 'soon':
      return info.daysLeft === 0 ? `Ma jár le: ${info.date}` : `Még ${info.daysLeft} nap: ${info.date}`;
    default:
      return info.date ?? '';
  }
}
