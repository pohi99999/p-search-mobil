import { renderHook, act } from '@testing-library/react-hooks';
import { useActionPlan } from './useActionPlan';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('useActionPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle errors during fetchPlansAndTasks', async () => {
    const errorMessage = 'Network Error';
    const mockFrom = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation((resolve) => resolve({ data: null, error: new Error(errorMessage) }))
    };
    (supabase.from as jest.Mock).mockReturnValue(mockFrom);

    const { result } = renderHook(() => useActionPlan('test-business-id'));

    // initial state should be loading
    expect(result.current.loading).toBe(true);

    // Call refetch inside act
    await act(async () => {
      await result.current.refetch();
    });

    // Check if error state is set correctly
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.loading).toBe(false);
  });

  it('should handle string errors during fetchPlansAndTasks', async () => {
    const mockFrom = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation((resolve) => resolve({ data: null, error: 'A string error' }))
    };
    (supabase.from as jest.Mock).mockReturnValue(mockFrom);

    const { result } = renderHook(() => useActionPlan('test-business-id'));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe('A string error');
    expect(result.current.loading).toBe(false);
  });

  it('should handle falsy errors during fetchPlansAndTasks', async () => {
    const mockFrom = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation((resolve, reject) => reject(''))
    };
    (supabase.from as jest.Mock).mockReturnValue(mockFrom);

    const { result } = renderHook(() => useActionPlan('test-business-id'));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe('Hiba történt az akciótervek betöltése során.');
    expect(result.current.loading).toBe(false);
  });

  it('should clear error state on successful fetch', async () => {
    const errorMessage = 'Initial Error';
    let shouldFail = true;

    const mockFrom = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation((resolve) => {
        if (shouldFail) {
          return resolve({ data: null, error: new Error(errorMessage) });
        }
        return resolve({ data: [], error: null });
      })
    };
    (supabase.from as jest.Mock).mockReturnValue(mockFrom);

    const { result } = renderHook(() => useActionPlan('test-business-id'));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe(errorMessage);

    shouldFail = false;

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
  });
});
