import { Alert } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { renderHook, act } from '../../test-utils/renderHook';
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

    it('handles Free user with available search', async () => {
      setupSupabaseMocks();
      (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'increment-search-count') {
          return Promise.resolve({ data: { allowed: true, newCount: 1 }, error: null });
        }
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

      expect(supabase.functions.invoke).toHaveBeenCalledWith('increment-search-count');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('match-grants', {
        body: { business_profile_id: mockBusinessProfile.id },
      });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('trigger-n8n-webhook', expect.any(Object));
      expect(Alert.alert).toHaveBeenCalledWith(
        'AI keresés kész',
        expect.stringContaining('2'),
      );
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

      expect(Alert.alert).toHaveBeenCalledWith(
        'Hiba',
        expect.stringContaining('Nem sikerült lefuttatni a keresést'),
      );
      // The busy flag must be released even on the failure path.
      expect(result.current.searching).toBe(false);
    });

    it('handles Free user exhausted search', async () => {
      setupSupabaseMocks(null, mockBusinessProfile, { id: 'test', search_count: 1 });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { allowed: false, reason: 'Limit reached' },
        error: null,
      });

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(mockNavigation.navigate).toHaveBeenCalledWith('Paywall');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('increment-search-count');
      expect(supabase.functions.invoke).not.toHaveBeenCalledWith('trigger-n8n-webhook', expect.any(Object));
    });

    it('handles Free user update error', async () => {
      setupSupabaseMocks();
      const updateError = new Error('Invoke failed');
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: updateError,
      });

      const { result } = renderHook(() => useHomeData(mockNavigation));

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleNewSearch();
      });

      expect(logger.error).toHaveBeenCalledWith(updateError);
      expect(Alert.alert).toHaveBeenCalledWith("Hiba történt a keresési limit ellenőrzésekor!");
    });
  });
});
