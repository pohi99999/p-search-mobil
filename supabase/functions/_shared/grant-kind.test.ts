import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { actionPlanHint, grantKind } from "./grant-kind.ts";

// Every grant_type spelling in the live grants table on 2026-10-19 (card e388efe1), with its kind.
Deno.test("the live grant_type spellings map to their kind", () => {
  const live: [string, string][] = [
    ["Vissza nem térítendő támogatás (VNT)", "grant"],
    ["vissza nem térítendő", "grant"],
    ["Pénzügyi eszköz– hitel", "loan"],
    ["hitel", "loan"],
    ["Pénzügyi eszköz – kockázati tőke", "equity"],
    ["Vissza nem térítendő és hitel", "hybrid"],
    ["Vissza nem térítendő és hitel hibrid", "hybrid"],
  ];
  for (const [text, kind] of live) assertEquals(grantKind(text), kind, text);
});

Deno.test("empty or unknown grant_type keeps the grant material", () => {
  for (const t of [null, undefined, "", "  ", "Egyéb"]) assertEquals(grantKind(t), "grant", String(t));
});

Deno.test("the action-plan hint: loan and hybrid get their steps, a grant gets nothing extra", () => {
  const loan = actionPlanHint("loan"), hybrid = actionPlanHint("hybrid");
  for (const w of ["hitel", "saját erő", "fedezet", "törlesztési terv"]) assert(loan.includes(w), w);
  assert(hybrid.includes("pályázati teendők") && hybrid.includes("törlesztési terv"), "hybrid: both");
  assertEquals(actionPlanHint("grant"), "");
  assertEquals(actionPlanHint("equity"), "");
});
