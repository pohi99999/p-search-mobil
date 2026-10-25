// Card [L] (review 2026-10-25): the daily cap on Copilot chat messages for non-Pro users. The check-reset-increment
// is atomic in consume_daily_chat (supabase/migrations/20261025130000_daily_chat_cap.sql); this decides the answer.
import { FREE_DAILY_CHAT_CAP } from './entitlement.ts';

// deno-lint-ignore no-explicit-any
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => any };

export const CHAT_DAILY_LIMIT_CODE = 'chat_daily_limit';

export type ChatGate =
  | { allowed: true }
  | { allowed: false; status: 403 | 503; body: { error: string; code?: string } };

/** Consumes one chat message of today's free cap (Pro is not counted). Call it before the paid AI call. */
export async function consumeDailyChat(client: RpcClient, userId: string, cap: number = FREE_DAILY_CHAT_CAP): Promise<ChatGate> {
  const { data, error } = await client.rpc('consume_daily_chat', { p_user: userId, p_cap: cap });
  if (error) {
    console.error('consume_daily_chat hiba:', error.message);
    return { allowed: false, status: 503, body: { error: 'A Copilot átmenetileg nem elérhető, próbáld újra később.' } };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    return {
      allowed: false,
      status: 403,
      body: {
        // Starts with "Sajnálom" on purpose: the app's formatChatErrorMessage shows such a text as it is.
        error: `Sajnálom, a mai napra elérted a Copilot-üzenetek keretét (${cap}). Holnap újra kérdezhetsz.`,
        code: CHAT_DAILY_LIMIT_CODE,
      },
    };
  }
  return { allowed: true };
}
