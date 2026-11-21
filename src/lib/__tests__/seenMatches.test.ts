import AsyncStorage from '@react-native-async-storage/async-storage';
import { isNewSince, lastSeenKey, resetSeenMatchesForTest, takePreviousVisit } from '../seenMatches';

describe('seenMatches (round 11-21 #2)', () => {
  beforeEach(async () => {
    resetSeenMatchesForTest();
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('a first visit has no previous visit, and the visit is stored', async () => {
    const now = new Date('2026-11-21T10:00:00Z');
    await expect(takePreviousVisit('u1', now)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(lastSeenKey('u1'))).resolves.toBe(now.toISOString());
  });

  it('the next app session gets the stored visit, and stores its own', async () => {
    await AsyncStorage.setItem(lastSeenKey('u1'), '2026-11-14T08:00:00.000Z');
    const now = new Date('2026-11-21T10:00:00Z');
    await expect(takePreviousVisit('u1', now)).resolves.toBe('2026-11-14T08:00:00.000Z');
    await expect(AsyncStorage.getItem(lastSeenKey('u1'))).resolves.toBe(now.toISOString());
  });

  it('within one session the previous visit stays (a refresh keeps the labels)', async () => {
    await AsyncStorage.setItem(lastSeenKey('u1'), '2026-11-14T08:00:00.000Z');
    await takePreviousVisit('u1', new Date('2026-11-21T10:00:00Z'));
    await expect(takePreviousVisit('u1', new Date('2026-11-21T11:00:00Z'))).resolves.toBe('2026-11-14T08:00:00.000Z');
  });

  it('users are kept apart', async () => {
    await AsyncStorage.setItem(lastSeenKey('u1'), '2026-11-14T08:00:00.000Z');
    await expect(takePreviousVisit('u2')).resolves.toBeNull();
  });

  it('an unreadable stored value or a storage error counts as a first visit', async () => {
    await AsyncStorage.setItem(lastSeenKey('u1'), 'not a date');
    await expect(takePreviousVisit('u1')).resolves.toBeNull();
    resetSeenMatchesForTest();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(takePreviousVisit('u3')).resolves.toBeNull();
  });

  it.each([
    ['2026-11-20T10:00:00Z', '2026-11-19T10:00:00Z', true],
    ['2026-11-18T10:00:00Z', '2026-11-19T10:00:00Z', false],
    ['2026-11-19T10:00:00Z', '2026-11-19T10:00:00Z', false],
    ['2026-11-20T10:00:00Z', null, false],
    ['2026-11-20T10:00:00Z', undefined, false],
    [null, '2026-11-19T10:00:00Z', false],
    ['garbage', '2026-11-19T10:00:00Z', false],
  ])('isNewSince(%s, %s) = %s', (created, seen, expected) => {
    expect(isNewSince(created as string | null, seen as string | null | undefined)).toBe(expected);
  });
});

describe('isNewMatch (Ellenőr #267 (2))', () => {
  const { isNewMatch } = require('../seenMatches');
  it('a current match after the previous visit is new; a stale one never is', () => {
    expect(isNewMatch({ created_at: '2026-11-20T10:00:00Z', status: 'new' }, '2026-11-19T10:00:00Z')).toBe(true);
    expect(isNewMatch({ created_at: '2026-11-20T10:00:00Z', status: 'stale' }, '2026-11-19T10:00:00Z')).toBe(false);
    expect(isNewMatch({ created_at: '2026-11-18T10:00:00Z', status: 'new' }, '2026-11-19T10:00:00Z')).toBe(false);
  });
});
