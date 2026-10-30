// P-Search kör 2 (Irisz P1-0): the scoring places go to grants an SME can apply to.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { candidateVerdict, isSmeCandidate } from "./candidate-filter.ts";
import { collectCandidateGrants } from "./matching.ts";

Deno.test("a call only public bodies inside the state budget may apply to is left out", () => {
  assertEquals(candidateVerdict({ title: "KEHOP_PLUSZ-2.1.21-25", eligibility_criteria: "Non-profit szervezet államháztartáson belül" }), { keep: false, reason: "public_only" });
  assertEquals(candidateVerdict({ title: "X", eligibility_criteria: "Költségvetési szerv, Non-profit szervezet államháztartáson belül" }), { keep: false, reason: "public_only" });
});

Deno.test("a technical-assistance, HVSZ or intermediaries' cost frame is left out", () => {
  for (const title of ["DIMOP Plusz technikai segítségnyújtás", "Technikai felhasználás 2026", "HVSZ keret", "Közvetítők költségtérítése"]) {
    assertEquals(isSmeCandidate({ title, eligibility_criteria: "Mikrovállalkozás" }), false, title);
  }
});

Deno.test("an SME call, a mixed list, a list outside the state budget and an empty list are kept", () => {
  assertEquals(isSmeCandidate({ title: "GINOP_PLUSZ-1.4.4-24", eligibility_criteria: "Mikrovállalkozás, kisvállalkozás, középvállalkozás" }), true);
  assertEquals(isSmeCandidate({ title: "Y", eligibility_criteria: "Non-profit szervezet államháztartáson belül, kisvállalkozás" }), true, "one company type keeps it");
  assertEquals(isSmeCandidate({ title: "Z", eligibility_criteria: "Non-profit szervezet államháztartáson kívül" }), true, "an NGO is not a public body");
  assertEquals(isSmeCandidate({ title: "2025-1.1.1-BAY_VOUCHER", eligibility_criteria: null }), true, "no data, no exclusion");
  assertEquals(isSmeCandidate({ title: "Technikai eszközbeszerzés KKV-knak", eligibility_criteria: "Mikrovállalkozás" }), true, "'technikai' alone is not a frame");
});

// The same fake as match-open-grants.test.ts, with titles and beneficiary lists.
type G = { id: string; deadline: string | null; created_at: string; title: string; eligibility_criteria: string | null; source_closed_at?: string | null };
function fakeSupabase(grants: G[]) {
  return {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from() {
      let rows = [...grants];
      const b = {
        select: () => b,
        in(_c: string, ids: string[]) { rows = rows.filter((g) => ids.includes(g.id)); return b; },
        is(col: string, v: null) { rows = rows.filter((g) => (g as Record<string, unknown>)[col] == v); return b; },
        or: () => b,
        order: () => { rows.sort((a, z) => z.created_at.localeCompare(a.created_at)); return b; },
        limit: (n: number) => { rows = rows.slice(0, n); return b; },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, ko),
      };
      return b;
    },
  };
}

Deno.test("collectCandidateGrants: public-only and technical rows never take a place, an SME row moves up into the 12", async () => {
  const pub = Array.from({ length: 10 }, (_, i) => ({ id: `pub${i}`, deadline: null, created_at: `2026-10-${String(29 - i).padStart(2, "0")}`, title: `KEHOP ${i}`, eligibility_criteria: "Non-profit szervezet államháztartáson belül" }));
  const tech = [{ id: "tech", deadline: null, created_at: "2026-10-30", title: "HVSZ és közvetítők költségtérítése", eligibility_criteria: "Mikrovállalkozás" }];
  const sme = Array.from({ length: 12 }, (_, i) => ({ id: `sme${i}`, deadline: null, created_at: `2026-09-${String(28 - i).padStart(2, "0")}`, title: `GINOP ${i}`, eligibility_criteria: "Mikrovállalkozás, kisvállalkozás" }));
  // deno-lint-ignore no-explicit-any
  const out = await collectCandidateGrants(fakeSupabase([...pub, ...tech, ...sme]) as any, "profil", "key", () => Promise.resolve([0.1]));
  const ids = out.map((g) => g.id);
  assertEquals(ids.filter((id) => id.startsWith("pub") || id === "tech"), []);
  assertEquals(ids.length, 12, "the 12 places are all filled with SME grants");
  assertEquals(ids.every((id) => id.startsWith("sme")), true);
});
