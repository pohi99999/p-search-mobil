import type { AddResult, FollowedGrant, FollowRemote } from '../lib/followedGrants';

/**
 * An in-memory public.followed_grants for tests: the same answers as the server (migration 20261125120000): a
 * duplicate is 'already', a free user's 4th row is 'limit' (pass `pro` for users without a limit), and `fail` makes
 * the next calls throw like an unreachable server.
 */
export function createMemoryFollowRemote(opts: { pro?: string[]; limit?: number } = {}) {
  const rows = new Map<string, FollowedGrant[]>();
  const pro = new Set(opts.pro ?? []);
  const limit = opts.limit ?? 3;
  const state = { failList: false, failAdd: false, failRemove: false, calls: { list: 0, add: 0, remove: 0 } };
  const of = (u: string) => rows.get(u) ?? [];
  const remote: FollowRemote = {
    async list(userId) {
      state.calls.list++;
      if (state.failList) throw new Error('offline');
      return [...of(userId)];
    },
    async add(userId, item): Promise<AddResult> {
      state.calls.add++;
      if (state.failAdd) throw new Error('offline');
      const list = of(userId);
      if (list.some((f) => f.grantId === item.grantId)) return 'already';
      if (!pro.has(userId) && list.length >= limit) return 'limit';
      rows.set(userId, [...list, item]);
      return 'added';
    },
    async remove(userId, grantId) {
      state.calls.remove++;
      if (state.failRemove) throw new Error('offline');
      rows.set(userId, of(userId).filter((f) => f.grantId !== grantId));
    },
  };
  return { remote, rows, state };
}
