import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractNextSteps, stripMarkdownFence, cleanInline, cutAtWord } from "./tasks.ts";

// The structure Gemini gave on 2026-10-07 (action_plans e63b0304, card a815756f): a fenced markdown,
// "Célok" as "*   **Title:** text" bullets, "Következő Lépések" as numbered items with indented
// sub-bullets. The old /^[*-]\s+(.+)$/gm took the first five bullets of the whole text: the GOALS.
// (Made-up wording; the real plan stays in the database.)
const PLAN = [
  "```markdown",
  "# Pályázati Akcióterv – Minta Kft",
  "",
  "## 1. Célok (Goals)",
  "",
  "*   **Innováció felgyorsítása:** Külső kutatói kapacitás igénybevétele a fejlesztéshez.",
  "*   **Kockázatcsökkentés:** A belső fejlesztések kockázatának mérséklése.",
  "*   **Versenyképesség növelése:** Új termékek gyorsabb piacra vitele.",
  "",
  "## 2. Javasolt Pályázatok (Recommended Grants)",
  "",
  "## 3. Következő Lépések (Next Steps)",
  "",
  "1.  **Részletes Jogosultsági Ellenőrzés:**",
  "    *   Áttekinteni a felhívás teljes dokumentációját.",
  "    *   Ellenőrizni a KKV-státuszt és a TEÁOR-kódot.",
  "",
  "2.  **Projektötlet Pontos Meghatározása:**",
  "    *   Kidolgozni a konkrét fejlesztési ötletet.",
  "",
  "3.  **Kapcsolatfelvétel a Kutatóközponttal:**",
  "    *   Egyeztetni az együttműködés formájáról.",
  "",
  "4.  **Pályázati Anyag Összeállítása:**",
  "    *   Összegyűjteni a mellékleteket.",
  "",
  "5.  **Belső Felülvizsgálat:**",
  "    *   Vezetői jóváhagyás.",
  "",
  "6.  **Pályázat Benyújtása:**",
  "    *   Határidőn belül benyújtani.",
  "```",
].join("\n");

Deno.test("tasks come from 'Következő lépések', never from the goals (the 2026-10-07 bug)", () => {
  const tasks = extractNextSteps(PLAN);
  assertEquals(tasks.map((t) => t.title), [
    "Részletes Jogosultsági Ellenőrzés",
    "Projektötlet Pontos Meghatározása",
    "Kapcsolatfelvétel a Kutatóközponttal",
    "Pályázati Anyag Összeállítása",
    "Belső Felülvizsgálat",
  ], "the first five next steps, in order, at most five");
  assert(!tasks.some((t) => /Innováció|Kockázat|Versenyképesség/.test(t.title)), "no goal became a task");
});

Deno.test("titles carry no markdown and no trailing colon; the description is the step's own content", () => {
  const [first] = extractNextSteps(PLAN);
  assert(!/[*_`]/.test(first.title));
  assertEquals(first.description, "Áttekinteni a felhívás teljes dokumentációját.\nEllenőrizni a KKV-státuszt és a TEÁOR-kódot.");
  assert(!/Automatikusan generált/.test(first.description));
});

Deno.test("a bullet-style next step '* **Title:** text' splits into title and description", () => {
  const md = "## Következő lépések\n\n* **Kapcsolatfelvétel:** Felhívni a kiíró ügyfélszolgálatát.\n- Dokumentumok összegyűjtése";
  assertEquals(extractNextSteps(md), [
    { title: "Kapcsolatfelvétel", description: "Felhívni a kiíró ügyfélszolgálatát." },
    { title: "Dokumentumok összegyűjtése", description: "" },
  ]);
});

Deno.test("the section ends at the next heading; a bold pseudo-heading is accepted", () => {
  const md = "**3. Következő lépések**\n1. Első lépés\n2. Második lépés\n## 4. Kockázatok\n* Nem feladat";
  assertEquals(extractNextSteps(md).map((t) => t.title), ["Első lépés", "Második lépés"]);
});

Deno.test("no 'Következő lépések' section: no tasks (the caller falls back to 'Akcióterv áttekintése')", () => {
  assertEquals(extractNextSteps("## 1. Célok\n* **Cél:** valami\n* másik cél"), []);
});

Deno.test("the code fence around the whole answer is removed", () => {
  assertEquals(stripMarkdownFence("```markdown\n# Cím\nszöveg\n```"), "# Cím\nszöveg");
  assertEquals(stripMarkdownFence("# Cím\nszöveg"), "# Cím\nszöveg");
});

Deno.test("long titles are cut at a word boundary, not mid-word", () => {
  const t = cutAtWord("Kapcsolatfelvétel a kutatóközpont illetékes munkatársaival a pályázatban megjelölt elérhetőségeken", 60);
  assert(t.length <= 61, t);
  assert(t.endsWith("…"));
  assertEquals(t, "Kapcsolatfelvétel a kutatóközpont illetékes munkatársaival…");
  assertEquals(cleanInline("**Cím:** `kód` és __kiemelés__"), "Cím: kód és kiemelés");
});
