// Deno tests for backfill-grant-chunks (grant_chunks 5/63). Run: deno test --allow-env supabase/functions/backfill-grant-chunks/
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handler, type Deps } from "./index.ts";
import { buildGrantText, chunkGrant, splitParagraphs } from "../_shared/grant-chunking.ts";

const SERVICE = "service-key-x";
const env = (n: string) => ({ SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_URL: "http://x", GEMINI_API_KEY: "g" } as Record<string, string>)[n];

function fake(opts: { grants: Record<string, unknown>[]; covered: string[] }) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      return {
        select: async (_cols: string) => table === "grant_chunks"
          ? { data: opts.covered.map((grant_id) => ({ grant_id })), error: null }
          : { data: opts.grants, error: null },
        insert: async (rows: Record<string, unknown>[]) => { inserted.push(...rows); return { error: null }; },
      };
    },
  };
  const deps: Deps = { createClient: () => client as unknown as ReturnType<Deps["createClient"]>, embed: async (t) => Array(768).fill(t.length / 1000), env };
  return { deps, inserted };
}
const req = (body: unknown, bearer = SERVICE, method = "POST") =>
  new Request("http://x/backfill-grant-chunks", { method, headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });

Deno.test("chunker: blank-line paragraphs, header first, empty grant gives no chunk", () => {
  assertEquals(splitParagraphs("a\n\n b \n\n\n\nc"), ["a", "b", "c"]);
  const g = { id: "1", title: "GINOP Plusz", provider: "NGM", description: "Első bekezdés.\n\nMásodik bekezdés.", eligibility_criteria: "KKV" };
  const chunks = chunkGrant(g);
  assertEquals(chunks.length, 4);
  assertEquals(chunks[0].startsWith("GINOP Plusz"), true);
  assertEquals(chunks[3], "Jogosultság: KKV");
  assertEquals(chunkGrant({ id: "2" }), []);
  assertEquals(buildGrantText({ id: "3", title: "T", amount_min: 1, amount_max: null }).includes("Összeg: 1 - ? Ft"), true);
});

Deno.test("gate: wrong bearer 401, no writes; right bearer passes", async () => {
  const f = fake({ grants: [{ id: "g1", title: "A", description: "x" }], covered: [] });
  assertEquals((await handler(req({ dry_run: true }, "wrong"), f.deps)).status, 401);
  assertEquals(f.inserted.length, 0);
  assertEquals((await handler(req({ dry_run: true }), f.deps)).status, 200);
});

Deno.test("dry run (the default) plans only the uncovered grants and writes nothing", async () => {
  const f = fake({ grants: [{ id: "g1", title: "A", description: "p1\n\np2" }, { id: "g2", title: "B", description: "q" }], covered: ["g2"] });
  const r = await handler(req({}), f.deps);
  const body = await r.json();
  assertEquals(body.dry_run, true);
  assertEquals(body.grants_total, 2);
  assertEquals(body.grants_covered, 1);
  assertEquals(body.grants_to_backfill, 1);
  assertEquals(body.chunks_planned, 3);
  assertEquals(f.inserted.length, 0);
});

Deno.test("live run inserts embedded chunks for uncovered grants only, idempotent on covered ones", async () => {
  const f = fake({ grants: [{ id: "g1", title: "A", description: "p1\n\np2" }, { id: "g2", title: "B", description: "q" }], covered: ["g2"] });
  const body = await (await handler(req({ dry_run: false }), f.deps)).json();
  assertEquals(body.chunks_inserted, 3);
  assertEquals(f.inserted.length, 3);
  assertEquals(f.inserted.every((r) => r.grant_id === "g1" && (r.embedding as number[]).length === 768), true);
  assertEquals((f.inserted[0].metadata as { source: string }).source, "backfill-grant-chunks");
});
