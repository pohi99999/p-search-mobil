import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ProfileProvider, useProfile, clearProfileCache } from './ProfileContext';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('ProfileContext', () => {
  let mockUnsubscribe: jest.Mock;
  let mockOnAuthStateChange: jest.Mock;
  let mockGetSession: jest.Mock;
  let mockFrom: jest.Mock;
  let mockSelect: jest.Mock;
  let mockEq: jest.Mock;
  let mockSingle: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearProfileCache();
    mockUnsubscribe = jest.fn();

    mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } }
    });

    mockGetSession = supabase.auth.getSession as jest.Mock;

    mockSingle = jest.fn();
    mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom = supabase.from as jest.Mock;
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  const renderProvider = async () => {
    let contextValue: any;
    const TestComponent = () => {
      contextValue = useProfile();
      return null;
    };

    let root: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <ProfileProvider>
          <TestComponent />
        </ProfileProvider>
      );
    });

    return { root: root!, getContext: () => contextValue };
  };

  it('sets profile to null if no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { getContext } = await renderProvider();

    expect(mockGetSession).toHaveBeenCalled();
    expect(getContext().profile).toBeNull();
    expect(getContext().loading).toBe(false);
  });

  it('fetches profile successfully if session exists', async () => {
    const mockProfile = { id: 'profile-123', company_name: 'Test Co' };
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } }
    });
    mockSingle.mockResolvedValue({ data: mockProfile, error: null });

    const { getContext } = await renderProvider();

    expect(mockGetSession).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('business_profiles');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');

    expect(getContext().profile).toEqual(mockProfile);
    expect(getContext().loading).toBe(false);
  });

  it('sets profile to null if no profile exists for user', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } }
    });
    // PGRST116 is the error code when single() finds no rows
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const { getContext } = await renderProvider();

    expect(getContext().profile).toBeNull();
    expect(getContext().loading).toBe(false);
    expect(logger.error).not.toHaveBeenCalled();
  });
  it("returns cached profile if already fetched", async () => {
    const mockProfile = { id: "profile-cached", company_name: "Cached Co" };
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-123" } } }
    });
    mockSingle.mockResolvedValue({ data: mockProfile, error: null });

    const { root } = await renderProvider();

    mockGetSession.mockClear();

    await act(async () => {
      root.unmount();
    });

    const { getContext: getContextSecond } = await renderProvider();

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(getContextSecond().profile).toEqual(mockProfile);
    expect(getContextSecond().loading).toBe(false);
  });
  it("awaits existing fetch promise if concurrent fetch requested", async () => {
    const mockProfile = { id: "profile-concurrent", company_name: "Concurrent Co" };
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-123" } } }
    });

    let resolveMockSingle: any;
    const mockSinglePromise = new Promise((resolve) => {
      resolveMockSingle = resolve;
    });
    mockSingle.mockReturnValue(mockSinglePromise);

    const { getContext } = await renderProvider(); // This starts the first fetch

    mockGetSession.mockClear();
    mockFrom.mockClear();

    // While the first fetch is in progress, render a second provider or trigger another fetch somehow.
    // The easiest way is to unmount and remount very fast, or just call refreshProfile if it didn`t forceRefresh.
    // Wait, refreshProfile forces refresh. But the second mount doesn`t force refresh!

    let getContextSecond: any;
    const TestComponent = () => {
      getContextSecond = useProfile();
      return null;
    };

    await act(async () => {
      renderer.create(
        <ProfileProvider>
          <TestComponent />
        </ProfileProvider>
      );
    });

    // Neither should have completed yet
    expect(getContext().loading).toBe(true);
    expect(getContextSecond.loading).toBe(true);

    // The second render shouldn`t have triggered another from() call because fetchPromise is pending
    expect(mockFrom).not.toHaveBeenCalled();

    // Resolve the single query
    await act(async () => {
      resolveMockSingle({ data: mockProfile, error: null });
    });

    // Both should now be populated and no longer loading
    expect(getContext().profile).toEqual(mockProfile);
    expect(getContextSecond.profile).toEqual(mockProfile);
    expect(getContext().loading).toBe(false);
    expect(getContextSecond.loading).toBe(false);
  });



  it('logs error if fetching profile fails with a non-PGRST116 error', async () => {
    const dbError = { code: 'OTHER_ERR', message: 'DB Error' };
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } }
    });
    mockSingle.mockResolvedValue({ data: null, error: dbError });

    const { getContext } = await renderProvider();

    expect(logger.error).toHaveBeenCalledWith('Error fetching profile in ProfileContext:', dbError);
    expect(getContext().profile).toBeNull();
    expect(getContext().loading).toBe(false);
  });

  it('logs error if the database query throws an exception', async () => {
    const unexpectedError = new Error('Database exception');
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } }
    });
    mockSingle.mockRejectedValue(unexpectedError);

    await renderProvider();

    expect(logger.error).toHaveBeenCalledWith('Unexpected error fetching profile in ProfileContext:', unexpectedError);
  });

  it('logs unexpected errors', async () => {
    const unexpectedError = new Error('Unexpected');
    mockGetSession.mockRejectedValue(unexpectedError);

    const { getContext } = await renderProvider();

    expect(logger.error).toHaveBeenCalledWith('Unexpected error fetching profile in ProfileContext:', unexpectedError);
    expect(getContext().profile).toBeNull();
    expect(getContext().loading).toBe(false);
  });

  it('subscribes to auth state changes and updates profile accordingly', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    let authCallback: any;
    mockOnAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { getContext, root } = await renderProvider();

    // Initially no profile
    expect(getContext().profile).toBeNull();

    // Trigger auth change with a user session
    // `fetchProfile` inside `authCallback` calls `getSession` so we need to mock it again
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-456' } } } });
    const mockProfile = { id: 'profile-456' };
    mockSingle.mockResolvedValue({ data: mockProfile, error: null });

    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'user-456' } });
    });

    expect(getContext().profile).toEqual(mockProfile);

    // Trigger auth change with no session (sign out)
    await act(async () => {
      authCallback('SIGNED_OUT', null);
    });

    expect(getContext().profile).toBeNull();

    await act(async () => {
      root.unmount();
    });
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('refreshProfile function correctly fetches data again', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } }
    });

    // First fetch returns one profile
    mockSingle.mockResolvedValueOnce({ data: { id: 'profile-v1' }, error: null });

    const { getContext } = await renderProvider();
    expect(getContext().profile).toEqual({ id: 'profile-v1' });

    // Second fetch (via refreshProfile) returns updated profile
    mockSingle.mockResolvedValueOnce({ data: { id: 'profile-v2' }, error: null });

    await act(async () => {
      await getContext().refreshProfile();
    });

    expect(getContext().profile).toEqual({ id: 'profile-v2' });
  });

  it('setProfile updates profile directly', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { getContext } = await renderProvider();
    expect(getContext().profile).toBeNull();

    const mockProfile = { id: 'profile-new', company_name: 'New Co' } as any;

    await act(async () => {
      getContext().setProfile(mockProfile);
    });

    expect(getContext().profile).toEqual(mockProfile);
  });
});
