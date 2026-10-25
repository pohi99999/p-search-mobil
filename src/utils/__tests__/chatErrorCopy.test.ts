import { formatChatErrorMessage } from '../error';

// Card [J]: "Failed to send a request to the Edge Function" reached the chat bubble in English.
describe('chat error copy (card [J])', () => {
  it.each(['Failed to send a request to the Edge Function', 'FunctionsFetchError', 'TypeError: Network request failed'])(
    'never shows the raw error: %s',
    (raw) => {
      const text = formatChatErrorMessage(new Error(raw));
      expect(text).not.toContain(raw);
      expect(text.startsWith('Sajnálom')).toBe(true);
    },
  );

  it('keeps a Hungarian message that is already written for the user', () => {
    expect(formatChatErrorMessage(new Error('Sajnálom, a napi keret elfogyott.'))).toBe('Sajnálom, a napi keret elfogyott.');
  });
});
