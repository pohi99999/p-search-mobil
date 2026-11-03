import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { NO_MISSING_DATA_RULE } from "../_shared/company-context.ts";
import { documentBrief, documentSystemPrompt } from "./generation.ts";

// Card e388efe1 (Péter 8603): the document follows the programme type. A loan gets loan-application
// material (repayment, own funds, collateral, cash flow), a hybrid both, a grant what it got before.

// The system prompt generate-document built on master f46792f for every grant, copied verbatim.
const MASTER_PROMPT = (c: string, g: string) => `Te egy professzionális pályázatíró AI asszisztens vagy.
A megadott cégprofil és pályázati adatok alapján készíts el egy Üzleti Terv Vázlatot a pályázati felkészüléshez.

Kimeneti formátum: KIZÁRÓLAG egy érvényes JSON formátumot adhatsz vissza, az alábbi kulcsokkal:
- "executive_summary": Vezetői összefoglaló, a projekt célja és a pályázati támogatás felhasználása (magyarul, kb. 150 szó).
- "market_analysis": Piacelemzés, célcsoport és versenyelőny bemutatása a TEÁOR kód és cégprofil alapján (magyarul, kb. 150-200 szó).
- "financial_plan": Pénzügyi terv vázlat, a támogatási összeg elosztása és a várható megtérülés a cégbevétele alapján (magyarul, kb. 150 szó).

Adatok a generáláshoz:
Cégadatok:
${c}

Pályázati adatok:
${g}

${NO_MISSING_DATA_RULE}`;
const C = "- Cégnév: Minta Kft.", G = "- Cím: Minta program";

Deno.test("a grant keeps the master prompt, title and headings byte for byte", () => {
  const b = documentBrief("grant");
  assertEquals(documentSystemPrompt(b, C, G), MASTER_PROMPT(C, G));
  assertEquals(b.title, "Pályázati Felkészülési Üzleti Terv");
  assertEquals(b.programLabel, "Célzott Pályázat:");
  assertEquals(b.headings, ["1. Vezetői Összefoglaló", "2. Piacelemzés és Versenyelőny", "3. Pénzügyi Terv és Megtérülés"]);
  assertEquals(b.userPrompt, "Kérlek, generáld le a pályázathoz illeszkedő üzleti terv vázlatot a megadott adatok alapján.");
});

Deno.test("a loan asks for repayment, own funds, collateral and cash flow, and is not called a grant", () => {
  const b = documentBrief("loan"), p = documentSystemPrompt(b, C, G);
  for (const w of ["törlesztés", "saját erő", "fedezet", "cash-flow", "ne nevezd támogatásnak", "Hitelprogram adatai:"]) assert(p.includes(w), w);
  assert(!p.includes("a pályázati támogatás felhasználása"), "no grant wording");
  assert(b.headings[2].includes("Törlesztés") && b.title.startsWith("Hitelkérelem"), "loan title and headings");
  assert(p.includes(C) && p.includes(G), "the data is in the prompt");
});

Deno.test("a hybrid asks for both parts, kept apart", () => {
  const p = documentSystemPrompt(documentBrief("hybrid"), C, G);
  for (const w of ["vissza nem térítendő támogatás", "visszafizetendő hitel", "támogatási rész", "törlesztés", "saját erő", "fedezet", "cash-flow", "válaszd szét"]) assert(p.includes(w), w);
});

Deno.test("venture capital keeps the grant material until the owner decides", () => {
  assertStrictEquals(documentBrief("equity"), documentBrief("grant"));
});
