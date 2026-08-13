// Deno tests for the trigger-n8n-webhook Edge Function.
//
// Run with: deno test supabase/functions/trigger-n8n-webhook/
//
// NOTE (2026-08-13): Deno was not installed on the machine these tests were
// authored on, so they were written and reasoned through by hand but have
// NOT been executed. A human with Deno installed (or a future CI step)
// should run `deno test supabase/functions/` once to confirm they actually
// pass before relying on them as a regression gate.
//
// Mocking strategy: `handler` accepts optional `deps.createClient` and
// `deps.fetch` (see index.ts). In production these default to the real
// supabase-js `createClient` and the real global `fetch`. Here we substitute
// a fake Supabase client (auth.getUser + a chainable
// business_profiles.select().eq().eq().single() query builder) and a fake
// fetch, so no real network/env access is required. This function only ever
// creates a single Supabase client (the user-scoped one), unlike
// increment-search-count which creates two.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handler, type CreateClientFn, type FetchFn } from "./index.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");

interface MockConfig {
  getUserResult: {
    data: { user: { id: string } | null };
    error: Error | null;
  };
  businessProfileResult?: {
    data: { id: string } | null;
    error: Error | null;
  };
}

interface RecordedCalls {
  businessProfileEqArgs: Array<[string, string]>;
}

function makeMockCreateClient(
  config: MockConfig,
  recorded: RecordedCalls,
): CreateClientFn {
  return ((_url: string, _key: string, _options?: unknown) => {
    return {
      auth: {
        getUser: async () => config.getUserResult,
      },
      from: (_table: string) => ({
        select: (_cols: string) => {
          // Support the exact chained-eq pattern used in index.ts:
          // .select("id").eq("id", business_id).eq("user_id", user.id).single()
          const chain = {
            eq: (col: string, val: string) => {
              recorded.businessProfileEqArgs.push([col, val]);
              return chain;
            },
            single: async () => config.businessProfileResult,
          };
          return chain;
        },
      }),
    } as unknown as ReturnType<CreateClientFn>;
  }) as CreateClientFn;
}

interface RecordedFetch {
  calls: Array<{ url: string; init: RequestInit }>;
}

function makeMockFetch(
  response: { ok: boolean; status?: number; statusText?: string },
  recorded: RecordedFetch,
): FetchFn {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    recorded.calls.push({ url: String(input), init: init ?? {} });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      statusText: response.statusText ?? (response.ok ? "OK" : "Error"),
    } as Response;
  }) as FetchFn;
}

function makeRequest(
  headers: Record<string, string> = {},
  body?: Record<string, unknown>,
): Request {
  return new Request("http://localhost/trigger-n8n-webhook", {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function newRecorded(): RecordedCalls {
  return { businessProfileEqArgs: [] };
}

function newRecordedFetch(): RecordedFetch {
  return { calls: [] };
}

Deno.test("trigger-n8n-webhook: missing Authorization header -> 401, webhook never called", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  const createClient = makeMockCreateClient(
    { getUserResult: { data: { user: null }, error: null } },
    recorded,
  );
  const fetch = makeMockFetch({ ok: true }, fetchCalls);

  const res = await handler(
    makeRequest({}, { business_id: "biz-1", action: "generate" }),
    { createClient, fetch },
  );
  const body = await res.json();

  assertEquals(res.status, 401);
  assertEquals(body.error, "Nincs hitelesítési fejléc");
  assertEquals(fetchCalls.calls.length, 0);
});

Deno.test("trigger-n8n-webhook: invalid/expired token -> 401, webhook never called", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  const createClient = makeMockCreateClient(
    {
      getUserResult: {
        data: { user: null },
        error: new Error("invalid JWT"),
      },
    },
    recorded,
  );
  const fetch = makeMockFetch({ ok: true }, fetchCalls);

  const res = await handler(
    makeRequest(
      { Authorization: "Bearer not-a-real-token" },
      { business_id: "biz-1", action: "generate" },
    ),
    { createClient, fetch },
  );
  const body = await res.json();

  assertEquals(res.status, 401);
  assertEquals(body.error, "Érvénytelen token vagy nem található felhasználó");
  assertEquals(fetchCalls.calls.length, 0);
});

Deno.test("trigger-n8n-webhook: missing business_id/action -> 400, webhook never called", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: "user-1" } }, error: null },
    },
    recorded,
  );
  const fetch = makeMockFetch({ ok: true }, fetchCalls);

  const res = await handler(
    makeRequest({ Authorization: "Bearer valid-token" }, { business_id: "biz-1" }),
    { createClient, fetch },
  );
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "Hiányzó paraméterek");
  assertEquals(fetchCalls.calls.length, 0);
});

