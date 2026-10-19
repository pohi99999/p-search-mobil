// The Send button did nothing on the phone (vc 14, 2026-10-19): handleSend built the message id with
// crypto.randomUUID(), and React Native / Hermes has no global `crypto` (Expo SDK 56's runtime
// installs TextDecoder, URL, structuredClone, fetch..., not crypto, and no dependency polyfills it).
// Jest runs on Node, where `crypto` exists, so every earlier test passed. These tests remove the
// global the way the device lacks it.
import { renderHook, act } from '../../test-utils/renderHook';
import { useCopilotChat } from '../useCopilotChat';
import { supabase } from '../../lib/supabase';

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
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function withoutCrypto() {
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
}

afterEach(() => {
  if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto);
  jest.clearAllMocks();
});

describe('useCopilotChat.handleSend without a global crypto (React Native / Hermes)', () => {
  it('calls chat-with-gemini with the message and the matchId, and shows both messages', async () => {
    withoutCrypto();
    invoke.mockResolvedValue({ data: { reply: 'Szia, segitek.' }, error: null });
    const { result } = renderHook(() => useCopilotChat('match-42', 'profile-7'));

    act(() => result.current.setInputText('Milyen palyazat van?'));
    await act(async () => { await result.current.handleSend(); });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('chat-with-gemini', expect.objectContaining({
      body: expect.objectContaining({ message: 'Milyen palyazat van?', match_id: 'match-42', business_profile_id: 'profile-7' }),
    }));
    const texts = result.current.messages.map(m => m.text);
    expect(texts).toContain('Milyen palyazat van?');
    expect(texts).toContain('Szia, segitek.');
    expect(result.current.inputText).toBe('');
    expect(result.current.isTyping).toBe(false);
  });

  it('gives every message a distinct id', async () => {
    withoutCrypto();
    invoke.mockResolvedValue({ data: { reply: 'ok' }, error: null });
    const { result } = renderHook(() => useCopilotChat(null, undefined));
    for (const t of ['egy', 'ketto']) {
      act(() => result.current.setInputText(t));
      await act(async () => { await result.current.handleSend(); });
    }
    const ids = result.current.messages.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows an error message instead of failing silently when the call throws', async () => {
    withoutCrypto();
    invoke.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useCopilotChat(null, undefined));

    act(() => result.current.setInputText('Hello'));
    await act(async () => { await result.current.handleSend(); });

    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.sender).toBe('ai');
    expect(last.id).toMatch(/^err-/);
    expect(result.current.isTyping).toBe(false);
  });
});
