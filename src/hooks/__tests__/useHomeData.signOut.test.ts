import { waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act } from '../../test-utils/renderHook';
import { useHomeData } from '../useHomeData';
import { getChatHistoryStorageKey } from '../useCopilotChat';
import { supabase } from '../../lib/supabase';
import { useBilling } from '../../context/BillingContext';

// Valódi, memóriában élő tároló -- nem spy. Így a mérés arra válaszol, hogy
// MI MARAD a tárolóban a kijelentkezés után, nem arra, hogy meghívtunk-e valamit.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
  getAllKeys: jest.fn(async () => Array.from(mockStore.keys())),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('../../context/BillingContext', () => ({ useBilling: jest.fn() }));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

const USER_ID = 'test-user-id';

describe('kijelentkezés és az eszközön tárolt chat-előzmény', () => {
  const mockNavigation: any = { replace: jest.fn(), navigate: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    (useBilling as jest.Mock).mockReturnValue({ isPro: false });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
    });
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
    (supabase.functions.invoke as jest.Mock) = jest.fn().mockResolvedValue({ data: {}, error: null });
    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      update: jest.fn().mockReturnThis(),
    }));
  });

  const seedHistory = async () => {
    await AsyncStorage.setItem(
      getChatHistoryStorageKey(USER_ID, 'match-1'),
      JSON.stringify([{ id: '1', text: 'titkos', sender: 'user', created_at: 'x' }])
    );
    await AsyncStorage.setItem(
      getChatHistoryStorageKey(USER_ID, null),
      JSON.stringify([{ id: '2', text: 'titkos2', sender: 'ai', created_at: 'x' }])
    );
    await AsyncStorage.setItem('@valami_mas_beallitas', 'megmarad');
  };

  it('kijelentkezés UTÁN nem marad chat-előzmény a tárolóban', async () => {
    await seedHistory();
    const { result } = renderHook(() => useHomeData(mockNavigation));
    await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());

    await act(async () => { await result.current.signOut(); });

    const remaining = (await AsyncStorage.getAllKeys()).filter(k =>
      k.startsWith('@copilot_chat_history_')
    );
    expect(remaining).toEqual([]);
  });

  it('kijelentkezés NÉLKÜL az előzmény megmarad', async () => {
    await seedHistory();
    renderHook(() => useHomeData(mockNavigation));
    await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());

    const remaining = (await AsyncStorage.getAllKeys()).filter(k =>
      k.startsWith('@copilot_chat_history_')
    );
    expect(remaining).toHaveLength(2);
  });

  it('kijelentkezés nem törli a chat-előzményen kívüli tárolt adatot', async () => {
    await seedHistory();
    const { result } = renderHook(() => useHomeData(mockNavigation));
    await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());

    await act(async () => { await result.current.signOut(); });

    expect(await AsyncStorage.getItem('@valami_mas_beallitas')).toBe('megmarad');
  });
});
