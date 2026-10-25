// Card [G]: the hooks record their usage events, and the chat one carries only ok/error_code, never the text.
import { renderHook, act } from '../../test-utils/renderHook';
import { useCopilotChat } from '../useCopilotChat';
import { supabase } from '../../lib/supabase';
import { track } from '../../services/events';

jest.mock('../../services/events', () => ({ track: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  getAllKeys: jest.fn().mockResolvedValue([]),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } }) },
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const invoke = supabase.functions.invoke as jest.Mock;
afterEach(() => jest.clearAllMocks());

async function send(text: string) {
  const { result } = renderHook(() => useCopilotChat('match-42', 'profile-7'));
  act(() => result.current.setInputText(text));
  await act(async () => { await result.current.handleSend(); });
}

it('a sent chat message records ok:true and nothing of the text', async () => {
  invoke.mockResolvedValue({ data: { reply: 'Szia.' }, error: null });
  await send('Titkos cégadat 12345678');
  expect(track).toHaveBeenCalledWith('chat_message_sent', { ok: true });
  expect(JSON.stringify((track as jest.Mock).mock.calls)).not.toMatch(/Titkos|12345678/);
});

it('a 429 records the code only', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'Too Many Requests: Titkos', context: { status: 429 } } });
  await send('Titkos kérdés');
  expect(track).toHaveBeenCalledWith('chat_message_sent', { ok: false, error_code: 'gemini_quota' });
  expect(JSON.stringify((track as jest.Mock).mock.calls)).not.toMatch(/Titkos/);
});

it('a failure without a status is a network error', async () => {
  invoke.mockRejectedValue(new Error('Failed to fetch'));
  await send('kérdés');
  expect(track).toHaveBeenCalledWith('chat_message_sent', { ok: false, error_code: 'network' });
});
