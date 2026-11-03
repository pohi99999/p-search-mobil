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

it('the free daily chat cap is recorded as chat_daily_limit, not as a network error (Brunella 4790)', async () => {
  invoke.mockResolvedValue({
    data: null,
    error: { message: 'Edge Function returned a non-2xx status code', context: { status: 403, json: () => Promise.resolve({ code: 'chat_daily_limit', error: 'Sajnálom, a mai napra elérted a Copilot-üzenetek keretét (20).' }) } },
  });
  await send('kérdés');
  expect(track).toHaveBeenCalledWith('chat_message_sent', { ok: false, error_code: 'chat_daily_limit' });
  expect(track).not.toHaveBeenCalledWith('chat_message_sent', { ok: false, error_code: 'network' });
});
