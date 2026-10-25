// Refund of one daily search after a failed match run (kanban: T3 hiba
// 2026-09-23). consume_daily_search() increments BEFORE the matching runs so
// concurrent calls cannot slip past the cap; when the run then fails (Gemini,
// DB, timeout) the user must not lose a search they never got.

// Structural, deliberately loose: the real SupabaseClient's builders are
// thenables (PostgrestBuilder), not Promises, so a strict Promise-typed shape
// does not accept it (deno check TS2345). `await` works on both.
// deno-lint-ignore no-explicit-any
type MinimalClient = { from: (table: string) => any };

export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type Counter = { count: 'daily_search_count' | 'daily_chat_count'; date: 'daily_search_date' | 'daily_chat_date'; label: string };
const SEARCH: Counter = { count: 'daily_search_count', date: 'daily_search_date', label: 'refundDailySearch' };
// Card [L]: the daily chat cap (consume_daily_chat) is given back the same way when the AI call fails.
const CHAT: Counter = { count: 'daily_chat_count', date: 'daily_chat_date', label: 'refundDailyChat' };

async function refundDailyCounter(client: MinimalClient, userId: string, c: Counter, now: Date): Promise<number | null> {
  try {
    const { data, error } = await client.from('profiles').select(`${c.count}, ${c.date}`).eq('id', userId).maybeSingle();
    if (error || !data) return null;
    const count = data[c.count] ?? 0;
    if (data[c.date] !== todayIsoDate(now) || count <= 0) return null;
    const next = count - 1;
    const { error: updErr } = await client.from('profiles').update({ [c.count]: next }).eq('id', userId);
    if (updErr) { console.warn(`${c.label}: update hiba`, updErr.message); return null; }
    return next;
  } catch (err: unknown) {
    console.warn(`${c.label}: kivétel`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Decrements daily_search_count by one for `userId` if today's counter is
 * above zero. Returns the new count, or null when nothing was refunded.
 * Never throws: a refund failure is logged, the caller's error path continues.
 */
export function refundDailySearch(client: MinimalClient, userId: string, now: Date = new Date()): Promise<number | null> {
  return refundDailyCounter(client, userId, SEARCH, now);
}

/** The same for daily_chat_count, after a Copilot chat message whose AI call failed. */
export function refundDailyChat(client: MinimalClient, userId: string, now: Date = new Date()): Promise<number | null> {
  return refundDailyCounter(client, userId, CHAT, now);
}
