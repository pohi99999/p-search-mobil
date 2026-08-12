import { renderHook, act } from '@testing-library/react-hooks';
import { useActionPlan } from './useActionPlan';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: {
      invoke: jest.fn(),
    },
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


  describe('generatePlanForMatch', () => {
    it('should set error state when invokeError is present', async () => {
      const errorMessage = 'Function Invoke Error';
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error(errorMessage)
      });

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [], error: null }) }),
      };
      (supabase.from as jest.Mock).mockReturnValue(mockFrom);

      const { result, waitForNextUpdate } = renderHook(() => useActionPlan('test-business-id'));

      try {
        await waitForNextUpdate();
      } catch (e) {
        // Ignored
      }

      await act(async () => {
        try {
          await result.current.generatePlanForMatch('test-business-id', 'test-match-id');
        } catch (e) {
          // Ignored expected throw
        }
      });

      expect(result.current.error).toBe(errorMessage);
    });

    it('should set error state when data.error is present', async () => {
      const errorMessage = 'Data Payload Error';
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { error: errorMessage },
        error: null
      });

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [], error: null }) }),
      };
      (supabase.from as jest.Mock).mockReturnValue(mockFrom);

      const { result, waitForNextUpdate } = renderHook(() => useActionPlan('test-business-id'));

      try {
        await waitForNextUpdate();
      } catch (e) {
        // Ignored
      }

      await act(async () => {
        try {
          await result.current.generatePlanForMatch('test-business-id', 'test-match-id');
        } catch (e) {
          // Ignored expected throw
        }
      });

      expect(result.current.error).toBe(errorMessage);
    });

    it('should successfully generate plan and clear error', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { success: true },
        error: null
      });

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [], error: null }) }),
      };
      (supabase.from as jest.Mock).mockReturnValue(mockFrom);

      const { result, waitForNextUpdate } = renderHook(() => useActionPlan('test-business-id'));

      try {
        await waitForNextUpdate();
      } catch (e) {
        // Ignored
      }

      await act(async () => {
        const response = await result.current.generatePlanForMatch('test-business-id', 'test-match-id');
        expect(response).toEqual({ success: true });
      });

      expect(result.current.error).toBeNull();
    });
  });
});
