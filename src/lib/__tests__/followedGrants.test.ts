import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FREE_FOLLOW_LIMIT,
  followGrant,
  followedKey,
  loadFollowed,
  resetFollowedForTest,
  sortByDeadline,
  subscribeFollowed,
  unfollowGrant,
  type FollowedGrant,
} from '../followedGrants';

const match = (n: number, deadline: string | null = null) =>
  ({
    id: `m${n}`,
    business_id: 'b',
    grant_id: `g${n}`,
    match_score: 80,
    match_reasoning: '',
    status: 'new',
    created_at: '',
    grants: { id: `g${n}`, title: `Pályázat ${n}`, deadline },
  }) as any;

describe('followedGrants (round 11-21 #5)', () => {
  beforeEach(async () => {
    resetFollowedForTest();
    await AsyncStorage.clear();
  });

  it('the free limit is 3 (owner decision 2026-11-21)', () => {
    expect(FREE_FOLLOW_LIMIT).toBe(3);
  });

  it('follows, keeps it on the device per user, and a new session reads it back', async () => {
    await expect(followGrant('u1', match(1), false, new Date('2026-11-21T10:00:00Z'))).resolves.toBe('followed');
    await expect(followGrant('u1', match(1), false)).resolves.toBe('already');
    resetFollowedForTest();
    const list = await loadFollowed('u1');
    expect(list.map((f) => [f.grantId, f.followedAt, f.match.id])).toEqual([['g1', '2026-11-21T10:00:00.000Z', 'm1']]);
    await expect(loadFollowed('u2')).resolves.toEqual([]);
  });

  it('a free account stops at 3, nothing is stored past it; unfollowing frees a place', async () => {
    for (const n of [1, 2, 3]) await expect(followGrant('u1', match(n), false)).resolves.toBe('followed');
    await expect(followGrant('u1', match(4), false)).resolves.toBe('limit');
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1', 'g2', 'g3']);
    resetFollowedForTest();
    expect(JSON.parse((await AsyncStorage.getItem(followedKey('u1')))!)).toHaveLength(3);
    await unfollowGrant('u1', 'g2');
    await expect(followGrant('u1', match(4), false)).resolves.toBe('followed');
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1', 'g3', 'g4']);
  });

  it('a Pro account has no limit', async () => {
    for (const n of [1, 2, 3, 4, 5]) await expect(followGrant('u1', match(n), true)).resolves.toBe('followed');
    expect(await loadFollowed('u1')).toHaveLength(5);
  });

  it('every change is announced to the listeners', async () => {
    const listener = jest.fn();
    subscribeFollowed(listener);
    await followGrant('u1', match(1), false);
    await unfollowGrant('u1', 'g1');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('an unreadable store is an empty list, a broken row is dropped', async () => {
    await AsyncStorage.setItem(followedKey('u1'), 'not json');
    await expect(loadFollowed('u1')).resolves.toEqual([]);
    resetFollowedForTest();
    await AsyncStorage.setItem(followedKey('u2'), JSON.stringify([{ grantId: 'g1' }, { grantId: 'g2', followedAt: 'x', match: { id: 'm2' } }]));
    expect((await loadFollowed('u2')).map((f) => f.grantId)).toEqual(['g2']);
  });

  it('sorts the nearest deadline first, then no deadline, the expired last; today is still open', () => {
    const now = new Date(2026, 10, 21, 15, 0);
    const f = (n: number, deadline: string | null): FollowedGrant => ({ grantId: `g${n}`, followedAt: '', match: match(n, deadline) });
    const list = [
      f(1, null),
      f(2, new Date(2026, 11, 20).toISOString()),
      f(3, new Date(2026, 10, 10).toISOString()),
      f(4, new Date(2026, 10, 21, 0, 0).toISOString()),
      f(5, new Date(2026, 10, 25).toISOString()),
      f(6, new Date(2026, 9, 1).toISOString()),
    ];
    expect(sortByDeadline(list, now).map((x) => x.grantId)).toEqual(['g4', 'g5', 'g2', 'g1', 'g3', 'g6']);
  });

  // Ellenőr #274 J1: closed at the source goes with the expired ones, last, whatever its deadline.
  it('a grant closed at the source sorts with the expired ones', () => {
    const now = new Date(2026, 10, 21, 15, 0);
    const f = (n: number, deadline: string | null, closed: string | null = null): FollowedGrant => ({
      grantId: `g${n}`,
      followedAt: '',
      match: { ...match(n, deadline), grants: { ...match(n, deadline).grants, source_closed_at: closed } },
    });
    const list = [
      f(1, new Date(2026, 10, 23).toISOString(), '2026-11-20T00:00:00Z'),
      f(2, new Date(2026, 10, 25).toISOString()),
      f(3, null),
      f(4, new Date(2026, 9, 1).toISOString()),
    ];
    expect(sortByDeadline(list, now).map((x) => x.grantId)).toEqual(['g2', 'g3', 'g1', 'g4']);
  });

  // Ellenőr #274 L1: a failed write changes nothing, on screen or in the limit count.
  it('a failed device write keeps the list as it was and throws', async () => {
    await followGrant('u1', match(1), false);
    const listener = jest.fn();
    subscribeFollowed(listener);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(followGrant('u1', match(2), false)).rejects.toThrow('disk full');
    expect((await loadFollowed('u1')).map((x) => x.grantId)).toEqual(['g1']);
    expect(listener).not.toHaveBeenCalled();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(unfollowGrant('u1', 'g1')).rejects.toThrow('disk full');
    expect((await loadFollowed('u1')).map((x) => x.grantId)).toEqual(['g1']);
  });
});
