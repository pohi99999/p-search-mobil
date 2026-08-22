import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ProfileProvider, clearProfileCache } from '../ProfileContext';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(),
  },
}));

describe('ProfileContext Performance Baseline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProfileCache();
  });

  it('measures redundant fetches', async () => {
    const mockGetSession = supabase.auth.getSession as jest.Mock;
    const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
    const mockFrom = supabase.from as jest.Mock;

    mockGetSession.mockResolvedValue({ data: { session: { user: { id: '123' } } } });

    const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'prof', user_id: '123' }, error: null });
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    // Simulate standard initial mount behavior
    mockOnAuthStateChange.mockImplementation((cb) => {
      // Normally Supabase calls this synchronously with INITIAL_SESSION
      cb('INITIAL_SESSION', { user: { id: '123' } });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    await act(async () => {
      renderer.create(<ProfileProvider><div>Test</div></ProfileProvider>);
    });

    console.log("Number of getSession calls:", mockGetSession.mock.calls.length);
    console.log("Number of profile queries:", mockSingle.mock.calls.length);

    // We expect it to be redundant if we can use the session from INITIAL_SESSION directly.
  });
});
