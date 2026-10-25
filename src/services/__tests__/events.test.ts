import { sanitizeMeta, scoreBand, setMatchFeedback, track } from '../events';
import { logger } from '../../utils/logger';
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '17' }));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
const mockInsert = jest.fn();
const mockRpc = jest.fn();
const mockGetSession = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: () => mockGetSession() }, from: () => ({ insert: mockInsert }), rpc: (...a: unknown[]) => mockRpc(...a) },
}));


const flush = () => new Promise((r) => setTimeout(r, 0));
const match = { match_id: 'm-1', grant_id: 'g-1', rank: 2, score_band: '80-100' as const };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  mockInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ error: null });
});

describe('sanitizeMeta (card [G])', () => {
  it('keeps whitelisted scalar keys, drops other keys, long strings and objects', () => {
    expect(
      sanitizeMeta({
        ok: true, matches_found: 3, error_code: 'network',
        company_name: 'Minta Kft', tax_number: '12345678', message: 'szabad szöveg',
        to: 'x'.repeat(41), rank: { nested: 1 }, duration_ms: Number.NaN,
      }),
    ).toEqual({ ok: true, matches_found: 3, error_code: 'network' });
  });
});

describe('track', () => {
  it('sends the event as the signed-in user with version and platform', async () => {
    track('search_result', { ok: true, matches_found: 3, duration_ms: 1200 });
    await flush();
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-1', event: 'search_result', meta: { ok: true, matches_found: 3, duration_ms: 1200 },
      platform: 'ios', app_version: '1.0.0 (17)',
    });
  });

  it('a forbidden key never leaves the device, even when a caller forces it past the types', async () => {
    track('onboarding_done', { has_goals: true, company_name: 'Minta Kft' } as never);
    await flush();
    expect(mockInsert.mock.calls[0][0].meta).toEqual({ has_goals: true });
  });

  it('a failed mockInsert only warns, never throws', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'boom' } });
    expect(() => track('app_open')).not.toThrow();
    await flush();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('without a session nothing is sent', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    track('app_open');
    await flush();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('setMatchFeedback', () => {
  it('writes through the mockRpc and records the event', async () => {
    await setMatchFeedback(match, 'useful');
    expect(mockRpc).toHaveBeenCalledWith('set_match_feedback', { p_match_id: 'm-1', p_value: 'useful' });
    await flush();
    expect(mockInsert.mock.calls[0][0]).toMatchObject({ event: 'match_feedback', meta: { ...match, value: 'useful' } });
  });

  it('a failed mockRpc throws and records nothing', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'match not found' } });
    await expect(setMatchFeedback(match, 'not_relevant')).rejects.toEqual({ message: 'match not found' });
    await flush();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('clearing (null) records no event', async () => {
    await setMatchFeedback(match, null);
    await flush();
    expect(mockRpc).toHaveBeenCalledWith('set_match_feedback', { p_match_id: 'm-1', p_value: null });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

it('score bands follow the 40/60/80 cut', () => {
  expect([40, 59, 60, 79, 80, 100].map(scoreBand)).toEqual(['40-59', '40-59', '60-79', '60-79', '80-100', '80-100']);
});
