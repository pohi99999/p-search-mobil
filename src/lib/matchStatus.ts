// Card 2428c38f: grant_matches.status values the app reasons about. Pure module (no React Native
// imports) so components and tests can use it without loading the Supabase client.
export const STALE_MATCH_STATUS = 'stale';

/** A new scan marks its older, not re-scored matches 'stale'; they go after the fresh ones, score order kept inside each group. */
export function sortFreshFirst<T extends { status: string; match_score: number }>(rows: T[]): T[] {
  const rank = (r: T) => (r.status === STALE_MATCH_STATUS ? 1 : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.match_score - a.match_score);
}

/**
 * Card [C] (review 2026-10-25): an expired grant is still open on its own deadline day (the deadline is often stored
 * as that day's midnight), so the cut is the start of the viewer's local day, not the current instant.
 */
export function isOpenGrant(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return true;
  const at = new Date(deadline).getTime();
  if (Number.isNaN(at)) return true;
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
export function withoutExpired<T extends { id: string; status: string; grants?: { deadline: string | null } | null }>(
  rows: T[],
  planMatchIds: ReadonlySet<string>,
  now: Date = new Date(),
): T[] {
  return rows.filter(
    (r) => isOpenGrant(r.grants?.deadline, now) || !UNTOUCHED_STATUSES.has(r.status) || planMatchIds.has(r.id),
  );
}
