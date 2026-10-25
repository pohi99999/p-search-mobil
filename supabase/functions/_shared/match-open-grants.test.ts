// Card [C]: an expired grant is never a matching candidate, but a grant is still one on its own deadline day.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { collectCandidateGrants, openGrantCutoffIso } from "./matching.ts";

Deno.test("the cut is the start of the Budapest day, summer and winter time alike", () => {
  // 2026-10-25 15:00 UTC is 16:00 in Budapest (CET, after the switch that night): the day began 2026-10-24 23:00 UTC.
  assertEquals(openGrantCutoffIso(new Date("2026-10-25T15:00:00Z")), "2026-10-24T23:00:00.000Z");
  // 2026-07-01 00:30 UTC is 02:30 in Budapest (CEST): the day began 2026-06-30 22:00 UTC.
  assertEquals(openGrantCutoffIso(new Date("2026-07-01T00:30:00Z")), "2026-06-30T22:00:00.000Z");
  // 22:30 UTC on 06-30 is already 07-01 00:30 in Budapest.
  assertEquals(openGrantCutoffIso(new Date("2026-06-30T22:30:00Z")), "2026-06-30T22:00:00.000Z");
});

type Grant = { id: string; deadline: string | null; created_at: string; source_closed_at?: string | null };

// Applies the same `deadline.is.null,deadline.gte.<iso>`, `in`, order and limit filters PostgREST would.
function fakeSupabase(grants: Grant[], chunkGrantIds: string[]) {
  const seen: string[] = [];
  return {
    seen,
    rpc: (_name: string, _args: unknown) => Promise.resolve({ data: chunkGrantIds.map((grant_id) => ({ grant_id })), error: null }),
    from(_table: string) {
      let rows = [...grants];
      const b = {
        select: (_c: string) => b,
        in(_col: string, ids: string[]) { seen.push(`in ${ids.length}`); rows = rows.filter((g) => ids.includes(g.id)); return b; },
        is(col: string, v: null) { seen.push(`is ${col}`); rows = rows.filter((g) => (g as Record<string, unknown>)[col] == v); return b; },
        or(expr: string) {
          seen.push(expr);
          const iso = expr.match(/deadline\.gte\.(.+)$/)![1];
          rows = rows.filter((g) => g.deadline === null || g.deadline >= iso);
          return b;
        },
        order: (_c: string, _o: unknown) => { rows.sort((a, z) => z.created_at.localeCompare(a.created_at)); return b; },
        limit: (n: number) => { rows = rows.slice(0, n); return b; },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, ko),
      };
      return b;
    },
  };
}

Deno.test("expired grants are left out, the semantic hits too; no deadline and today's deadline stay", async () => {
  const grants: Grant[] = [
    { id: "expired", deadline: "2020-01-01T00:00:00+00:00", created_at: "2026-01-01" },
    { id: "today", deadline: openGrantCutoffIso(), created_at: "2026-01-02" },
    { id: "open", deadline: "2999-01-01T00:00:00+00:00", created_at: "2026-01-03" },
    { id: "no-deadline", deadline: null, created_at: "2026-01-04" },
  ];
  const sb = fakeSupabase(grants, ["expired", "open"]);
  // deno-lint-ignore no-explicit-any
  const out = await collectCandidateGrants(sb as any, "profil", "key", () => Promise.resolve([0.1]));
  const ids = out.map((g) => g.id);
  assertEquals(ids.includes("expired"), false);
  assertEquals(ids.slice(0, 1), ["open"]); // the semantic hit comes first
  assertEquals(new Set(ids), new Set(["open", "today", "no-deadline"]));
});

Deno.test("an older semantic hit is kept even with more than 60 newer open grants", async () => {
  const newer: Grant[] = Array.from({ length: 70 }, (_, i) => ({
    id: `newer-${i}`, deadline: null, created_at: `2026-10-${String(10 + (i % 15)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00`,
  }));
  const old: Grant = { id: "old-but-relevant", deadline: "2999-01-01T00:00:00+00:00", created_at: "2025-01-01" };
  const sb = fakeSupabase([old, ...newer], ["old-but-relevant"]);
  // deno-lint-ignore no-explicit-any
  const out = await collectCandidateGrants(sb as any, "profil", "key", () => Promise.resolve([0.1]));
  assertEquals(out[0].id, "old-but-relevant");
});

Deno.test("a call closed at the source is never a candidate, not even as a semantic hit (card [H2])", async () => {
  const grants: Grant[] = [
    { id: "closed-at-source", deadline: "2999-01-01T00:00:00+00:00", created_at: "2026-01-01", source_closed_at: "2026-10-25T10:00:00Z" },
    { id: "open", deadline: "2999-01-01T00:00:00+00:00", created_at: "2026-01-02", source_closed_at: null },
  ];
  const sb = fakeSupabase(grants, ["closed-at-source", "open"]);
  // deno-lint-ignore no-explicit-any
  const out = await collectCandidateGrants(sb as any, "profil", "key", () => Promise.resolve([0.1]));
  assertEquals(out.map((g) => g.id), ["open"]);
  assertEquals(sb.seen.filter((x) => x === "is source_closed_at").length, 2);
});
