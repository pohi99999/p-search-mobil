import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  documentSizeError,
  MAX_CHAT_HISTORY_ITEM_CHARS,
  MAX_CHAT_HISTORY_ITEMS,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_DOCUMENT_BASE64_CHARS,
  validateChatInput,
} from './input-limits.ts';

Deno.test('validateChatInput: a normal message and history pass unchanged', () => {
  const r = validateChatInput('Szia', [{ id: '1', sender: 'user', text: 'Előző kérdés' }]);
  assertEquals(r, { ok: true, message: 'Szia', history: [{ id: '1', sender: 'user', text: 'Előző kérdés' }] });
});

Deno.test('validateChatInput: missing or empty message -> 400', () => {
  for (const m of [undefined, null, '', '   ', 42, {}]) {
    const r = validateChatInput(m, []);
    assertEquals(r.ok, false);
    if (!r.ok) assertEquals(r.status, 400);
  }
});

Deno.test('validateChatInput: message over the cap -> 413, at the cap passes', () => {
  assertEquals(validateChatInput('a'.repeat(MAX_CHAT_MESSAGE_CHARS), []).ok, true);
  const r = validateChatInput('a'.repeat(MAX_CHAT_MESSAGE_CHARS + 1), []);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 413);
});

Deno.test('validateChatInput: only the last N history turns are kept, each truncated', () => {
  const history = Array.from({ length: 50 }, (_, i) => ({
    id: `m${i}`,
    sender: i % 2 ? 'ai' : 'user',
    text: 'x'.repeat(MAX_CHAT_HISTORY_ITEM_CHARS * 10),
  }));
  const r = validateChatInput('kérdés', history);
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.history.length, MAX_CHAT_HISTORY_ITEMS);
  assertEquals(r.history[0].id, `m${50 - MAX_CHAT_HISTORY_ITEMS}`);
  assertEquals(r.history.every((t) => t.text.length === MAX_CHAT_HISTORY_ITEM_CHARS), true);
});

Deno.test('validateChatInput: malformed history turns are dropped, never thrown on', () => {
  const r = validateChatInput('kérdés', [null, 'str', { sender: 'user' }, { text: 7 }, { text: 'ok', sender: 'evil' }]);
  assertEquals(r, { ok: true, message: 'kérdés', history: [{ id: '', sender: 'model', text: 'ok' }] });
  const notArray = validateChatInput('kérdés', { length: 3 });
  assertEquals(notArray, { ok: true, message: 'kérdés', history: [] });
});

Deno.test('documentSizeError: within the cap is null, over the cap or non-string is an error', () => {
  assertEquals(documentSizeError('QUJD'), null);
  assertEquals(documentSizeError('A'.repeat(MAX_DOCUMENT_BASE64_CHARS)), null);
  assertEquals(typeof documentSizeError('A'.repeat(MAX_DOCUMENT_BASE64_CHARS + 1)), 'string');
  assertEquals(typeof documentSizeError(12345), 'string');
});
