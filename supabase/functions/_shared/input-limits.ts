// Input-size caps for the edge functions that call paid AI models (SECURITY_AUDIT.md H1).
//
// Every authenticated user, free tier included, can reach chat-with-gemini and
// process-master-document. Without a cap one request could carry megabytes of
// prompt text or an arbitrarily large file, and each byte is billed by Claude /
// Gemini. These pure helpers bound the size of a single call; they do not limit
// how many calls a user makes (that needs a per-user counter in the database).

/** The app's chat input allows 500 characters; 4x headroom for other clients. */
export const MAX_CHAT_MESSAGE_CHARS = 2000;
/** chat-with-gemini already sends only the last 10 turns to the model. */
export const MAX_CHAT_HISTORY_ITEMS = 10;
/** A model reply is capped at 1000 output tokens, so a longer history turn is not a real one. */
export const MAX_CHAT_HISTORY_ITEM_CHARS = 4000;
/** 10 MB decoded file; base64 carries 4 characters per 3 bytes. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BASE64_CHARS = Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4;

export interface ChatTurn {
  id: string;
  sender: string;
  text: string;
}

export type ChatInput =
  | { ok: true; message: string; history: ChatTurn[] }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Validates the chat message and normalises the history: only the last
 * MAX_CHAT_HISTORY_ITEMS well-formed turns survive, each cut to
 * MAX_CHAT_HISTORY_ITEM_CHARS. A malformed turn is dropped instead of crashing
 * the function (a turn without an id used to throw on `msg.id.startsWith`).
 */
export function validateChatInput(message: unknown, history: unknown): ChatInput {
  if (typeof message !== 'string' || message.trim().length === 0) {
    return { ok: false, status: 400, error: 'message paraméter megadása kötelező' };
  }
  if (message.length > MAX_CHAT_MESSAGE_CHARS) {
    return {
      ok: false,
      status: 413,
      error: `Az üzenet legfeljebb ${MAX_CHAT_MESSAGE_CHARS} karakter lehet.`,
    };
  }

  const turns: ChatTurn[] = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-MAX_CHAT_HISTORY_ITEMS)) {
      if (!item || typeof item !== 'object') continue;
      const { id, sender, text } = item as Record<string, unknown>;
      if (typeof text !== 'string' || text.length === 0) continue;
      turns.push({
        id: typeof id === 'string' ? id : '',
        sender: sender === 'user' ? 'user' : 'model',
        text: text.slice(0, MAX_CHAT_HISTORY_ITEM_CHARS),
      });
    }
  }

  return { ok: true, message, history: turns };
}

/** null when the base64 payload is within the size cap, otherwise the Hungarian error text. */
export function documentSizeError(fileBase64: unknown): string | null {
  if (typeof fileBase64 !== 'string') return 'A file_base64 mezőnek szövegnek kell lennie.';
  if (fileBase64.length > MAX_DOCUMENT_BASE64_CHARS) {
    return `A dokumentum legfeljebb ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB lehet.`;
  }
  return null;
}
