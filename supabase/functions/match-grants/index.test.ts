// Card [K] (review 2026-10-25): the user-initiated search had no test at all. The handler runs here with fake
// clients: who may search, the free daily cap, the refund when the run fails after the cap was consumed, and the
// last_scan_at stamp on success.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, rearmedNextScanAt, type Deps } from "./index.ts";
import { GeminiUnavailableError } from "../_shared/gemini.ts";

type World = {
  user?: { id: string } | null;
  ownedProfile?: boolean;
  cap?: { allowed: boolean } | null;
  capError?: boolean;
  geminiKey?: string | null;
  run?: () => Promise<{ candidates: number; scored: number; inserted: number; skippedLowScore: number }>;
  schedule?: { search_frequency?: string | null; subscription_tier?: string | null; next_scan_at?: string | null } | null;
  scheduleError?: boolean;
};

function setup(w: World) {
  const calls = { runs: 0, refunds: 0, stamps: [] as { patch: Record<string, unknown>; id: string }[], ownerQuery: [] as string[] };
  const userClient = {
    auth: { getUser: () => Promise.resolve({ data: { user: w.user ?? null }, error: w.user ? null : { message: "bad jwt" } }) },
    from: (_t: string) => {
      const b = {
        select: () => b,
        eq: (col: string, v: string) => { calls.ownerQuery.push(`${col}=${v}`); return b; },
        maybeSingle: () => Promise.resolve({ data: w.ownedProfile ? { id: "bp-1" } : null, error: null }),
      };
      return b;
    },
  };
  const adminClient = {
    rpc: (_n: string, _a: unknown) =>
      Promise.resolve(w.capError ? { data: null, error: { message: "db down" } } : { data: [w.cap ?? { allowed: true }], error: null }),
    from: (_t: string) => ({
      select: (_cols: string) => ({
        eq: (_c: string, _id: string) => ({
          maybeSingle: () =>
            Promise.resolve(w.scheduleError ? { data: null, error: { message: "db down" } } : { data: w.schedule ?? null, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => { calls.stamps.push({ patch, id }); return Promise.resolve({ error: null }); },
      }),
    }),
  };
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    GEMINI_API_KEY: w.geminiKey === null ? undefined : (w.geminiKey ?? "g-key"),
  };
  const deps: Deps = {
    // deno-lint-ignore no-explicit-any
    createClient: ((_u: string, key: string) => (key === "service" ? adminClient : userClient)) as any,
    env: (n) => env[n],
    runMatching: () => { calls.runs++; return (w.run ?? (() => Promise.resolve({ candidates: 12, scored: 12, inserted: 3, skippedLowScore: 9 })))(); },
    refund: () => { calls.refunds++; return Promise.resolve(4); },
  };
  return { deps, calls };
}

const req = (body: unknown, auth = "Bearer jwt") =>
  new Request("http://x/match-grants", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ok: World = { user: { id: "u-1" }, ownedProfile: true };

Deno.test("no Authorization header: 401, nothing runs", async () => {
  const { deps, calls } = setup(ok);
  assertEquals((await handler(req({ business_profile_id: "bp-1" }, ""), deps)).status, 401);
  assertEquals(calls.runs, 0);
});

Deno.test("an invalid session: 401", async () => {
  const { deps, calls } = setup({ ...ok, user: null });
  assertEquals((await handler(req({ business_profile_id: "bp-1" }), deps)).status, 401);
  assertEquals(calls.runs, 0);
});

Deno.test("a bad body or no business_profile_id: 400", async () => {
  const { deps } = setup(ok);
  assertEquals((await handler(req("{nem json"), deps)).status, 400);
  assertEquals((await handler(req({}), deps)).status, 400);
});

Deno.test("somebody else's company profile: 403, checked with the caller's own id, nothing runs", async () => {
  const { deps, calls } = setup({ ...ok, ownedProfile: false });
  assertEquals((await handler(req({ business_profile_id: "bp-2" }), deps)).status, 403);
  assertEquals(calls.ownerQuery, ["id=bp-2", "user_id=u-1"]);
  assertEquals(calls.runs, 0);
});

Deno.test("no GEMINI_API_KEY: 503 before anything is consumed", async () => {
  const { deps, calls } = setup({ ...ok, geminiKey: null });
  assertEquals((await handler(req({ business_profile_id: "bp-1" }), deps)).status, 503);
  assertEquals(calls.runs, 0);
});

Deno.test("the free daily cap is used up: 403 daily_limit, nothing runs", async () => {
  const { deps, calls } = setup({ ...ok, cap: { allowed: false } });
  const res = await handler(req({ business_profile_id: "bp-1" }), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).code, "daily_limit");
  assertEquals(calls.runs, 0);
});

Deno.test("the cap check itself fails: 503, nothing runs", async () => {
  const { deps, calls } = setup({ ...ok, capError: true });
  assertEquals((await handler(req({ business_profile_id: "bp-1" }), deps)).status, 503);
  assertEquals(calls.runs, 0);
});

Deno.test("success: 200 with the counts, last_scan_at stamped on the caller's own profile, no refund", async () => {
  const { deps, calls } = setup(ok);
  const res = await handler(req({ business_profile_id: "bp-1" }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true, matches_found: 3, candidates_considered: 12 });
  assertEquals(calls.stamps.length, 1);
  assertEquals(calls.stamps[0].id, "u-1");
  assertEquals(Object.keys(calls.stamps[0].patch), ["last_scan_at"]);
  assertEquals(calls.refunds, 0);
});

Deno.test("the run fails after the cap was consumed: 500, the search is given back", async () => {
  const { deps, calls } = setup({ ...ok, run: () => Promise.reject(new Error("db")) });
  const res = await handler(req({ business_profile_id: "bp-1" }), deps);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).search_refunded, true);
  assertEquals(calls.refunds, 1);
  assertEquals(calls.stamps.length, 0);
});

Deno.test("the AI quota is used up: the typed 429 with the Hungarian text, and the search is given back", async () => {
  const { deps, calls } = setup({ ...ok, run: () => Promise.reject(new GeminiUnavailableError(429)) });
  const res = await handler(req({ business_profile_id: "bp-1" }), deps);
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.code, "gemini_quota");
  assertEquals(body.search_refunded, true);
  assertEquals(calls.refunds, 1);
});

