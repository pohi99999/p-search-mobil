import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FREE_FOLLOW_LIMIT,
  followGrant,
  followedKey,
  loadFollowed,
  resetFollowedForTest,
  setFollowRemoteForTest,
  sortByDeadline,
  subscribeFollowed,
  unfollowGrant,
  uploadedKey,
  type FollowedGrant,
} from '../followedGrants';
import { createMemoryFollowRemote } from '../../test-utils/followRemote';

jest.mock('../supabase', () => ({ supabase: {} }));

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

const device = (n: number): FollowedGrant => ({ grantId: `g${n}`, followedAt: `2026-11-2${n}T10:00:00.000Z`, match: match(n) });

describe('followedGrants on the server (round 6, Péter 18328)', () => {
  let server: ReturnType<typeof createMemoryFollowRemote>;

  beforeEach(async () => {
    resetFollowedForTest();
    await AsyncStorage.clear();
    server = createMemoryFollowRemote({ pro: ['pro-user'] });
    setFollowRemoteForTest(server.remote);
  });

  afterAll(() => setFollowRemoteForTest(null));

  it('the free limit is 3 (owner decision 2026-11-21)', () => {
    expect(FREE_FOLLOW_LIMIT).toBe(3);
  });

  it('a follow is stored on the server, per user, and a new session (another device) reads it back', async () => {
    await expect(followGrant('u1', match(1), false, new Date('2026-11-21T10:00:00Z'))).resolves.toBe('followed');
    await expect(followGrant('u1', match(1), false)).resolves.toBe('already');
    expect(server.rows.get('u1')!.map((f) => f.grantId)).toEqual(['g1']);
    resetFollowedForTest();
    await AsyncStorage.clear(); // a fresh install: nothing on the device
    const list = await loadFollowed('u1');
    expect(list.map((f) => [f.grantId, f.followedAt, f.match.id])).toEqual([['g1', '2026-11-21T10:00:00.000Z', 'm1']]);
    await expect(loadFollowed('u2')).resolves.toEqual([]);
  });

  it('a free account stops at 3 without a request; unfollowing frees a place', async () => {
    for (const n of [1, 2, 3]) await expect(followGrant('u1', match(n), false)).resolves.toBe('followed');
    const adds = server.state.calls.add;
    await expect(followGrant('u1', match(4), false)).resolves.toBe('limit');
    expect(server.state.calls.add).toBe(adds);
    await unfollowGrant('u1', 'g2');
    await expect(followGrant('u1', match(4), false)).resolves.toBe('followed');
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1', 'g3', 'g4']);
    expect(server.rows.get('u1')!.map((f) => f.grantId)).toEqual(['g1', 'g3', 'g4']);
  });

  it('the server\'s "limit" wins even when this device thought there was room (followed on another device)', async () => {
    server.rows.set('u1', [device(1), device(2)]);
    await loadFollowed('u1'); // 2 on screen
    server.rows.set('u1', [device(1), device(2), device(3)]); // a 3rd follow from another device
    await expect(followGrant('u1', match(4), false)).resolves.toBe('limit');
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1', 'g2']);
  });

  it('a Pro account has no limit', async () => {
    for (const n of [1, 2, 3, 4, 5]) await expect(followGrant('pro-user', match(n), true)).resolves.toBe('followed');
    expect(await loadFollowed('pro-user')).toHaveLength(5);
  });

  it('every change is announced to the listeners', async () => {
    const listener = jest.fn();
    subscribeFollowed(listener);
    await followGrant('u1', match(1), false);
    await unfollowGrant('u1', 'g1');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('the device list is uploaded once, then marked; a second session does not upload again', async () => {
    await AsyncStorage.setItem(followedKey('u1'), JSON.stringify([device(1), device(2)]));
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1', 'g2']);
    expect(server.rows.get('u1')!.map((f) => [f.grantId, f.followedAt])).toEqual([
      ['g1', '2026-11-21T10:00:00.000Z'],
      ['g2', '2026-11-22T10:00:00.000Z'],
    ]);
    expect(await AsyncStorage.getItem(uploadedKey('u1'))).not.toBeNull();
    // unfollowed on another device afterwards: the old device list must not bring it back
    server.rows.set('u1', [device(1)]);
    resetFollowedForTest();
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1']);
  });

  it('the upload skips what the server has and stops at the limit, as the server answers', async () => {
    server.rows.set('u1', [device(1)]);
    await AsyncStorage.setItem(followedKey('u1'), JSON.stringify([device(1), device(2), device(3), device(4), device(5)]));
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1', 'g2', 'g3']);
  });

  it('a failed upload still shows the device list, and is tried again at the next load (no "done" mark)', async () => {
    await AsyncStorage.setItem(followedKey('u1'), JSON.stringify([device(1)]));
    server.state.failAdd = true;
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1']);
    expect(server.rows.get('u1')).toBeUndefined();
    expect(await AsyncStorage.getItem(uploadedKey('u1'))).toBeNull();
    server.state.failAdd = false;
    resetFollowedForTest();
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1']);
  });

  it('server unreachable: the device list is shown, not cached; the next load asks the server again', async () => {
    await AsyncStorage.setItem(followedKey('u1'), JSON.stringify([device(1), { grantId: 'broken' }]));
    server.state.failList = true;
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toEqual(['g1']);
    server.state.failList = false;
    server.rows.set('u1', [device(2)]);
    expect((await loadFollowed('u1')).map((f) => f.grantId)).toContain('g2');
  });

  // Ellenőr #274 L1: a failed write changes nothing, on screen or in the limit count.
  it('a failed server write keeps the list as it was and throws', async () => {
    await followGrant('u1', match(1), false);
    const listener = jest.fn();
    subscribeFollowed(listener);
    server.state.failAdd = true;
    await expect(followGrant('u1', match(2), false)).rejects.toThrow('offline');
    expect((await loadFollowed('u1')).map((x) => x.grantId)).toEqual(['g1']);
    server.state.failRemove = true;
    await expect(unfollowGrant('u1', 'g1')).rejects.toThrow('offline');
    expect((await loadFollowed('u1')).map((x) => x.grantId)).toEqual(['g1']);
    expect(listener).not.toHaveBeenCalled();
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

});
