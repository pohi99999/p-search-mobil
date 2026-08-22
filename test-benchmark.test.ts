import { renderHook, act } from './src/test-utils/renderHook';
import { useHomeData } from './src/hooks/useHomeData';
import { supabase } from './src/lib/supabase';
import { useBilling } from './src/context/BillingContext';
import { useProfile } from './src/context/ProfileContext';

jest.mock('./src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } } }),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  }
}));

jest.mock('./src/context/BillingContext', () => ({
  useBilling: jest.fn().mockReturnValue({ isPro: false })
}));

jest.mock('./src/context/ProfileContext', () => ({
  useProfile: jest.fn().mockReturnValue({ profile: { id: 'profile-id' }, loading: false, refreshProfile: jest.fn() })
}));

describe('benchmark', () => {
  it('measures time', async () => {
    const mockFrom = supabase.from as jest.Mock;

    // Setup mock chain
    const mockSingle = jest.fn();
    const mockEq = jest.fn(() => ({ single: mockSingle }));
    const mockSelect = jest.fn(() => ({ eq: mockEq }));
    mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq });

    // For matches
    const mockOrder = jest.fn();
    mockEq.mockImplementation((field, val) => {
      if (field === 'business_id') {
         return { order: mockOrder };
      }
      return { single: mockSingle };
    });

    mockSingle.mockResolvedValue({ data: { id: 'test' } });
    mockOrder.mockResolvedValue({ data: [] });

    const navigation = { replace: jest.fn(), navigate: jest.fn() };

    const start = Date.now();
    let renderCount = 0;

    for (let i = 0; i < 50; i++) {
      let currentResult: any;
      await act(async () => {
        const { result } = renderHook(() => useHomeData(navigation as any));
        currentResult = result;
      });
      // Wait for loading to finish
      // We know fetchData is async, so we might need a small wait
      await new Promise(resolve => setTimeout(resolve, 0));
      renderCount++;
    }

    const end = Date.now();
    console.log(`Time taken for 50 renders: ${end - start}ms`);
    console.log(`Supabase from called: ${mockFrom.mock.calls.length} times`);
  });
});
