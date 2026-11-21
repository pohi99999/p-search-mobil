// P-Search round 11-21 (#2): the matches that came in since the user's previous visit get an "Új" label, and the list
// says how many there are. The automatic weekly scan already runs for everyone (scheduled-grant-scan), but nothing
// told the user that it found something. No migration: the previous visit is kept on the device, per user.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STALE_MATCH_STATUS } from './matchStatus';

const KEY_PREFIX = '@p-search/last-seen/';

export function lastSeenKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** The previous visit read in this app session, per user. A remount (sign out and in) keeps it, so the labels stay. */
const sessionPrevious = new Map<string, string | null>();

/**
 * The previous visit's time (ISO), or null on the first visit on this device; the stored value moves to `now`.
 * Once per app session per user: later calls return the same value and write nothing, so the labels do not vanish
 * on a pull-to-refresh or when Home mounts again. A storage error counts as a first visit (nothing is marked new).
 */
export async function takePreviousVisit(userId: string, now: Date = new Date()): Promise<string | null> {
  if (sessionPrevious.has(userId)) return sessionPrevious.get(userId) ?? null;
  let previous: string | null = null;
  try {
    const stored = await AsyncStorage.getItem(lastSeenKey(userId));
    previous = stored && !Number.isNaN(new Date(stored).getTime()) ? stored : null;
  } catch {
    previous = null;
  }
  sessionPrevious.set(userId, previous);
  try {
    await AsyncStorage.setItem(lastSeenKey(userId), now.toISOString());
  } catch {
    // Not fatal: the next session counts from the older visit again.
  }
  return previous;
}

/** Is this match newer than the previous visit? Never on a first visit (null), never for an unreadable time. */
export function isNewSince(createdAt: string | null | undefined, previousVisit: string | null | undefined): boolean {
  if (!createdAt || !previousVisit) return false;
  const created = new Date(createdAt).getTime();
  const seen = new Date(previousVisit).getTime();
  if (Number.isNaN(created) || Number.isNaN(seen)) return false;
  return created > seen;
}

/**
 * Is this match "Új" on the list? Newer than the previous visit AND a current match: a stale one (the latest scan did
 * not re-score it, "Korábbi találatok") is never new, so the header's count always equals the labels the user can see
 * (Ellenőr #267 (2): the stale section is collapsed while fresh matches exist, and its new ones were counted unseen).
 */
export function isNewMatch(m: { created_at?: string | null; status?: string | null }, previousVisit: string | null | undefined): boolean {
  return m.status !== STALE_MATCH_STATUS && isNewSince(m.created_at, previousVisit);
}

/** Test hook: a new app session. */
export function resetSeenMatchesForTest(): void {
  sessionPrevious.clear();
}
