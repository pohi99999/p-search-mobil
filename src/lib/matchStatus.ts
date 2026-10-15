// Card 2428c38f: grant_matches.status values the app reasons about. Pure module (no React Native
// imports) so components and tests can use it without loading the Supabase client.
export const STALE_MATCH_STATUS = 'stale';

/** A new scan marks its older, not re-scored matches 'stale'; they go after the fresh ones, score order kept inside each group. */
export function sortFreshFirst<T extends { status: string; match_score: number }>(rows: T[]): T[] {
  const rank = (r: T) => (r.status === STALE_MATCH_STATUS ? 1 : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.match_score - a.match_score);
}
