// Round 6, item A: the app reads and writes only the two client-granted columns of the digest opt-in.
import { loadDigestPreference, saveDigestPreference } from '../digestPreference';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, from: jest.fn() } }));

const getSession = supabase.auth.getSession as jest.Mock;
const from = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
});

it('reads weekly_digest and weekly_digest_asked_at of the signed-in user', async () => {
  const single = jest.fn().mockResolvedValue({ data: { weekly_digest: true, weekly_digest_asked_at: '2026-11-26T10:00:00Z' }, error: null });
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });
  from.mockReturnValue({ select });
  await expect(loadDigestPreference()).resolves.toEqual({ enabled: true, askedAt: '2026-11-26T10:00:00Z' });
  expect(from).toHaveBeenCalledWith('profiles');
  expect(select).toHaveBeenCalledWith('weekly_digest, weekly_digest_asked_at');
  expect(eq).toHaveBeenCalledWith('id', 'u1');
});

it('a missing value reads as off and not asked', async () => {
  from.mockReturnValue({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) });
  await expect(loadDigestPreference()).resolves.toEqual({ enabled: false, askedAt: null });
});

it('a read error or no session throws (the caller shows nothing)', async () => {
  from.mockReturnValue({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) });
  await expect(loadDigestPreference()).rejects.toThrow('boom');
  getSession.mockResolvedValue({ data: { session: null } });
  await expect(loadDigestPreference()).rejects.toThrow();
});

it('saving writes exactly the two granted columns (the consent time is the database\'s)', async () => {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq });
  from.mockReturnValue({ update });
  const now = new Date('2026-11-26T14:00:00.000Z');
  await expect(saveDigestPreference(true, now)).resolves.toEqual({ enabled: true, askedAt: '2026-11-26T14:00:00.000Z' });
  expect(update).toHaveBeenCalledWith({ weekly_digest: true, weekly_digest_asked_at: '2026-11-26T14:00:00.000Z' });
  expect(Object.keys(update.mock.calls[0][0]).sort()).toEqual(['weekly_digest', 'weekly_digest_asked_at']);
  expect(eq).toHaveBeenCalledWith('id', 'u1');
});

it('a failed save throws', async () => {
  from.mockReturnValue({ update: () => ({ eq: () => Promise.resolve({ error: { message: 'denied' } }) }) });
  await expect(saveDigestPreference(false)).rejects.toThrow('denied');
});
