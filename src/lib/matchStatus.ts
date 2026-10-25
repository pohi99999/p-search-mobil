// Card 2428c38f: grant_matches.status values the app reasons about. Pure module (no React Native
// imports) so components and tests can use it without loading the Supabase client.
import { deadlineDay } from './deadline';

export const STALE_MATCH_STATUS = 'stale';

/** A new scan marks its older, not re-scored matches 'stale'; they go after the fresh ones, score order kept inside each group. */
export function sortFreshFirst<T extends { status: string; match_score: number }>(rows: T[]): T[] {
  const rank = (r: T) => (r.status === STALE_MATCH_STATUS ? 1 : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.match_score - a.match_score);
}

/**
 * Card [C] (review 2026-10-25): a grant is open through its deadline's day, so the cut is the start of the viewer's
 * local day, not the current instant. A deadline stored as exactly local midnight belongs to the day before
 * (deadlineDay, Marveen 4801), which matches the server's `deadline >= now()`.
 */
export function isOpenGrant(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return true;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return true;
  // A midnight deadline closes at the end of the day before (deadlineDay), like the card shows it.
  const at = deadlineDay(parsed).getTime();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return at >= startOfToday.getTime();
}

/** Statuses the user never acted on; only these disappear when their grant expires. */
const UNTOUCHED_STATUSES = new Set(['new', STALE_MATCH_STATUS]);

/**
 * The home list without the expired grants nobody acted on. A match stays when the user did something with it (a
 * status other than new/stale) or an action plan hangs on it, so a started plan never vanishes from the list.
 */
export function withoutExpired<T extends { id: string; status: string; grants?: { deadline: string | null; source_closed_at?: string | null } | null }>(
  rows: T[],
  planMatchIds: ReadonlySet<string>,
  now: Date = new Date(),
): T[] {
  return rows.filter(
    // Card [H2]: a call closed at the source counts as expired too.
    (r) => (isOpenGrant(r.grants?.deadline, now) && !r.grants?.source_closed_at) || !UNTOUCHED_STATUSES.has(r.status) || planMatchIds.has(r.id),
  );
}

/** Card [D]: a company counts as searched once a scan ran (profiles.last_scan_at) or it has any match. */
export function hasSearchedBefore(lastScanAt: string | null | undefined, matchCount: number): boolean {
  return !!lastScanAt || matchCount > 0;
}
