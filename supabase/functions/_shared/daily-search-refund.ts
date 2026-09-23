// Refund of one daily search after a failed match run (kanban: T3 hiba
// 2026-09-23). consume_daily_search() increments BEFORE the matching runs so
// concurrent calls cannot slip past the cap; when the run then fails (Gemini,
// DB, timeout) the user must not lose a search they never got.

type ProfileRow = { daily_search_count: number | null; daily_search_date: string | null };

// Structural, deliberately loose: the real SupabaseClient's builders are
// thenables (PostgrestBuilder), not Promises, so a strict Promise-typed shape
// does not accept it (deno check TS2345). `await` works on both.
// deno-lint-ignore no-explicit-any
type MinimalClient = { from: (table: string) => any };

export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Decrements daily_search_count by one for `userId` if today's counter is
 * above zero. Returns the new count, or null when nothing was refunded.
 * Never throws: a refund failure is logged, the caller's error path continues.
 */
export async function refundDailySearch(client: MinimalClient, userId: string, now: Date = new Date()): Promise<number | null> {
  try {
    const { data, error } = await client.from('profiles').select('daily_search_count, daily_search_date').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    const count = data.daily_search_count ?? 0;
    if (data.daily_search_date !== todayIsoDate(now) || count <= 0) return null;
    const next = count - 1;
    const { error: updErr } = await client.from('profiles').update({ daily_search_count: next }).eq('id', userId);
    if (updErr) { console.warn('refundDailySearch: update hiba', updErr.message); return null; }
    return next;
  } catch (err: unknown) {
    console.warn('refundDailySearch: kivétel', err instanceof Error ? err.message : String(err));
    return null;
  }
}
