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

type Grant = { id: string; deadline: string | null; created_at: string };

// Applies the same `deadline.is.null,deadline.gte.<iso>` filter PostgREST would.
function fakeSupabase(grants: Grant[], chunkGrantIds: string[]) {
  const seen: string[] = [];
  return {
    seen,
    rpc: (_name: string, _args: unknown) => Promise.resolve({ data: chunkGrantIds.map((grant_id) => ({ grant_id })), error: null }),
    from(_table: string) {
      let rows = [...grants];
      const b = {
        select: (_c: string) => b,
        or(expr: string) {
          seen.push(expr);
          const iso = expr.match(/deadline\.gte\.(.+)$/)![1];
          rows = rows.filter((g) => g.deadline === null || g.deadline >= iso);
          return b;
        },
        order: (_c: string, _o: unknown) => b,
        limit: (_n: number) => Promise.resolve({ data: rows, error: null }),
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
  assertEquals(sb.seen.length, 1);
});
