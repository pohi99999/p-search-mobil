import { Alert, AppState } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { renderHook, act } from '../../test-utils/renderHook';
import { useHomeData, resetSessionEventsForTest } from '../useHomeData';
import { track } from '../../services/events';
import { sanitizeMeta } from '../../services/eventMeta';
import { supabase } from '../../lib/supabase';
import { useBilling } from '../../context/BillingContext';
import { logger } from '../../utils/logger';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
    functions: {
      invoke: jest.fn(),
    }
  },
}));

jest.mock('../../context/BillingContext', () => ({
  useBilling: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('useHomeData', () => {
  const mockNavigation: any = {
    replace: jest.fn(),
    navigate: jest.fn(),
  };

  const mockSession = { user: { id: 'test-user-id' } };
  const mockBusinessProfile = { id: 'test-business-id', user_id: 'test-user-id' };
  const mockUserProfile = { id: 'test-user-id', search_count: 0 };
  const mockMatches = [{ id: 'match-1', match_score: 95 }];

  beforeEach(() => {
    jest.clearAllMocks();
    (useBilling as jest.Mock).mockReturnValue({ isPro: false });

    Alert.alert = jest.fn();
    supabase.functions.invoke = jest.fn().mockResolvedValue({ data: { success: true }, error: null });

    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: mockSession },
    });
  });

  const setupSupabaseMocks = (
    profileError = null,
    profileData: any = mockBusinessProfile,
    userData: any = mockUserProfile,
    matchesError = null,
    matchesData: any = mockMatches,
    updateError = null,
    plans: { data: any; error: any } = { data: [], error: null }
  ) => {
    const mockFrom = jest.fn((table: string) => {
      if (table === 'business_profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: profileData, error: profileError }),
        };
      }
      if (table === 'profiles') {
        const chain: any = {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation(() => {
              if (chain.update.mock.calls.length > 0) {
                  return Promise.resolve({ error: updateError });
              }
              return chain;
          }),
          single: jest.fn().mockResolvedValue({ data: userData }),
        };
        return chain;
      }
      if (table === 'action_plans') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(plans),
        };
      }
      if (table === 'grant_matches') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: matchesData, error: matchesError }),
        };
      }
      return {};
    });

    (supabase.from as jest.Mock).mockImplementation(mockFrom);
  };

  describe('usage events (card [G2])', () => {
    const calls = (name: string) => (track as jest.Mock).mock.calls.filter(([e]: [string]) => e === name);
    // Every recorded meta passes the whitelist unchanged: no key would be dropped on the way to app_events.
    const expectWhitelisted = () => {
      for (const [, meta] of (track as jest.Mock).mock.calls) {
        if (meta !== undefined) expect(sanitizeMeta(meta)).toEqual(meta);
      }
    };
    beforeEach(() => resetSessionEventsForTest());

    it('app_open once per session, match_list_view once with stale and expired counts', async () => {
      const rows = [
        { id: 'a', status: 'new', match_score: 90, grants: { deadline: '2999-01-01T00:00:00Z' } },
        { id: 'b', status: 'stale', match_score: 60, grants: { deadline: null } },
      ];
      setupSupabaseMocks(null, mockBusinessProfile, mockUserProfile, null, rows);
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(calls('match_list_view')).toHaveLength(1));
      expect(calls('app_open')).toHaveLength(1);
      expect(calls('match_list_view')[0][1]).toEqual({ n_total: 2, n_stale: 1, n_expired: 0 });
      await act(async () => { await result.current.fetchData(); });
      expect(calls('app_open')).toHaveLength(1);
      expect(calls('match_list_view')).toHaveLength(1);
      expectWhitelisted();
    });

    it('a manual search: search_start manual, then search_result ok with the counts and a duration', async () => {
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        Promise.resolve(fn === 'match-grants' ? { data: { matches_found: 3, candidates_considered: 12 }, error: null } : { data: {}, error: null }),
      );
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.handleNewSearch(); });
      expect(calls('search_start')[0][1]).toEqual({ trigger: 'manual' });
      const meta = calls('search_result')[0][1];
      expect(meta).toMatchObject({ ok: true, matches_found: 3, candidates_considered: 12 });
      expect(typeof meta.duration_ms).toBe('number');
      expectWhitelisted();
    });

    it('the automatic first search is search_start after_onboarding', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, { id: 'test-user-id', last_scan_at: null }, null, []);
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        Promise.resolve(fn === 'match-grants' ? { data: { matches_found: 0 }, error: null } : { data: {}, error: null }),
      );
      renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(calls('search_start')).toHaveLength(1));
      expect(calls('search_start')[0][1]).toEqual({ trigger: 'after_onboarding' });
    });

    it('the daily cap: daily_limit_hit, search_result ok:false daily_limit, and the paywall opens as home_limit', async () => {
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        fn === 'match-grants'
          ? Promise.resolve({ data: null, error: { context: { status: 403, json: () => Promise.resolve({ code: 'daily_limit', error: 'Elérted a napi keretet.' }) } } })
          : Promise.resolve({ data: {}, error: null }),
      );
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.handleNewSearch(); });
      expect(calls('daily_limit_hit')).toHaveLength(1);
      expect(calls('search_result')[0][1]).toMatchObject({ ok: false, error_code: 'daily_limit' });
      const buttons = (Alert.alert as jest.Mock).mock.calls.find(([t]: [string]) => t === 'Napi keresési limit')[2];
      buttons[1].onPress();
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Paywall', { source: 'home_limit' });
      expectWhitelisted();
    });

    it('the AI quota: search_result with gemini_quota and whether the search was given back, no text', async () => {
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        fn === 'match-grants'
          ? Promise.resolve({ data: null, error: { context: { status: 429, json: () => Promise.resolve({ code: 'gemini_quota', error: 'A napi AI-keret elfogyott.', search_refunded: true }) } } })
          : Promise.resolve({ data: {}, error: null }),
      );
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.handleNewSearch(); });
      const meta = calls('search_result')[0][1];
      expect(meta).toMatchObject({ ok: false, error_code: 'gemini_quota', search_refunded: true });
      expect(JSON.stringify(meta)).not.toMatch(/AI-keret/);
      expect(calls('daily_limit_hit')).toHaveLength(0);
      expectWhitelisted();
    });

    it('app_open again after more than 30 minutes in the background, not after a short one', async () => {
      let onChange: (state: string) => void = () => {};
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (state: string) => void) => {
        onChange = h;
        return { remove: jest.fn() };
      }) as never);
      const clock = jest.spyOn(Date, 'now');
      setupSupabaseMocks();
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(calls('app_open')).toHaveLength(1);
      clock.mockReturnValue(1_000_000);
      act(() => onChange('background'));
      clock.mockReturnValue(1_000_000 + 5 * 60 * 1000);
      act(() => onChange('active'));
      expect(calls('app_open')).toHaveLength(1);
      act(() => onChange('background'));
      clock.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 31 * 60 * 1000);
      act(() => onChange('active'));
      expect(calls('app_open')).toHaveLength(2);
      clock.mockRestore();
    });

    it('a network failure is search_result ok:false network', async () => {
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        fn === 'match-grants' ? Promise.reject(new Error('Network request failed')) : Promise.resolve({ data: {}, error: null }),
      );
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.handleNewSearch(); });
      expect(calls('search_result')[0][1]).toMatchObject({ ok: false, error_code: 'network' });
    });
  });

  describe('empty home and the first search (card [D])', () => {
    const matchGrantsCalls = () =>
      (supabase.functions.invoke as jest.Mock).mock.calls.filter(([fn]: [string]) => fn === 'match-grants').length;

    it('a company never scanned gets its first search started once, by itself', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, { id: 'test-user-id', last_scan_at: null }, null, []);
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        Promise.resolve(fn === 'match-grants' ? { data: { matches_found: 0 }, error: null } : { data: {}, error: null }),
      );
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(matchGrantsCalls()).toBe(1));
      expect(result.current.hasSearched).toBe(false);
      // The no-match message promises no notification any more.
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('AI keresés kész', expect.any(String)));
      const text = (Alert.alert as jest.Mock).mock.calls.find(([t]: [string]) => t === 'AI keresés kész')[1];
      expect(text).not.toMatch(/értesítünk/);
      await act(async () => { await result.current.fetchData(); });
      expect(matchGrantsCalls()).toBe(1);
    });

    it('a failed first search is not retried in a loop', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, { id: 'test-user-id', last_scan_at: null }, null, []);
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        Promise.resolve(fn === 'match-grants' ? { data: null, error: { message: 'boom' } } : { data: {}, error: null }),
      );
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(matchGrantsCalls()).toBe(1));
      await waitFor(() => expect(result.current.searching).toBe(false));
      await act(async () => { await result.current.fetchData(); });
      expect(matchGrantsCalls()).toBe(1);
    });

    it('a company already scanned starts nothing and counts as searched', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, { id: 'test-user-id', last_scan_at: '2026-10-20T08:00:00Z' }, null, []);
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.hasSearched).toBe(true);
      expect(matchGrantsCalls()).toBe(0);
    });
  });

  describe('expired grants (card [C])', () => {
    const past = { deadline: '2020-01-01T00:00:00Z' };
    const future = { deadline: '2999-01-01T00:00:00Z' };
    const rows = [
      { id: 'open', status: 'new', match_score: 90, grants: future },
      { id: 'expired', status: 'new', match_score: 80, grants: past },
      { id: 'expired-with-plan', status: 'new', match_score: 70, grants: past },
    ];

    it('hides an expired match nobody acted on, keeps the one with an action plan', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, mockUserProfile, null, rows, null, {
        data: [{ match_id: 'expired-with-plan' }, { match_id: null }],
        error: null,
      });
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.matches.map((m: any) => m.id)).toEqual(['open', 'expired-with-plan']);
    });

    it('a failed action plan lookup hides nothing', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, mockUserProfile, null, rows, null, {
        data: null,
        error: { message: 'boom' },
      });
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.matches.map((m: any) => m.id)).toEqual(['open', 'expired', 'expired-with-plan']);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('fetchData', () => {
    it('handles missing session', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('fetches data successfully', async () => {
      setupSupabaseMocks();

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.profile).toEqual(mockBusinessProfile);
      expect(result.current.matches).toEqual(mockMatches);
      expect(mockNavigation.replace).not.toHaveBeenCalled();
    });

    it('redirects to Onboarding if profile is missing', async () => {
      setupSupabaseMocks(null, null);

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockNavigation.replace).toHaveBeenCalledWith('Onboarding');
    });

    it('handles and logs profile errors (not PGRST116)', async () => {
      const error = { code: 'OTHER_ERR', message: 'Test error' };
      setupSupabaseMocks(error as any);

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logger.error).toHaveBeenCalledWith(error);
    });

    it('ignores PGRST116 profile error', async () => {
      const error = { code: 'PGRST116', message: 'No rows' };
      setupSupabaseMocks(error as any, null);

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logger.error).not.toHaveBeenCalledWith(error);
      expect(mockNavigation.replace).toHaveBeenCalledWith('Onboarding');
    });

    it('handles and logs matches errors', async () => {
      const matchesErr = new Error('Matches error');
      setupSupabaseMocks(null, mockBusinessProfile, mockUserProfile, matchesErr as any);

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logger.error).toHaveBeenCalledWith(matchesErr);
    });

    it('handles catch block in fetchData', async () => {
       const unexpectedErr = new Error('Session error');
       (supabase.auth.getSession as jest.Mock).mockRejectedValue(unexpectedErr);

       const { result } = renderHook(() => useHomeData(mockNavigation));

       await waitFor(() => expect(result.current.loading).toBe(false));

       expect(logger.error).toHaveBeenCalledWith(unexpectedErr);
       expect(result.current.loading).toBe(false);
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      setupSupabaseMocks();
      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signOut();
      });

      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('handleNewSearch', () => {
    it('alerts if user profile is missing', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, null);
      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(Alert.alert).toHaveBeenCalledWith("Felhasználói profil nem található!");
    });

    it('handles Pro user search', async () => {
      (useBilling as jest.Mock).mockReturnValue({ isPro: true });
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'match-grants') {
          return Promise.resolve({ data: { success: true, matches_found: 3 }, error: null });
        }
        return Promise.resolve({ data: {}, error: null });
      });

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleNewSearch();
      });

      // The search must actually run the matching engine -- this is the only
      // thing that creates grant_matches rows.
      expect(supabase.functions.invoke).toHaveBeenCalledWith('match-grants', {
        body: { business_profile_id: mockBusinessProfile.id },
      });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('trigger-n8n-webhook', expect.any(Object));
      expect(Alert.alert).toHaveBeenCalledWith(
        'AI keresés kész',
        expect.stringContaining('3'),
      );
    });

    // Card 6303fd73: 429/503 from match-grants carry {code, error}; the Hungarian text must reach the
    // user instead of the generic failure, and only "busy" offers an immediate retry.
    const aiUnavailable = (status: number, code: string, error: string) => ({
      data: null,
      error: { context: { status, json: () => Promise.resolve({ code, error }) } },
    });

    it('429 gemini_quota: shows the server text, no retry button', async () => {
      (useBilling as jest.Mock).mockReturnValue({ isPro: true });
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) =>
        fn === 'match-grants'
          ? Promise.resolve(aiUnavailable(429, 'gemini_quota', 'A napi AI-keret elfogyott, holnap 09:00 után próbáld újra.'))
          : Promise.resolve({ data: {}, error: null }),
      );
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleNewSearch();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'Napi AI-keret',
        'A napi AI-keret elfogyott, holnap 09:00 után próbáld újra.',
        [{ text: 'Bezár', style: 'cancel' }],
      );
      expect(Alert.alert).not.toHaveBeenCalledWith('Hiba', expect.anything());
    });

    it('503 gemini_busy: shows the server text and "Újra" runs the search again', async () => {
      (useBilling as jest.Mock).mockReturnValue({ isPro: true });
      setupSupabaseMocks();
      let matchCalls = 0;
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
        if (fn !== 'match-grants') return Promise.resolve({ data: {}, error: null });
        matchCalls += 1;
        return Promise.resolve(
          matchCalls === 1
            ? aiUnavailable(503, 'gemini_busy', 'Az AI-szolgáltatás átmenetileg túlterhelt, próbáld újra egy perc múlva.')
            : { data: { success: true, matches_found: 1 }, error: null },
        );
      });
      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleNewSearch();
      });
      const call = (Alert.alert as jest.Mock).mock.calls.find((c) => c[0] === 'Az AI most túlterhelt');
      expect(call).toBeDefined();
      expect(call![1]).toBe('Az AI-szolgáltatás átmenetileg túlterhelt, próbáld újra egy perc múlva.');
      const retry = (call![2] as Array<{ text: string; onPress?: () => void }>).find((b) => b.text === 'Újra');
      expect(retry).toBeDefined();
      await act(async () => {
        retry!.onPress!();
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(matchCalls).toBe(2);
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('AI keresés kész', expect.stringContaining('1')));
    });

    it('Free user: search runs match-grants directly (no increment-search-count)', async () => {
      (useBilling as jest.Mock).mockReturnValue({ isPro: false });
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'match-grants') {
          return Promise.resolve({ data: { success: true, matches_found: 2 }, error: null });
        }
        return Promise.resolve({ data: {}, error: null });
      });

      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleNewSearch();
      });

      // Search is free now: no pre-check call, straight to the matching engine.
      expect(supabase.functions.invoke).not.toHaveBeenCalledWith('increment-search-count');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('match-grants', {
        body: { business_profile_id: mockBusinessProfile.id },
      });
      expect(Alert.alert).toHaveBeenCalledWith('AI keresés kész', expect.stringContaining('2'));
    });

    it('surfaces an error when the matching engine fails', async () => {
      setupSupabaseMocks();
      (useBilling as jest.Mock).mockReturnValue({ isPro: true });
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'match-grants') {
          return Promise.resolve({ data: null, error: new Error('boom') });
        }
        return Promise.resolve({ data: {}, error: null });
      });

      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(Alert.alert).toHaveBeenCalledWith('Hiba', expect.stringContaining('Nem sikerült lefuttatni a keresést'));
      expect(result.current.searching).toBe(false);
    });

    it('Free user over the daily cap: match-grants 403 -> Paywall (no generic error)', async () => {
      (useBilling as jest.Mock).mockReturnValue({ isPro: false });
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'match-grants') {
          const err = Object.assign(new Error('over cap'), { context: { status: 403 } });
          return Promise.resolve({ data: null, error: err });
        }
        return Promise.resolve({ data: {}, error: null });
      });

      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(mockNavigation.navigate).toHaveBeenCalledWith('Paywall', { source: 'home_limit' });
      expect(supabase.functions.invoke).not.toHaveBeenCalledWith('increment-search-count');
      expect(supabase.functions.invoke).not.toHaveBeenCalledWith('trigger-n8n-webhook', expect.any(Object));
      expect(Alert.alert).not.toHaveBeenCalledWith('Hiba', expect.stringContaining('Nem sikerült'));
    });

    it('Free user: a non-403 match-grants error shows a generic alert, not the Paywall', async () => {
      (useBilling as jest.Mock).mockReturnValue({ isPro: false });
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'match-grants') {
          return Promise.resolve({ data: null, error: new Error('boom') });
        }
        return Promise.resolve({ data: {}, error: null });
      });

      const { result } = renderHook(() => useHomeData(mockNavigation));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(Alert.alert).toHaveBeenCalledWith('Hiba', expect.stringContaining('Nem sikerült lefuttatni a keresést'));
      expect(mockNavigation.navigate).not.toHaveBeenCalledWith('Paywall', expect.anything());
      expect(mockNavigation.navigate).not.toHaveBeenCalledWith('Paywall');
    });
  });
});
