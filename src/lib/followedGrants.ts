// P-Search round 11-21 (#5): "Követem" on a grant, and the user's own list with a deadline countdown. The match is
// stored as the list loaded it, so the detail view opens from the list without a query; the list screen refreshes
// each grant's deadline and closed state from the grants table.
// Free accounts follow at most FREE_FOLLOW_LIMIT grants (owner decision 2026-11-21, Péter GO 17591).
//
// Round 6 (Péter, Telegram 18328 via Marveen 9160): the list lives on the server (public.followed_grants,
// migration 20261125120000), so a reinstall or a second device keeps it, and the free limit is enforced there (the
// insert trigger answers P0001 follow_limit). The list the device kept until now is uploaded once per user; the
// device copy is left in place and only read again when the server cannot be reached.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MatchWithGrant } from '../hooks/useHomeData';
import { supabase } from './supabase';

/** Owner decision 2026-11-21: a free account follows at most 3 grants; Pro has no limit. */
export const FREE_FOLLOW_LIMIT = 3;

const KEY_PREFIX = '@p-search/followed/';
const UPLOADED_PREFIX = '@p-search/followed-uploaded/';

export interface FollowedGrant {
  grantId: string;
  /** ISO time it was followed. */
  followedAt: string;
  /** The match as the home list loaded it (grants included), for opening the detail view. */
  match: MatchWithGrant;
}

/** The device key of the list kept before round 6 (read for the one-time upload and as the offline fallback). */
export function followedKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function uploadedKey(userId: string): string {
  return `${UPLOADED_PREFIX}${userId}`;
}

export type AddResult = 'added' | 'already' | 'limit';

/** Where the list lives. The default is Supabase; tests pass an in-memory one (setFollowRemoteForTest). */
export interface FollowRemote {
  /** The user's rows, oldest first. Throws when the server cannot be read. */
  list(userId: string): Promise<FollowedGrant[]>;
  /** Adds one row. 'limit' and 'already' are answers; any other failure throws. */
  add(userId: string, item: FollowedGrant): Promise<AddResult>;
  /** Removes one row (none there is fine). Throws when the server refuses. */
  remove(userId: string, grantId: string): Promise<void>;
}

const supabaseRemote: FollowRemote = {
  async list(userId) {
    const { data, error } = await supabase
      .from('followed_grants')
      .select('grant_id, followed_at, match_snapshot')
      .eq('user_id', userId)
      .order('followed_at', { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { grant_id: string; followed_at: string; match_snapshot: unknown }[])
      .map((r) => ({ grantId: r.grant_id, followedAt: r.followed_at, match: r.match_snapshot as MatchWithGrant }))
      .filter(isFollowedGrant);
  },
  async add(userId, item) {
    const { error } = await supabase
      .from('followed_grants')
      .insert({ user_id: userId, grant_id: item.grantId, followed_at: item.followedAt, match_snapshot: item.match });
    if (!error) return 'added';
    if (error.code === 'P0001' && /follow_limit/.test(error.message ?? '')) return 'limit';
    if (error.code === '23505') return 'already';
    throw new Error(error.message);
  },
  async remove(userId, grantId) {
    const { error } = await supabase.from('followed_grants').delete().eq('user_id', userId).eq('grant_id', grantId);
    if (error) throw new Error(error.message);
  },
};

let remote: FollowRemote = supabaseRemote;

// One in-memory copy per user, so every button and the list screen agree without re-reading the server.
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

/** The list the device kept before round 6; anything unreadable is an empty list. */
async function readDeviceList(userId: string): Promise<FollowedGrant[]> {
  try {
    const raw = await AsyncStorage.getItem(followedKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isFollowedGrant) : [];
  } catch {
    return [];
  }
}

type UploadOutcome = { kind: 'none' } | { kind: 'added' } | { kind: 'failed'; device: FollowedGrant[] };

/**
 * Uploads the device list once per user. A row the server already has, or one past the free limit, is skipped (the
 * server decides, nothing is invented). A failed upload sets no "done" mark, so the next load tries again.
 */
async function uploadDeviceListOnce(userId: string, onServer: FollowedGrant[]): Promise<UploadOutcome> {
  let done: string | null = null;
  try {
    done = await AsyncStorage.getItem(uploadedKey(userId));
  } catch {
    return { kind: 'none' };
  }
  if (done) return { kind: 'none' };
  const device = await readDeviceList(userId);
  const have = new Set(onServer.map((f) => f.grantId));
  let added = false;
  try {
    for (const item of device) {
      if (have.has(item.grantId)) continue;
      if ((await remote.add(userId, item)) === 'added') added = true;
    }
    await AsyncStorage.setItem(uploadedKey(userId), new Date().toISOString());
  } catch {
    return { kind: 'failed', device };
  }
  return added ? { kind: 'added' } : { kind: 'none' };
}

/**
 * The user's followed grants from the server (after the one-time upload of the device list). When the server cannot
 * be read, the device list is shown and not cached, so the next load asks the server again.
 */
export async function loadFollowed(userId: string): Promise<FollowedGrant[]> {
  const cached = cache.get(userId);
  if (cached) return cached;
  let list: FollowedGrant[];
  try {
    list = await remote.list(userId);
    const upload = await uploadDeviceListOnce(userId, list);
    if (upload.kind === 'failed') {
      // not uploaded yet: show both, uncached, so nothing the device kept disappears and the next load retries
      const have = new Set(list.map((f) => f.grantId));
      return [...list, ...upload.device.filter((f) => !have.has(f.grantId))];
    }
    if (upload.kind === 'added') list = await remote.list(userId);
  } catch {
    return readDeviceList(userId);
  }
  cache.set(userId, list);
  return list;
}

/** The cached list, or undefined before the first load. */
export function peekFollowed(userId: string): FollowedGrant[] | undefined {
  return cache.get(userId);
}

export type FollowResult = 'followed' | 'already' | 'limit';

/**
 * Follows the match's grant. The server decides the limit; a free account already at the limit is answered here
 * without a request. Only a stored follow changes the list (Ellenőr #274 L1); any other failure throws.
 */
export async function followGrant(
  userId: string,
  match: MatchWithGrant,
  isPro: boolean,
  now: Date = new Date(),
): Promise<FollowResult> {
  const list = await loadFollowed(userId);
  if (list.some((f) => f.grantId === match.grant_id)) return 'already';
  if (!isPro && list.length >= FREE_FOLLOW_LIMIT) return 'limit';
  const item: FollowedGrant = { grantId: match.grant_id, followedAt: now.toISOString(), match };
  const answer = await remote.add(userId, item);
  if (answer === 'limit') return 'limit';
  if (answer === 'already') {
    // followed on another device meanwhile: read the server's list
    cache.delete(userId);
    await loadFollowed(userId);
    emit();
    return 'already';
  }
  cache.set(userId, [...list, item]);
  emit();
  return 'followed';
}

/** Unfollows; a failure throws and changes nothing. */
export async function unfollowGrant(userId: string, grantId: string): Promise<void> {
  const list = await loadFollowed(userId);
  await remote.remove(userId, grantId);
  cache.set(userId, list.filter((f) => f.grantId !== grantId));
  emit();
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

/** Test hook: where the list lives (null restores Supabase). */
export function setFollowRemoteForTest(r: FollowRemote | null): void {
  remote = r ?? supabaseRemote;
}
