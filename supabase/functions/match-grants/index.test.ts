// Card [K] (review 2026-10-25): the user-initiated search had no test at all. The handler runs here with fake
// clients: who may search, the free daily cap, the refund when the run fails after the cap was consumed, and the
// last_scan_at stamp on success.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, type Deps } from "./index.ts";
import { GeminiUnavailableError } from "../_shared/gemini.ts";

type World = {
  user?: { id: string } | null;
  ownedProfile?: boolean;
  cap?: { allowed: boolean } | null;
  capError?: boolean;
  geminiKey?: string | null;
  run?: () => Promise<{ candidates: number; scored: number; inserted: number; skippedLowScore: number }>;
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