Deno.test("trigger-n8n-webhook: authenticated user does NOT own the target business -> 403, webhook never called (ff5233d regression)", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: "attacker-1" } }, error: null },
      // The .eq("id", business_id).eq("user_id", user.id) chain finds no row
      // because this business belongs to someone else -> ownership check fails.
      businessProfileResult: { data: null, error: null },
    },
    recorded,
  );
  const fetch = makeMockFetch({ ok: true }, fetchCalls);

  const res = await handler(
    makeRequest(
      { Authorization: "Bearer valid-token" },
      { business_id: "someone-elses-business", action: "generate" },
    ),
    { createClient, fetch },
  );
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.error, "Hozzáférés megtagadva");
  // Confirms the ownership check was actually applied to both the target
  // business id AND the caller's own id (this is the vulnerable path the
  // ff5233d fix closed: previously the client could trigger the webhook for
  // any business_id it liked).
  assertEquals(recorded.businessProfileEqArgs, [
    ["id", "someone-elses-business"],
    ["user_id", "attacker-1"],
  ]);
  assertEquals(fetchCalls.calls.length, 0);
});

Deno.test("trigger-n8n-webhook: owner triggers webhook for their own business -> 200, n8n webhook is called with correct payload", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  Deno.env.set("N8N_WEBHOOK_URL", "https://n8n.example.com/webhook/abc");

  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: "owner-1" } }, error: null },
      businessProfileResult: { data: { id: "biz-1" }, error: null },
    },
    recorded,
  );
  const fetch = makeMockFetch({ ok: true, status: 200 }, fetchCalls);

  const res = await handler(
    makeRequest(
      { Authorization: "Bearer valid-token" },
      { business_id: "biz-1", action: "generate_action_plan" },
    ),
    { createClient, fetch },
  );
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.success, true);

  assertEquals(recorded.businessProfileEqArgs, [
    ["id", "biz-1"],
    ["user_id", "owner-1"],
  ]);

  assertEquals(fetchCalls.calls.length, 1);
  assertEquals(fetchCalls.calls[0].url, "https://n8n.example.com/webhook/abc");
  assertEquals(fetchCalls.calls[0].init.method, "POST");
  const sentBody = JSON.parse(fetchCalls.calls[0].init.body as string);
  assertEquals(sentBody, {
    business_id: "biz-1",
    user_id: "owner-1",
    action: "generate_action_plan",
  });

  Deno.env.delete("N8N_WEBHOOK_URL");
});

Deno.test("trigger-n8n-webhook: n8n responds with a non-OK status -> 500 with the upstream status surfaced", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  Deno.env.set("N8N_WEBHOOK_URL", "https://n8n.example.com/webhook/abc");

  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: "owner-1" } }, error: null },
      businessProfileResult: { data: { id: "biz-1" }, error: null },
    },
    recorded,
  );
  const fetch = makeMockFetch(
    { ok: false, status: 502, statusText: "Bad Gateway" },
    fetchCalls,
  );

  const res = await handler(
    makeRequest(
      { Authorization: "Bearer valid-token" },
      { business_id: "biz-1", action: "generate" },
    ),
    { createClient, fetch },
  );
  const body = await res.json();

  assertEquals(res.status, 500);
  assertEquals(body.error, "N8N webhook hiba: 502 Bad Gateway");

  Deno.env.delete("N8N_WEBHOOK_URL");
});

Deno.test("trigger-n8n-webhook: N8N_WEBHOOK_URL not configured -> 500, no fetch attempted", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  Deno.env.delete("N8N_WEBHOOK_URL");

  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: "owner-1" } }, error: null },
      businessProfileResult: { data: { id: "biz-1" }, error: null },
    },
    recorded,
  );
  const fetch = makeMockFetch({ ok: true }, fetchCalls);

  const res = await handler(
    makeRequest(
      { Authorization: "Bearer valid-token" },
      { business_id: "biz-1", action: "generate" },
    ),
    { createClient, fetch },
  );
  const body = await res.json();

  assertEquals(res.status, 500);
  assertEquals(body.error, "N8N_WEBHOOK_URL nincs beállítva");
  assertEquals(fetchCalls.calls.length, 0);
});

Deno.test("trigger-n8n-webhook: OPTIONS preflight is answered directly, without touching Supabase or n8n", async () => {
  const recorded = newRecorded();
  const fetchCalls = newRecordedFetch();
  const createClient = makeMockCreateClient(
    { getUserResult: { data: { user: null }, error: null } },
    recorded,
  );
  const fetch = makeMockFetch({ ok: true }, fetchCalls);

  const res = await handler(
    new Request("http://localhost/trigger-n8n-webhook", { method: "OPTIONS" }),
    { createClient, fetch },
  );

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
  assertEquals(fetchCalls.calls.length, 0);
});
