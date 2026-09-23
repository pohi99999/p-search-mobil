import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { refundDailySearch } from "./daily-search-refund.ts";

function fakeClient(row: { daily_search_count: number | null; daily_search_date: string | null } | null, updates: Array<Record<string, unknown>> = [], selectError: { message: string } | null = null) {
  return {
    from: (_t: string) => ({
      select: (_c: string) => ({ eq: (_col: string, _v: string) => ({ maybeSingle: async () => ({ data: row, error: selectError }) }) }),
      update: (values: Record<string, unknown>) => ({ eq: async (_col: string, _v: string) => { updates.push(values); return { error: null }; } }),
    }),
  };
}
const now = new Date("2026-09-23T10:00:00Z");

Deno.test("refund: today's counter above zero -> decremented by one", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const r = await refundDailySearch(fakeClient({ daily_search_count: 1, daily_search_date: "2026-09-23" }, updates), "u1", now);
  assertEquals(r, 0);
  assertEquals(updates, [{ daily_search_count: 0 }]);
});

Deno.test("refund: counter already zero -> no update", async () => {
  const updates: Array<Record<string, unknown>> = [];
  assertEquals(await refundDailySearch(fakeClient({ daily_search_count: 0, daily_search_date: "2026-09-23" }, updates), "u1", now), null);
  assertEquals(updates, []);
});

Deno.test("refund: counter from another day -> no update (it belongs to that day's run)", async () => {
  const updates: Array<Record<string, unknown>> = [];
  assertEquals(await refundDailySearch(fakeClient({ daily_search_count: 3, daily_search_date: "2026-09-22" }, updates), "u1", now), null);
  assertEquals(updates, []);
});

Deno.test("refund: missing profile or read error -> null, never throws", async () => {
  assertEquals(await refundDailySearch(fakeClient(null), "u1", now), null);
  assertEquals(await refundDailySearch(fakeClient({ daily_search_count: 2, daily_search_date: "2026-09-23" }, [], { message: "boom" }), "u1", now), null);
});
