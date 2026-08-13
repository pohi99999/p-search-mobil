// Deno tests for the increment-search-count Edge Function.
//
// Run with: deno test supabase/functions/increment-search-count/
//
// NOTE (2026-08-13): Deno was not installed on the machine these tests were
// authored on, so they were written and reasoned through by hand but have
// NOT been executed. A human with Deno installed (or a future CI step)
// should run `deno test supabase/functions/` once to confirm they actually
// pass before relying on them as a regression gate.
//
// Mocking strategy: `handler` accepts an optional `deps.createClient`
// dependency (see index.ts). In production this defaults to the real
// `createClient` from supabase-js. Here we substitute a fake factory that
// returns two different lightweight mock clients depending on how it was
// called:
//   - called with 3 args (url, key, options) -> the user-scoped ("anon")
//     client, which this function only ever uses for `auth.getUser()`.
//   - called with 2 args (url, key) -> the admin client, used for reading
//     and writing the `profiles` table.
// This mirrors exactly how index.ts calls `deps.createClient` for
// `supabaseClient` vs `supabaseAdmin`, so no real network/env access is
// required.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handler, type CreateClientFn } from "./index.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

interface MockConfig {
  getUserResult: {
    data: { user: { id: string } | null };
    error: Error | null;
  };
  selectResult?: {
    data: { search_count: number } | null;
    error: Error | null;
  };
  updateResult?: { error: Error | null };
}

interface RecordedCalls {
  selectEqArgs: Array<[string, string]>;
  updateArgs: Array<{ values: unknown; eqArgs: [string, string] }>;
}

function makeMockCreateClient(
  config: MockConfig,
  recorded: RecordedCalls,
): CreateClientFn {
  return ((_url: string, _key: string, options?: unknown) => {
    if (options) {
      // 3-arg call: the user-scoped client, used only for auth.getUser().
      return {
        auth: {
          getUser: async () => config.getUserResult,
        },
      } as unknown as ReturnType<CreateClientFn>;
    }

    // 2-arg call: the admin client, used for reading/writing `profiles`.
    return {
      from: (_table: string) => ({
        select: (_cols: string) => ({
          eq: (col: string, val: string) => {
            recorded.selectEqArgs.push([col, val]);
            return {
              single: async () => config.selectResult,
            };
          },
        }),
        update: (values: unknown) => ({
          eq: async (col: string, val: string) => {
            recorded.updateArgs.push({ values, eqArgs: [col, val] });
            return config.updateResult ?? { error: null };
          },
        }),
      }),
    } as unknown as ReturnType<CreateClientFn>;
  }) as CreateClientFn;
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/increment-search-count", {
    method: "POST",
    headers,
  });
}

function newRecorded(): RecordedCalls {
  return { selectEqArgs: [], updateArgs: [] };
}

Deno.test("increment-search-count: missing Authorization header -> rejected, no Supabase calls made", async () => {
  const recorded = newRecorded();
  const createClient = makeMockCreateClient(
    { getUserResult: { data: { user: null }, error: null } },
    recorded,
  );

  const res = await handler(makeRequest(), { createClient });
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "No authorization header");
  assertEquals(recorded.selectEqArgs.length, 0);
  assertEquals(recorded.updateArgs.length, 0);
});

Deno.test("increment-search-count: invalid/expired token -> rejected, no profile access", async () => {
  const recorded = newRecorded();
  const createClient = makeMockCreateClient(
    {
      getUserResult: {
        data: { user: null },
        error: new Error("invalid JWT"),
      },
    },
    recorded,
  );

  const res = await handler(
    makeRequest({ Authorization: "Bearer not-a-real-token" }),
    { createClient },
  );
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "Error getting user");
  assertEquals(recorded.selectEqArgs.length, 0);
  assertEquals(recorded.updateArgs.length, 0);
});

Deno.test("increment-search-count: valid, authorized request increments the caller's OWN count only", async () => {
  const recorded = newRecorded();
  const userId = "user-123";
  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: userId } }, error: null },
      selectResult: { data: { search_count: 0 }, error: null },
      updateResult: { error: null },
    },
    recorded,
  );

  const res = await handler(
    makeRequest({ Authorization: "Bearer valid-token" }),
    { createClient },
  );
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.allowed, true);
  assertEquals(body.newCount, 1);

  // This function never accepts a target user id from the request body or
  // headers -- the row it reads and writes is always scoped to
  // `user.id` derived from the caller's own JWT. That is the ownership
  // check for this endpoint: it is structurally impossible to increment
  // anyone else's counter, so we assert both the read and the write were
  // filtered on the authenticated caller's id.
  assertEquals(recorded.selectEqArgs, [["id", userId]]);
  assertEquals(recorded.updateArgs.length, 1);
  assertEquals(recorded.updateArgs[0].values, { search_count: 1 });
  assertEquals(recorded.updateArgs[0].eqArgs, ["id", userId]);
});

Deno.test("increment-search-count: caller already at the limit -> denied, profile is NOT written", async () => {
  const recorded = newRecorded();
  const userId = "user-456";
  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: userId } }, error: null },
      selectResult: { data: { search_count: 1 }, error: null },
    },
    recorded,
  );

  const res = await handler(
    makeRequest({ Authorization: "Bearer valid-token" }),
    { createClient },
  );
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.allowed, false);
  assertEquals(body.error, "Limit reached");
  // The read happens (to check the limit) but the write must be skipped.
  assertEquals(recorded.selectEqArgs, [["id", userId]]);
  assertEquals(recorded.updateArgs.length, 0);
});

Deno.test("increment-search-count: profile lookup failure surfaces as an error, no write attempted", async () => {
  const recorded = newRecorded();
  const userId = "user-789";
  const createClient = makeMockCreateClient(
    {
      getUserResult: { data: { user: { id: userId } }, error: null },
      selectResult: { data: null, error: new Error("db unavailable") },
    },
    recorded,
  );

  const res = await handler(
    makeRequest({ Authorization: "Bearer valid-token" }),
    { createClient },
  );
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error, "db unavailable");
  assertEquals(recorded.updateArgs.length, 0);
});

Deno.test("increment-search-count: OPTIONS preflight is answered directly, without touching Supabase", async () => {
  const recorded = newRecorded();
  const createClient = makeMockCreateClient(
    { getUserResult: { data: { user: null }, error: null } },
    recorded,
  );

  const res = await handler(
    new Request("http://localhost/increment-search-count", {
      method: "OPTIONS",
    }),
    { createClient },
  );

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
  assertEquals(recorded.selectEqArgs.length, 0);
  assertEquals(recorded.updateArgs.length, 0);
});
