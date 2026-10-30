// P-Search kör 2, P1-5 (Péter 12036): the daily OCR cap's answers and its refund.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { consumeDailyOcr, DAILY_OCR_CAP, OCR_DAILY_LIMIT_CODE } from "./daily-ocr.ts";
import { refundDailyOcr } from "./daily-search-refund.ts";

const rpcClient = (answer: { data?: unknown; error?: { message: string } | null }) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return { calls, rpc: (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }); } };
};

Deno.test("the cap is 3 a day, and the user and the cap go to consume_daily_ocr", async () => {
  assertEquals(DAILY_OCR_CAP, 3);
  const c = rpcClient({ data: [{ allowed: true, used: 3 }] });
  assertEquals(await consumeDailyOcr(c, "u-1"), { allowed: true });
  assertEquals(c.calls, [{ fn: "consume_daily_ocr", args: { p_user: "u-1", p_cap: 3 } }]);
});

Deno.test("cap used up: 429 ocr_daily_limit with a Hungarian text naming the cap", async () => {
  const gate = await consumeDailyOcr(rpcClient({ data: [{ allowed: false, used: 3 }] }), "u-1");
  assertEquals(gate.allowed, false);
  if (gate.allowed) return;
  assertEquals(gate.status, 429);
  assertEquals(gate.body.code, OCR_DAILY_LIMIT_CODE);
  assertEquals(gate.body.success, false);
  assertEquals(gate.body.error, "Mára elérted a dokumentumfeltöltések keretét (napi 3). Holnap újra feltölthetsz.");
});

Deno.test("the check fails or answers nothing: no unmetered vision call", async () => {
  const down = await consumeDailyOcr(rpcClient({ error: { message: "db down" } }), "u-1");
  assertEquals(down.allowed === false && down.status, 503);
  const empty = await consumeDailyOcr(rpcClient({ data: [] }), "u-1");
  assertEquals(empty.allowed, false);
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

Deno.test("refundDailyOcr gives one back today, nothing on another day or at zero", async () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const today = profileClient({ daily_ocr_count: 3, daily_ocr_date: "2026-11-02" });
  assertEquals(await refundDailyOcr(today, "u-1", now), 2);
  assertEquals(today.updates, [{ daily_ocr_count: 2 }]);
  const old = profileClient({ daily_ocr_count: 3, daily_ocr_date: "2026-11-01" });
  assertEquals(await refundDailyOcr(old, "u-1", now), null);
  const zero = profileClient({ daily_ocr_count: 0, daily_ocr_date: "2026-11-02" });
  assertEquals(await refundDailyOcr(zero, "u-1", now), null);
});
