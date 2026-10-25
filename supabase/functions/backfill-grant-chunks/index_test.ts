// Deno tests for backfill-grant-chunks (grant_chunks 5/63). Run: deno test --allow-env supabase/functions/backfill-grant-chunks/
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handler, type Deps } from "./index.ts";
import { GeminiUnavailableError } from "../_shared/gemini.ts";
import { buildGrantText, chunkGrant, splitParagraphs } from "../_shared/grant-chunking.ts";

const SERVICE = "service-key-x";
const env = (n: string) => ({ SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_URL: "http://x", GEMINI_API_KEY: "g" } as Record<string, string>)[n];

// The client's chain as the function uses it: select(...) awaited directly or narrowed with .in(col, values),
// insert(rows), delete().in("id", ids). `chunks` are the existing rows ({id, grant_id}); `failInsert` /
// `failEmbed` make that step fail.
function fake(opts: {
  grants: Record<string, unknown>[];
  covered?: string[];
  chunks?: { id: string; grant_id: string }[];
  failInsert?: boolean;
  failEmbed?: boolean;
  /** Embedding calls after which every call is a 429 (the daily quota). */
  quotaAfter?: number;
}) {
  const inserted: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  let embedCalls = 0;
  const chunks = opts.chunks ?? (opts.covered ?? []).map((grant_id, i) => ({ id: `c${i}`, grant_id }));
  const rowsOf = (table: string) => (table === "grant_chunks" ? chunks : opts.grants) as Record<string, unknown>[];
  const client = {
    from(table: string) {
      return {
        select: (_cols: string) => {
          const all = { data: rowsOf(table), error: null };
          return Object.assign(Promise.resolve(all), {
            in: async (col: string, values: string[]) => ({ data: rowsOf(table).filter((r) => values.includes(r[col] as string)), error: null }),
          });
        },
        insert: async (rows: Record<string, unknown>[]) => {
          if (opts.failInsert) return { error: { message: "insert refused" } };
          inserted.push(...rows);
          return { error: null };
        },
        delete: () => ({ in: async (_col: string, ids: string[]) => { deleted.push(...ids); return { error: null }; } }),
      };
    },
  };
  const deps: Deps = {
    createClient: () => client as unknown as ReturnType<Deps["createClient"]>,
    embed: async (t) => {
      embedCalls++;
      if (opts.failEmbed) throw new Error("embed down");
      if (opts.quotaAfter !== undefined && embedCalls > opts.quotaAfter) throw new GeminiUnavailableError(429, "EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier");
      return Array(768).fill(t.length / 1000);
    },
    env,
  };
  return { deps, inserted, deleted, embedCalls: () => embedCalls };
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
});

