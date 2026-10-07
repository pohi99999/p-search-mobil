import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { type GeminiDeps } from "../_shared/gemini.ts";
import { generateSections } from "./generation.ts";

// Card 431a496e: a section that still says "nincs megadva" / "feltételezzük" gets ONE regeneration
// with an explicit reminder; a clean answer is taken as it is.
const answer = (o: Record<string, string>) => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] }, finishReason: "STOP" }] });
const BAD = { executive_summary: "Mivel a TEÁOR kód nincs megadva, feltételezzük...", market_analysis: "Piac.", financial_plan: "Pénz." };
const GOOD = { executive_summary: "A Minta Kft. fejlesztése.", market_analysis: "Piac.", financial_plan: "Pénz." };

function scripted(responses: string[]) {
  const prompts: string[] = [];
  const deps: GeminiDeps = {
    fetch: (async (_u: string, init: RequestInit) => { prompts.push(String(init.body)); const n = responses.shift(); if (!n) throw new Error("no more"); return new Response(n, { status: 200 }); }) as unknown as typeof fetch,
    sleep: async () => {},
  };
  return { deps, prompts };
}

Deno.test("a clean answer: one call, taken as it is", async () => {
  const s = scripted([answer(GOOD)]);
  assertEquals((await generateSections("kérés", "key", "rendszer", s.deps)).executive_summary, GOOD.executive_summary);
  assertEquals(s.prompts.length, 1);
});

Deno.test("'nincs megadva / feltételezzük' in the answer: one regeneration with a reminder, the clean one is used", async () => {
  const s = scripted([answer(BAD), answer(GOOD)]);
  const out = await generateSections("kérés", "key", "rendszer", s.deps);
  assertEquals(out.executive_summary, GOOD.executive_summary);
  assertEquals(s.prompts.length, 2);
  assert(/nincs megadva/i.test(s.prompts[1]), "the second call carries the reminder");
});
