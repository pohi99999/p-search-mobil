import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { companyContext, grantContext, NO_MISSING_DATA_RULE, mentionsMissingData, planGrantSection, PLAN_TIMING_RULE } from "./company-context.ts";

// Common test 2026-10-07 (card 431a496e): Péter's profile had only the company name, and the PDF said
// "Mivel a cég TEÁOR kódja nincs megadva, feltételezzük..." because the prompt itself carried
// "TEÁOR kód (iparág): Nincs megadva". An empty field must not reach the prompt at all.
const EMPTY = { company_name: "Minta Kft", industry_code: "", employee_count: null, yearly_revenue: null, goals: "" };
const FULL = { company_name: "Minta Kft", industry_code: "62.01", employee_count: 12, yearly_revenue: 250000000, goals: "Felhőalapú termék fejlesztése" };

Deno.test("an empty profile gives only the name: no 'Nincs megadva', no 'Ismeretlen', no empty label", () => {
  const c = companyContext(EMPTY);
  assertEquals(c, "Cégnév: Minta Kft");
  assert(!/nincs megadva|ismeretlen/i.test(c));
});

Deno.test("a filled profile carries the given numbers, the revenue with Hungarian grouping", () => {
  const c = companyContext(FULL);
  assert(c.includes("TEÁOR kód (iparág): 62.01"));
  assert(c.includes("Alkalmazottak száma: 12 fő"));
  assert(c.includes("Éves árbevétel: 250 000 000 Ft"), c);
  assert(c.includes("Cég céljai: Felhőalapú termék fejlesztése"));
});

Deno.test("grant context: missing provider, criteria, description are left out, not 'Nincs megadva'", () => {
  const g = grantContext({ title: "GINOP Plusz", provider: null, amount_min: 1000000, amount_max: null, eligibility_criteria: "", description: null });
  assert(!/nincs megadva/i.test(g), g);
  assert(g.includes("Pályázat címe: GINOP Plusz"));
  assert(g.includes("Támogatás összege: legalább 1 000 000 Ft"), g);
});

Deno.test("the prompt rule forbids naming missing data and assumptions", () => {
  assert(/nincs megadva/i.test(NO_MISSING_DATA_RULE) && /feltétel/i.test(NO_MISSING_DATA_RULE));
});

Deno.test("the output check catches the 2026-10-07 phrases and lets a clean text through", () => {
  assert(mentionsMissingData("Mivel a cég TEÁOR kódja nincs megadva, feltételezzük, hogy..."));
  assert(mentionsMissingData("Bár az éves árbevételünk nincs megadva"));
  assert(mentionsMissingData("A pontos létszám ismeretlen, ezért"));
  assert(mentionsMissingData("Feltételezve, hogy a cég"));
  assert(!mentionsMissingData("A Minta Kft. a támogatásból új fejlesztői kapacitást épít ki."));
});

// P-Search kör 2 (Kenshin P1-1, Irisz P1-1): the document and the action plan get the amount and the deadline as
// the app shows them; "1 - 138 937 500 000 Ft" (a placeholder minimum and a programme budget) never reaches them.
Deno.test("grantContext: a placeholder minimum is dropped and a programme budget reads keretösszeg", () => {
  const g = grantContext({ title: "KEHOP", amount_min: 1, amount_max: 138937500000 });
  assert(g.includes("Támogatás összege: keretösszeg 138 937 500 000 Ft"), g);
  assert(!g.includes("1 - 138"), g);
  const normal = grantContext({ title: "GINOP", amount_min: 2000000, amount_max: 30000000 });
  assert(normal.includes("Támogatás összege: 2 000 000 Ft - 30 000 000 Ft"), normal);
  const none = grantContext({ title: "X", amount_min: 1, amount_max: null });
  assert(!/Támogatás összege/.test(none), "only a placeholder: no amount line at all");
});

Deno.test("grantContext: the deadline as the app shows it, and the type, each only when filled", () => {
  const g = grantContext({ title: "BAY Voucher", grant_type: "vissza nem térítendő", deadline: "2026-12-01T23:00:00.000Z" });
  assert(g.includes("Beadási határidő: 2026. 12. 02."), g);
  assert(g.includes("Típus: vissza nem térítendő"), g);
  const bare = grantContext({ title: "X" });
  assertEquals(bare, "Pályázat címe: X");
});

Deno.test("planGrantSection: the action plan gets the grant lines and the deadline-timing rule, no missing-data words", () => {
  const s = planGrantSection({ title: "BAY Voucher", amount_min: 1, amount_max: 3000000, deadline: "2026-12-01T23:00:00.000Z", eligibility_criteria: "KKV" });
  assert(s.startsWith("Kiválasztott pályázat:\nPályázat címe: BAY Voucher"), s);
  assert(s.includes("Beadási határidő: 2026. 12. 02."), s);
  assert(s.includes("Támogatás összege: legfeljebb 3 000 000 Ft"), s);
  assert(s.includes("Kritériumok: KKV"), s);
  assert(s.includes(PLAN_TIMING_RULE), s);
  assert(/határidőhöz időzítsd/.test(PLAN_TIMING_RULE) && /Más dátumot/.test(PLAN_TIMING_RULE));
  assert(!mentionsMissingData(s), s);
});