Deno.test("the AI service is overloaded: the typed 503 with the Hungarian text, and the search is given back", async () => {
  const { deps, calls } = setup({ ...ok, run: () => Promise.reject(new GeminiUnavailableError(503)) });
  const res = await handler(req({ business_profile_id: "bp-1" }), deps);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), {
    code: "gemini_busy",
    error: "Az AI-szolgáltatás átmenetileg túlterhelt, próbáld újra egy perc múlva.",
    search_refunded: true,
  });
  assertEquals(calls.refunds, 1);
});

Deno.test("a raw Google error from the run never reaches the client", async () => {
  const raw = "[GoogleGenerativeAI Error]: [500 Internal Server Error] upstream detail";
  const { deps } = setup({ ...ok, run: () => Promise.reject(new Error(raw)) });
  const text = await (await handler(req({ business_profile_id: "bp-1" }), deps)).text();
  assertEquals(text.includes("GoogleGenerativeAI"), false);
  assertEquals(JSON.parse(text).error, "Nem sikerült lefuttatni a pályázatkeresést.");
});

// P-Search round 6 (Kenshin, 2026-11-25): a new account's slot is due from signup, so the first manual search was
// followed by an automatic one within the hour. A due slot is re-armed by a successful manual run; one still ahead is not.
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-25T11:16:00.000Z");

Deno.test("rearmedNextScanAt: a due weekly slot moves to now + 7 days", () => {
  assertEquals(
    rearmedNextScanAt({ search_frequency: "weekly", subscription_tier: "free", next_scan_at: "2026-11-25T11:13:00.000Z" }, NOW),
    new Date(NOW.getTime() + 7 * DAY).toISOString(),
  );
});

Deno.test("rearmedNextScanAt: a free account with 'daily' stored is re-armed weekly, a Pro one daily", () => {
  const due = "2026-11-25T11:00:00.000Z";
  assertEquals(rearmedNextScanAt({ search_frequency: "daily", subscription_tier: "free", next_scan_at: due }, NOW), new Date(NOW.getTime() + 7 * DAY).toISOString());
  assertEquals(rearmedNextScanAt({ search_frequency: "daily", subscription_tier: "pro", next_scan_at: due }, NOW), new Date(NOW.getTime() + DAY).toISOString());
});

Deno.test("rearmedNextScanAt: a slot still ahead, a manual account (null), no row or a bad date is left alone", () => {
  assertEquals(rearmedNextScanAt({ search_frequency: "weekly", next_scan_at: "2026-11-30T00:00:00.000Z" }, NOW), null);
  assertEquals(rearmedNextScanAt({ search_frequency: "manual", next_scan_at: null }, NOW), null);
  assertEquals(rearmedNextScanAt(null, NOW), null);
  assertEquals(rearmedNextScanAt({ search_frequency: "weekly", next_scan_at: "nem datum" }, NOW), null);
});

Deno.test("success with a due slot: next_scan_at is re-armed together with last_scan_at", async () => {
  const { deps, calls } = setup({ ...ok, schedule: { search_frequency: "weekly", subscription_tier: "free", next_scan_at: "2000-01-01T00:00:00.000Z" } });
  const before = Date.now();
  assertEquals((await handler(req({ business_profile_id: "bp-1" }), deps)).status, 200);
  assertEquals(calls.stamps.length, 1);
  assertEquals(Object.keys(calls.stamps[0].patch).sort(), ["last_scan_at", "next_scan_at"]);
  const next = new Date(calls.stamps[0].patch.next_scan_at as string).getTime();
  const last = new Date(calls.stamps[0].patch.last_scan_at as string).getTime();
  assertEquals(next - last, 7 * DAY);
  assertEquals(last >= before, true);
});

Deno.test("success with a slot still ahead: only last_scan_at is stamped", async () => {
  const { deps, calls } = setup({ ...ok, schedule: { search_frequency: "weekly", subscription_tier: "free", next_scan_at: "2999-01-01T00:00:00.000Z" } });
  assertEquals((await handler(req({ business_profile_id: "bp-1" }), deps)).status, 200);
  assertEquals(Object.keys(calls.stamps[0].patch), ["last_scan_at"]);
});

Deno.test("the schedule read fails: the search still succeeds, only last_scan_at is stamped", async () => {
  const { deps, calls } = setup({ ...ok, scheduleError: true, schedule: { search_frequency: "weekly", next_scan_at: "2000-01-01T00:00:00.000Z" } });
  assertEquals((await handler(req({ business_profile_id: "bp-1" }), deps)).status, 200);
  assertEquals(Object.keys(calls.stamps[0].patch), ["last_scan_at"]);
  assertEquals(calls.refunds, 0);
});
