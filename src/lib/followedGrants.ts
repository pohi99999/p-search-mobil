// P-Search round 11-21 (#5): "Követem" on a grant, and the user's own list with a deadline countdown. Kept on the device
// per user (AsyncStorage), no migration. The match is stored as the list loaded it, so the detail view opens from the
// list without a query; the list screen refreshes each grant's deadline and closed state from the grants table.
// Free accounts follow at most FREE_FOLLOW_LIMIT grants (owner decision 2026-11-21, Péter GO 17591).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MatchWithGrant } from '../hooks/useHomeData';

/** Owner decision 2026-11-21: a free account follows at most 3 grants; Pro has no limit. */
export const FREE_FOLLOW_LIMIT = 3;

const KEY_PREFIX = '@p-search/followed/';

export interface FollowedGrant {
  grantId: string;
  /** ISO time it was followed. */
  followedAt: string;
  /** The match as the home list loaded it (grants included), for opening the detail view. */
  match: MatchWithGrant;
}

export function followedKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

// One in-memory copy per user, so every button and the list screen agree without re-reading the storage.
const cache = new Map<string, FollowedGrant[]>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeFollowed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isFollowedGrant(x: unknown): x is FollowedGrant {
  const f = x as FollowedGrant;
  return !!f && typeof f.grantId === 'string' && typeof f.followedAt === 'string' && !!f.match && typeof f.match.id === 'string';
}

/** The user's followed grants; an unreadable store is an empty list (nothing is lost on screen, nothing is invented). */
export async function loadFollowed(userId: string): Promise<FollowedGrant[]> {
  const cached = cache.get(userId);
  if (cached) return cached;
  let list: FollowedGrant[] = [];
  try {
    const raw = await AsyncStorage.getItem(followedKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed.filter(isFollowedGrant) : [];
  } catch {
    list = [];
  }
  cache.set(userId, list);
  return list;
}

/** The cached list, or undefined before the first load. */
export function peekFollowed(userId: string): FollowedGrant[] | undefined {
  return cache.get(userId);
}

/** Writes the device first; only a stored list becomes the session's list (Ellenőr #274 L1: a failed write left the
 *  follow on screen and in the limit count, and the next start forgot it). A failed write throws, nothing changes. */
async function save(userId: string, list: FollowedGrant[]): Promise<void> {
  await AsyncStorage.setItem(followedKey(userId), JSON.stringify(list));
  cache.set(userId, list);
  emit();
}

export type FollowResult = 'followed' | 'already' | 'limit';

/** Follows the match's grant. A free account at the limit gets 'limit' and nothing is stored. */
export async function followGrant(
  userId: string,
  match: MatchWithGrant,
  isPro: boolean,
  now: Date = new Date(),
): Promise<FollowResult> {
  const list = await loadFollowed(userId);
  if (list.some((f) => f.grantId === match.grant_id)) return 'already';
  if (!isPro && list.length >= FREE_FOLLOW_LIMIT) return 'limit';
  await save(userId, [...list, { grantId: match.grant_id, followedAt: now.toISOString(), match }]);
  return 'followed';
}

export async function unfollowGrant(userId: string, grantId: string): Promise<void> {
  const list = await loadFollowed(userId);
  await save(userId, list.filter((f) => f.grantId !== grantId));
}

/**
 * The list's order: the nearest deadline first, then the ones without a deadline, the expired ones last.
 * `now` decides what is expired (a deadline stays open through its own day, as in matchStatus.isOpenGrant).
 */
export function sortByDeadline(list: FollowedGrant[], now: Date = new Date()): FollowedGrant[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rank = (f: FollowedGrant): [number, number] => {
    const d = f.match.grants?.deadline ? new Date(f.match.grants.deadline).getTime() : NaN;
    // Ellenőr #274 J1: a grant closed at the source can no longer be submitted; it goes with the expired ones, last
    // (the home list treats it the same way).
    if ((f.match.grants as { source_closed_at?: string | null } | undefined)?.source_closed_at) return [2, Number.isNaN(d) ? 0 : -d];
    if (Number.isNaN(d)) return [1, 0];
    const dayStart = new Date(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate()).getTime();
    return dayStart < startOfToday ? [2, -d] : [0, d];
  };
  return [...list].sort((a, b) => {
    const [ga, va] = rank(a);
    const [gb, vb] = rank(b);
    return ga - gb || va - vb;
  });
}

/** Test hook: a new app session. */
export function resetFollowedForTest(): void {
  cache.clear();
  listeners.clear();
}
