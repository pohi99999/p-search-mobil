// Card 2428c38f: after a scan, the business's 'new' matches the scan did not re-score become 'stale';
// a stale one the scan found again goes back to 'new'; 'ignored'/'applied' rows are not touched.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { markStaleMatches } from "./matching.ts";

type Row = { id: string; business_id: string; grant_id: string; status: string };

// A tiny stand-in for the PostgREST builder: update(...).eq(...).eq(...).not(...)/.in(...).select()
function fakeClient(rows: Row[]) {
  const calls: { patch: Record<string, string>; filters: string[] }[] = [];
  return {
    calls,
    rows,
    from(_table: string) {
      const q: { patch: Record<string, string>; filters: ((r: Row) => boolean)[]; log: string[] } = { patch: {}, filters: [], log: [] };
      const builder = {
        update(patch: Record<string, string>) { q.patch = patch; return builder; },
        eq(col: keyof Row, v: string) { q.filters.push((r) => r[col] === v); q.log.push(`eq ${col}=${v}`); return builder; },
        not(col: keyof Row, _op: string, list: string) { const ids = list.slice(1, -1).split(',').map((s) => s.replace(/"/g, '')); q.filters.push((r) => !ids.includes(r[col])); q.log.push(`not in ${ids.length}`); return builder; },
        in(col: keyof Row, ids: string[]) { q.filters.push((r) => ids.includes(r[col])); q.log.push(`in ${ids.length}`); return builder; },
        select(_cols: string) {
          const hit = rows.filter((r) => q.filters.every((f) => f(r)));
          for (const r of hit) Object.assign(r, q.patch);
          calls.push({ patch: q.patch, filters: q.log });
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
        },
      };
      return builder;
    },
  };
}

Deno.test("older 'new' matches outside the fresh set become stale; a found-again stale one revives; ignored/applied untouched", async () => {
  const rows: Row[] = [
    { id: "a", business_id: "b1", grant_id: "g-old-1", status: "new" },
    { id: "b", business_id: "b1", grant_id: "g-old-2", status: "new" },
    { id: "c", business_id: "b1", grant_id: "g-fresh", status: "new" },
    { id: "d", business_id: "b1", grant_id: "g-back", status: "stale" },
    { id: "e", business_id: "b1", grant_id: "g-applied", status: "applied" },
    { id: "f", business_id: "b2", grant_id: "g-old-1", status: "new" },
  ];
  const client = fakeClient(rows);
  const res = await markStaleMatches(client, "b1", ["g-fresh", "g-back"]);
  assertEquals(res, { staled: 2, revived: 1 });
  assertEquals(rows.map((r) => `${r.id}:${r.status}`), ["a:stale", "b:stale", "c:new", "d:new", "e:applied", "f:new"]);
});

Deno.test("an empty scan result stales every 'new' match of the business and revives nothing", async () => {
  const rows: Row[] = [
    { id: "a", business_id: "b1", grant_id: "g1", status: "new" },
    { id: "b", business_id: "b1", grant_id: "g2", status: "stale" },
  ];
  const client = fakeClient(rows);
  const res = await markStaleMatches(client, "b1", []);
  assertEquals(res, { staled: 1, revived: 0 });
  assertEquals(rows.map((r) => r.status), ["stale", "stale"]);
});
