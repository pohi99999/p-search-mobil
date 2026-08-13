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


  it('should handle errors during updateTaskStatus', async () => {
    const errorMessage = 'Update Error';

    const mockUpdateEq = jest.fn().mockResolvedValue({ error: new Error(errorMessage) });
    const mockOrder2 = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockOrder1 = jest.fn().mockReturnValue({ order: mockOrder2 });
    const mockEq = jest.fn().mockReturnValue({ order: mockOrder1 });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });

    (supabase.from as jest.Mock).mockImplementation((table) => {
      if (table === 'action_tasks') {
        return {
          update: jest.fn().mockReturnValue({ eq: mockUpdateEq })
        };
      }
      return {
        select: mockSelect
      };
    });

    const { result, waitForNextUpdate } = renderHook(() => useActionPlan('test-business-id'));

    if (result.current.loading) {
      try {
        await waitForNextUpdate();
      } catch (e) {
        // sometimes renderHook completes synchronously in this test environment
      }
    }

    await act(async () => {
      await expect(
        result.current.updateTaskStatus('task-1', 'plan-1', 'IN_PROGRESS' as any)
      ).rejects.toThrow(errorMessage);
    });

    expect(result.current.error).toBe(errorMessage);
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

  it('should parse plans and build a tasks map when fetch returns data', async () => {
    const planRow = {
      id: 'plan-1',
      business_profile_id: 'test-business-id',
      title: 'Test Plan',
      action_tasks: [
        { id: 'task-1', status: 'TODO' },
        { id: 'task-2', status: 'DONE' },
      ],
    };

    const mockFrom = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation((resolve) => resolve({ data: [planRow], error: null })),
    };
    (supabase.from as jest.Mock).mockReturnValue(mockFrom);

    const { result } = renderHook(() => useActionPlan('test-business-id'));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    // `action_tasks` must be split off the plan row into the separate
    // `tasks` map (keyed by plan id) -- the plan object itself must NOT
    // still carry the nested tasks array.
    expect(result.current.plans).toEqual([
      { id: 'plan-1', business_profile_id: 'test-business-id', title: 'Test Plan' },
    ]);
    expect(result.current.tasks).toEqual({
      'plan-1': [
        { id: 'task-1', status: 'TODO' },
        { id: 'task-2', status: 'DONE' },
      ],
    });
  });

  it('should optimistically update the local task list after a successful updateTaskStatus', async () => {
    const initialPlanRow = {
      id: 'plan-1',
      action_tasks: [
        { id: 'task-1', status: 'TODO' },
        { id: 'task-2', status: 'TODO' },
      ],
    };

    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const mockFrom = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: jest.fn().mockImplementation((resolve) => resolve({ data: [initialPlanRow], error: null })),
    };

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'action_tasks') {
        return { update: jest.fn().mockReturnValue({ eq: mockUpdateEq }) };
      }
      return mockFrom;
    });

    const { result } = renderHook(() => useActionPlan('test-business-id'));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.tasks['plan-1'].map((t) => t.status)).toEqual(['TODO', 'TODO']);

    await act(async () => {
      await result.current.updateTaskStatus('task-1', 'plan-1', 'DONE' as any);
    });

    // Only the targeted task's status should flip; the sibling task in the
    // same plan must be left untouched.
    expect(result.current.tasks['plan-1']).toEqual([
      expect.objectContaining({ id: 'task-1', status: 'DONE' }),
      expect.objectContaining({ id: 'task-2', status: 'TODO' }),
    ]);
    expect(result.current.error).toBeNull();
  });
});