// Irisz 4868 (b), Brunella 4872: the header carries the app's deadline and amount, not the raw values.
Deno.test("chunker header: the Budapest day and the app's amount line", () => {
  const bay = buildGrantText({ id: "bay", title: "KKV-k számára nyújtandó K+F+I szolgáltatások", deadline: "2026-12-01T23:00:00+00:00", amount_min: 1, amount_max: 138937500000 });
  assertEquals(bay.includes("Határidő: 2026. 12. 02."), true, bay);
  assertEquals(bay.includes("Összeg: keretösszeg 138 937 500 000 Ft"), true, bay);
  assertEquals(/T23:00|Összeg: 1 /.test(bay), false, bay);
  assertEquals(buildGrantText({ id: "a", title: "T", amount_min: 5000000, amount_max: 40000000 }).includes("Összeg: 5 000 000 Ft - 40 000 000 Ft"), true);
  // A 1 Ft placeholder alone says nothing honest: no amount line.
  assertEquals(buildGrantText({ id: "3", title: "T", amount_min: 1, amount_max: null }).includes("Összeg"), false);
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

// Regenerate (Irisz 4868 (a), Brunella 4872).
const BAY = { id: "bay", title: "BAY", deadline: "2026-12-01T23:00:00+00:00", description: "Leírás." };
const OTHER = { id: "other", title: "Másik", description: "x" };
const regen = (extra: Record<string, unknown> = {}) => req({ mode: "regenerate", grant_ids: ["bay"], ...extra });

Deno.test("regenerate: a dry run by default, listing the chunk ids to delete and the texts to write, nothing written", async () => {
  const f = fake({ grants: [BAY, OTHER], chunks: [{ id: "old1", grant_id: "bay" }, { id: "old2", grant_id: "bay" }, { id: "keep", grant_id: "other" }] });
  const body = await (await handler(regen(), f.deps)).json();
  assertEquals(body.dry_run, true);
  assertEquals(body.chunks_to_delete, 2);
  assertEquals(body.plan[0].delete_chunk_ids, ["old1", "old2"]);
  assertEquals(body.plan[0].new_chunks[0], "BAY\nHatáridő: 2026. 12. 02.");
  assertEquals(body.chunks_to_write, 2);
  assertEquals([f.inserted.length, f.deleted.length], [0, 0]);
});

Deno.test("regenerate write: new chunks in, then only that grant's old ids out", async () => {
  const f = fake({ grants: [BAY, OTHER], chunks: [{ id: "old1", grant_id: "bay" }, { id: "keep", grant_id: "other" }] });
  const body = await (await handler(regen({ dry_run: false }), f.deps)).json();
  assertEquals([body.chunks_inserted, body.chunks_deleted, body.failed.length], [2, 1, 0]);
  assertEquals(f.deleted, ["old1"]);
  assertEquals(f.inserted.every((r) => r.grant_id === "bay"), true);
  assertEquals((f.inserted[0].metadata as { source: string }).source, "backfill-grant-chunks:regenerate");
});

Deno.test("regenerate write: a failed embed or insert deletes nothing; a row with no chunk keeps its old ones", async () => {
  for (const fail of [{ failEmbed: true }, { failInsert: true }]) {
    const f = fake({ grants: [BAY], chunks: [{ id: "old1", grant_id: "bay" }], ...fail });
    const body = await (await handler(regen({ dry_run: false }), f.deps)).json();
    assertEquals(f.deleted, [], JSON.stringify(fail));
    assertEquals(body.failed[0].stage, fail.failEmbed ? "embed" : "insert");
  }
  const empty = fake({ grants: [{ id: "bay" }], chunks: [{ id: "old1", grant_id: "bay" }] });
  const body = await (await handler(regen({ dry_run: false }), empty.deps)).json();
  assertEquals([empty.deleted.length, empty.inserted.length, body.failed[0].stage], [0, 0, "chunk"]);
});

Deno.test("regenerate: bad input is a 400, unknown ids are reported, the gate still holds", async () => {
  const f = fake({ grants: [BAY] });
  for (const ids of [undefined, [], [""], [1], "bay"]) {
    assertEquals((await handler(req({ mode: "regenerate", grant_ids: ids }), f.deps)).status, 400, JSON.stringify(ids));
  }
  assertEquals((await handler(req({ mode: "regenerate", grant_ids: Array.from({ length: 101 }, (_, i) => `g${i}`) }), f.deps)).status, 400);
  assertEquals((await handler(req({ mode: "nope" }), f.deps)).status, 400);
  const body = await (await handler(req({ mode: "regenerate", grant_ids: ["bay", "nincs", "bay"] }), f.deps)).json();
  assertEquals([body.grants_requested, body.not_found], [2, ["nincs"]]);
  assertEquals((await handler(req({ mode: "regenerate", grant_ids: ["bay"], dry_run: false }, "wrong"), f.deps)).status, 401);
  assertEquals([f.inserted.length, f.deleted.length], [0, 0]);
});

Deno.test("regenerate write: the first quota error (429) stops the run and names what is left", async () => {
  const grants = [
    { id: "g1", title: "A", description: "a" },
    { id: "g2", title: "B", description: "b" },
    { id: "g3", title: "C", description: "c" },
  ];
  // g1 needs 2 embeddings; the third call (g2's first) is a 429.
  const f = fake({ grants, chunks: [{ id: "o1", grant_id: "g1" }, { id: "o2", grant_id: "g2" }, { id: "o3", grant_id: "g3" }], quotaAfter: 2 });
  const body = await (await handler(req({ mode: "regenerate", grant_ids: ["g1", "g2", "g3"], dry_run: false }), f.deps)).json();
  assertEquals(body.stopped_reason, "gemini_quota");
  assertEquals(body.quota_id, "EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier");
  assertEquals(body.remaining_grant_ids, ["g2", "g3"]);
  assertEquals(f.embedCalls(), 3, "g3 is not tried");
  assertEquals(f.deleted, ["o1"], "only the finished grant lost its old chunks");
  assertEquals(body.failed.map((x: { grant_id: string }) => x.grant_id), ["g2"]);
  // Any other error is not a stop: the run goes on (a plain failure on every grant).
  const g = fake({ grants, failEmbed: true });
  const other = await (await handler(req({ mode: "regenerate", grant_ids: ["g1", "g2", "g3"], dry_run: false }), g.deps)).json();
  assertEquals([other.stopped_reason, other.remaining_grant_ids, other.failed.length], [null, [], 3]);
});

Deno.test("regenerate: max_embeds takes whole grants in order, the rest is named, nothing over the budget is embedded", async () => {
  // 2 + 2 + 1 chunks; a budget of 3 fits g1 only (g1 + g2 would be 4), and g3 is not jumped ahead.
  const grants = [
    { id: "g1", title: "A", description: "a" },
    { id: "g2", title: "B", description: "b" },
    { id: "g3", title: "C" },
  ];
  const f = fake({ grants, chunks: [{ id: "o1", grant_id: "g1" }, { id: "o2", grant_id: "g2" }] });
  const dry = await (await handler(req({ mode: "regenerate", grant_ids: ["g1", "g2", "g3"], max_embeds: 3 }), f.deps)).json();
  assertEquals([dry.max_embeds, dry.embeds_in_this_run, dry.grants_in_this_run, dry.grants_over_budget], [3, 2, ["g1"], ["g2", "g3"]]);
  const body = await (await handler(req({ mode: "regenerate", grant_ids: ["g1", "g2", "g3"], max_embeds: 3, dry_run: false }), f.deps)).json();
  assertEquals([body.stopped_reason, body.remaining_grant_ids, f.embedCalls(), f.deleted], ["max_embeds", ["g2", "g3"], 2, ["o1"]]);
  // The default budget is 90 (at most 100, the per-minute quota); a grant bigger than the budget alone is not started.
  const d = await (await handler(req({ mode: "regenerate", grant_ids: ["g1"], max_embeds: 1 }), f.deps)).json();
  assertEquals([d.grants_in_this_run, d.grants_over_budget], [[], ["g1"]]);
  assertEquals((await (await handler(req({ mode: "regenerate", grant_ids: ["g1"] }), f.deps)).json()).max_embeds, 90);
  assertEquals((await handler(req({ mode: "regenerate", grant_ids: ["g1"], max_embeds: 100 }), f.deps)).status, 200);
  for (const bad of [0, 101, 2.5, "40", null]) {
    assertEquals((await handler(req({ mode: "regenerate", grant_ids: ["g1"], max_embeds: bad }), f.deps)).status, 400, String(bad));
  }
});
