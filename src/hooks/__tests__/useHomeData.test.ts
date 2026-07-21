import { renderHook, act } from '@testing-library/react-hooks';
import { useHomeData } from '../useHomeData';
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

jest.mock('../../config/constants', () => ({
  N8N_WEBHOOK_URL: 'http://mock-webhook-url',
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

    global.alert = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

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
    updateError = null
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

  const waitForUpdateOrTimeout = async (waitForNextUpdate: any) => {
    try {
      await waitForNextUpdate({ timeout: 100 });
    } catch (e) {
      // ignore timeout
    }
  };

  describe('fetchData', () => {
    it('handles missing session', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('fetches data successfully', async () => {
      setupSupabaseMocks();

      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      expect(result.current.profile).toEqual(mockBusinessProfile);
      expect(result.current.matches).toEqual(mockMatches);
      expect(mockNavigation.replace).not.toHaveBeenCalled();
    });

    it('redirects to Onboarding if profile is missing', async () => {
      setupSupabaseMocks(null, null);

      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      expect(mockNavigation.replace).toHaveBeenCalledWith('Onboarding');
    });

    it('handles and logs profile errors (not PGRST116)', async () => {
      const error = { code: 'OTHER_ERR', message: 'Test error' };
      setupSupabaseMocks(error as any);

      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      expect(logger.error).toHaveBeenCalledWith(error);
    });

    it('ignores PGRST116 profile error', async () => {
      const error = { code: 'PGRST116', message: 'No rows' };
      setupSupabaseMocks(error as any, null);

      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      expect(logger.error).not.toHaveBeenCalledWith(error);
      expect(mockNavigation.replace).toHaveBeenCalledWith('Onboarding');
    });

    it('handles and logs matches errors', async () => {
      const matchesErr = new Error('Matches error');
      setupSupabaseMocks(null, mockBusinessProfile, mockUserProfile, matchesErr as any);

      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      expect(logger.error).toHaveBeenCalledWith(matchesErr);
    });

    it('handles catch block in fetchData', async () => {
       const unexpectedErr = new Error('Session error');
       (supabase.auth.getSession as jest.Mock).mockRejectedValue(unexpectedErr);

       const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

       await waitForUpdateOrTimeout(waitForNextUpdate);

       expect(logger.error).toHaveBeenCalledWith(unexpectedErr);
       expect(result.current.loading).toBe(false);
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      setupSupabaseMocks();
      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      await act(async () => {
        await result.current.signOut();
      });

      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('handleNewSearch', () => {
    it('alerts if user profile is missing', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, null);
      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(global.alert).toHaveBeenCalledWith("Felhasználói profil nem található!");
    });

    it('handles Pro user search', async () => {
      (useBilling as jest.Mock).mockReturnValue({ isPro: true });
      setupSupabaseMocks();
      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(global.fetch).toHaveBeenCalledWith('http://mock-webhook-url', expect.any(Object));
      expect(global.alert).toHaveBeenCalledWith("Új Pro AI keresés elindítva!");
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CopilotChat');
    });

    it('handles Free user with available search', async () => {
      setupSupabaseMocks();
      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(global.fetch).toHaveBeenCalledWith('http://mock-webhook-url', expect.any(Object));
      expect(global.alert).toHaveBeenCalledWith("Ingyenes AI keresés elindítva!");
      expect(mockNavigation.navigate).toHaveBeenCalledWith('CopilotChat');
    });

    it('handles Free user exhausted search', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, { id: 'test', search_count: 1 });
      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(mockNavigation.navigate).toHaveBeenCalledWith('Paywall');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('handles Free user update error', async () => {
      const updateError = new Error('Update failed');
      setupSupabaseMocks(null, mockBusinessProfile, mockUserProfile, null, mockMatches, updateError as any);
      const { result, waitForNextUpdate } = renderHook(() => useHomeData(mockNavigation));

      await waitForUpdateOrTimeout(waitForNextUpdate);

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(logger.error).toHaveBeenCalledWith(updateError);
      expect(global.alert).toHaveBeenCalledWith("Hiba történt a keresési limit frissítésekor!");
    });
  });
});
