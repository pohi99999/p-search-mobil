// Deno tests for the delete-account Edge Function (kanban 841f0376).
// Run: deno test --allow-env supabase/functions/delete-account/
//
// `handler` takes `deps.createClient`; the fake below records every query
// builder call so the tests can assert WHAT was deleted, in WHICH order, and
// that every filter carries the JWT user's id and nothing else.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handler, type CreateClientFn } from "./index.ts";

type Call = { table: string; op: string; filter?: [string, unknown] };

function fakeClients(opts: {
  user?: { id: string } | null;
  businesses?: { id: string }[];
  failAt?: string;
}) {
  const calls: Call[] = [];
  const deleted: string[] = [];
  const businesses = opts.businesses ?? [];

  const builder = (table: string) => {
    let op = "select";
    let filter: [string, unknown] | undefined;
    const b: Record<string, unknown> = {};
    const finish = async () => {
      calls.push({ table, op, filter });
      if (opts.failAt === `${table}:${op}`) return { data: null, error: { message: "boom" }, count: null };
      if (op === "delete") {
        deleted.push(table);
        const n = table === "grant_matches" ? 2 : 1;
        return { data: Array.from({ length: n }, (_, i) => ({ id: `${table}-${i}` })), error: null };
      }
      if (op === "select" && table === "business_profiles") return { data: businesses, error: null };
      if (op === "count") return { data: null, error: null, count: 0 };
      return { data: [], error: null };
    };
    b.select = (_cols: string, o?: { count?: string; head?: boolean }) => {
      if (o?.head) op = "count";
      return b;
    };
    b.delete = () => { op = "delete"; return b; };
    b.eq = (col: string, val: unknown) => { filter = [col, val]; return b; };
    b.in = (col: string, val: unknown) => { filter = [col, val]; return b; };
    b.then = (res: (v: unknown) => void, rej: (e: unknown) => void) => finish().then(res, rej);
    return b;
  };

  const deletedUsers: string[] = [];
  const createClient = ((_url: string, key: string) => {
    if (key === "service-role") {
      return {
        from: builder,
        auth: { admin: { deleteUser: async (id: string) => { deletedUsers.push(id); return { error: null }; } } },
      };
    }
    return { auth: { getUser: async () => opts.user ? { data: { user: opts.user }, error: null } : { data: { user: null }, error: { message: "bad jwt" } } } };
  }) as unknown as CreateClientFn;

  return { createClient, calls, deleted, deletedUsers };
}

function req(body: unknown, auth = "Bearer test") {
  return new Request("http://localhost/delete-account", {
    method: "POST",
    headers: auth ? { Authorization: auth, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role");

Deno.test("delete-account: no Authorization -> 401, nothing deleted", async () => {
  const f = fakeClients({ user: { id: "u1" } });
  const res = await handler(req({ confirm: true }, ""), { createClient: f.createClient });
  assertEquals(res.status, 401);
  assertEquals(f.deleted, []);
  assertEquals(f.deletedUsers, []);
});

Deno.test("delete-account: invalid token -> 401, nothing deleted", async () => {
  const f = fakeClients({ user: null });
  const res = await handler(req({ confirm: true }), { createClient: f.createClient });
  assertEquals(res.status, 401);
  assertEquals(f.deleted, []);
});

Deno.test("delete-account: missing confirm -> 400, nothing deleted", async () => {
  const f = fakeClients({ user: { id: "u1" }, businesses: [{ id: "b1" }] });
  const res = await handler(req({}), { createClient: f.createClient });
  assertEquals(res.status, 400);
  assertEquals(f.deleted, []);
  assertEquals(f.deletedUsers, []);
});

Deno.test("delete-account: owner with data -> 200, FK-safe order, every filter is the JWT user's id", async () => {
  const f = fakeClients({ user: { id: "u1" }, businesses: [{ id: "b1" }, { id: "b2" }] });
  const res = await handler(req({ confirm: true, user_id: "SOMEONE-ELSE" }), { createClient: f.createClient });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.deleted, true);
  assertEquals(f.deleted, ["grant_matches", "business_profiles", "profiles"]);
  assertEquals(f.deletedUsers, ["u1"]);
  const filters = f.calls.filter((c) => c.op === "delete").map((c) => c.filter);
  assertEquals(filters, [["business_id", ["b1", "b2"]], ["user_id", "u1"], ["id", "u1"]]);
  assertEquals(body.removed, { grant_matches: 2, business_profiles: 1, profiles: 1 });
});

Deno.test("delete-account: user without business profile -> grant_matches skipped, still removes profile + auth user", async () => {
  const f = fakeClients({ user: { id: "u2" }, businesses: [] });
  const res = await handler(req({ confirm: true }), { createClient: f.createClient });
  assertEquals(res.status, 200);
  assertEquals(f.deleted, ["business_profiles", "profiles"]);
  assertEquals(f.deletedUsers, ["u2"]);
});

Deno.test("delete-account: a table delete fails -> 500 and the auth user is NOT deleted", async () => {
  const f = fakeClients({ user: { id: "u1" }, businesses: [{ id: "b1" }], failAt: "profiles:delete" });
  const res = await handler(req({ confirm: true }), { createClient: f.createClient });
  assertEquals(res.status, 500);
  assertEquals(f.deletedUsers, []);
});
