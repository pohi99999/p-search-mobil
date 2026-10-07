import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { companyContext, grantContext, NO_MISSING_DATA_RULE, mentionsMissingData } from "./company-context.ts";

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
