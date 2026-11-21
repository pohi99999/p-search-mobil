import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useHomeStatus, type HomeStatus } from '../useHomeStatus';
import { takePreviousVisit } from '../../lib/seenMatches';
import { fetchGrantFreshness } from '../../lib/grantFreshness';

jest.mock('../../lib/seenMatches', () => ({ takePreviousVisit: jest.fn() }));
jest.mock('../../lib/grantFreshness', () => ({ fetchGrantFreshness: jest.fn() }));

// Ellenőr #267 (5a): "the freshness is never read again" slipped through; the hook had no test.
describe('useHomeStatus (round 11-21 #2, #4)', () => {
  let last: HomeStatus | undefined;
  function Probe({ userId, refreshKey }: { userId: string | null; refreshKey: unknown }) {
    last = useHomeStatus(userId, refreshKey);
    return null;
  }
  const flush = () => act(async () => {});

  beforeEach(() => {
    jest.clearAllMocks();
    last = undefined;
    (takePreviousVisit as jest.Mock).mockResolvedValue('2026-11-15T00:00:00Z');
    (fetchGrantFreshness as jest.Mock)
      .mockResolvedValueOnce({ updatedAt: '2026-11-20T00:00:00Z', openCount: 47 })
      .mockResolvedValueOnce({ updatedAt: '2026-11-21T09:07:00Z', openCount: 52 });
  });

  it('reads the freshness again when the refresh key changes; the previous visit once per user', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<Probe userId="u1" refreshKey={1} />); });
    await flush();
    expect(last).toEqual({ previousVisit: '2026-11-15T00:00:00Z', freshness: { updatedAt: '2026-11-20T00:00:00Z', openCount: 47 } });
    await act(async () => { tree!.update(<Probe userId="u1" refreshKey={2} />); });
    await flush();
    expect(fetchGrantFreshness).toHaveBeenCalledTimes(2);
    expect(last?.freshness).toEqual({ updatedAt: '2026-11-21T09:07:00Z', openCount: 52 });
    expect(takePreviousVisit).toHaveBeenCalledTimes(1);
  });

  it('without a user id the previous visit is not read (nothing is marked)', async () => {
    await act(async () => { renderer.create(<Probe userId={null} refreshKey={1} />); });
    await flush();
    expect(takePreviousVisit).not.toHaveBeenCalled();
    expect(last?.previousVisit).toBeUndefined();
  });
});
