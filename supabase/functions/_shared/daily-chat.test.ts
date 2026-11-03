// Card [L]: the answer of the daily chat cap, and its refund after a failed AI call.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { consumeDailyChat, CHAT_DAILY_LIMIT_CODE } from "./daily-chat.ts";
import { refundDailyChat, refundDailySearch } from "./daily-search-refund.ts";

const rpcClient = (answer: { data?: unknown; error?: { message: string } | null }) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return { calls, rpc: (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }); } };
};

Deno.test("under the cap: allowed, the user and the cap go to consume_daily_chat", async () => {
  const c = rpcClient({ data: [{ allowed: true, used: 3 }] });
  assertEquals(await consumeDailyChat(c, "u-1", 20), { allowed: true });
  assertEquals(c.calls, [{ fn: "consume_daily_chat", args: { p_user: "u-1", p_cap: 20 } }]);
});

Deno.test("cap used up: 403 chat_daily_limit with a Hungarian text the app shows as it is", async () => {
  const gate = await consumeDailyChat(rpcClient({ data: [{ allowed: false, used: 20 }] }), "u-1", 20);
  assertEquals(gate.allowed, false);
  if (gate.allowed) return;
  assertEquals(gate.status, 403);
  assertEquals(gate.body.code, CHAT_DAILY_LIMIT_CODE);
  assertEquals(gate.body.error.startsWith("Sajnálom"), true);
  assertEquals(gate.body.error.includes("(20)"), true);
});

Deno.test("the cap check fails: 503, never an unmetered AI call", async () => {
  const gate = await consumeDailyChat(rpcClient({ error: { message: "db down" } }), "u-1", 20);
  assertEquals(gate.allowed, false);
  if (!gate.allowed) assertEquals(gate.status, 503);
});

function profileClient(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    from: (_t: string) => ({
      select: (_c: string) => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: () => Promise.resolve({ error: null }) }; },
    }),
  };
}
const now = new Date("2026-10-25T12:00:00Z");

Deno.test("refundDailyChat gives one chat back today, and touches only the chat counter", async () => {
  const c = profileClient({ daily_chat_count: 3, daily_chat_date: "2026-10-25", daily_search_count: 7, daily_search_date: "2026-10-25" });
  assertEquals(await refundDailyChat(c, "u-1", now), 2);
  assertEquals(c.updates, [{ daily_chat_count: 2 }]);
});

Deno.test("refundDailyChat gives nothing back for another day or a zero counter", async () => {
  assertEquals(await refundDailyChat(profileClient({ daily_chat_count: 3, daily_chat_date: "2026-10-24" }), "u-1", now), null);
  assertEquals(await refundDailyChat(profileClient({ daily_chat_count: 0, daily_chat_date: "2026-10-25" }), "u-1", now), null);
});

Deno.test("refundDailySearch still touches only the search counter", async () => {
  const c = profileClient({ daily_search_count: 5, daily_search_date: "2026-10-25", daily_chat_count: 9, daily_chat_date: "2026-10-25" });
  assertEquals(await refundDailySearch(c, "u-1", now), 4);
  assertEquals(c.updates, [{ daily_search_count: 4 }]);
});
