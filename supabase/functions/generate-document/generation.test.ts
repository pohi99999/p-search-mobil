import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { generateJson, GeminiOutputError, GEMINI_USER_MESSAGES, type GeminiDeps } from "../_shared/gemini.ts";
import { DOCUMENT_GENERATION, documentErrorResponse } from "./generation.ts";

// The 2026-10-07 failure (P-Search common test, card 6c7049fa #12): gemini-2.5-flash with
// maxOutputTokens 1500 cut the JSON off at character 124 (thinking tokens count against the cap),
// and a bare JSON.parse threw "Unterminated string in JSON at position 124" -> raw 500.
const TRUNCATED = '{\n  "executive_summary": "A BAY Kft. célja a gyártósor korszerűsítése, a támogatásból új CNC-gépek beszer';
const FULL = JSON.stringify({ executive_summary: "Vezetői összefoglaló.", market_analysis: "Piacelemzés.", financial_plan: "Pénzügyi terv." });
const answer = (text: string, finishReason: string) => JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });

function scripted(responses: string[]) {
  const bodies: Record<string, unknown>[] = [];
  const deps: GeminiDeps = {
    fetch: (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      const next = responses.shift();
      if (next === undefined) throw new Error("no more scripted responses");
      return new Response(next, { status: 200 });
    }) as unknown as typeof fetch,
    sleep: async () => {},
  };
  return { deps, bodies };
}

Deno.test("the document request turns thinking off and leaves room for three Hungarian sections", () => {
  assertEquals(DOCUMENT_GENERATION.thinkingBudget, 0);
  assert(DOCUMENT_GENERATION.maxOutputTokens >= 4096, `maxOutputTokens ${DOCUMENT_GENERATION.maxOutputTokens}`);
  assertEquals(DOCUMENT_GENERATION.responseMimeType, "application/json");
});

Deno.test("the settings reach Gemini: thinkingConfig.thinkingBudget 0, maxOutputTokens, system instruction", async () => {
  const s = scripted([answer(FULL, "STOP")]);
  await generateJson("kérés", "key", { ...DOCUMENT_GENERATION, systemInstruction: "rendszer" }, s.deps);
  const cfg = s.bodies[0].generationConfig as Record<string, unknown>;
  assertEquals((cfg.thinkingConfig as Record<string, unknown>).thinkingBudget, 0);
  assertEquals(cfg.maxOutputTokens, DOCUMENT_GENERATION.maxOutputTokens);
  assertEquals((s.bodies[0].systemInstruction as { parts: { text: string }[] }).parts[0].text, "rendszer");
});

Deno.test("cut off once (MAX_TOKENS), then complete: one retry, the parsed sections come back", async () => {
  const s = scripted([answer(TRUNCATED, "MAX_TOKENS"), answer(FULL, "STOP")]);
  const out = await generateJson<{ executive_summary: string }>("kérés", "key", DOCUMENT_GENERATION, s.deps);
  assertEquals(out.executive_summary, "Vezetői összefoglaló.");
  assertEquals(s.bodies.length, 2);
});

Deno.test("cut off twice: a typed gemini_truncated error with a Hungarian text, never a raw SyntaxError", async () => {
  const s = scripted([answer(TRUNCATED, "MAX_TOKENS"), answer(TRUNCATED, "MAX_TOKENS")]);
  const err = await assertRejects(() => generateJson("kérés", "key", DOCUMENT_GENERATION, s.deps), GeminiOutputError);
  assertEquals(err.code, "gemini_truncated");
  assertEquals(err.finishReason, "MAX_TOKENS");
  assertEquals(err.message, GEMINI_USER_MESSAGES.gemini_truncated);
  assertEquals(s.bodies.length, 2, "exactly one retry");
});

Deno.test("broken JSON with STOP twice: gemini_bad_output", async () => {
  const s = scripted([answer(TRUNCATED, "STOP"), answer("nem JSON", "STOP")]);
  const err = await assertRejects(() => generateJson("kérés", "key", DOCUMENT_GENERATION, s.deps), GeminiOutputError);
  assertEquals(err.code, "gemini_bad_output");
});

Deno.test("the HTTP answer for an output error: 502, the code and the Hungarian text, no provider detail", async () => {
  const res = documentErrorResponse(new GeminiOutputError("gemini_truncated", "MAX_TOKENS"), {});
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body, { code: "gemini_truncated", error: GEMINI_USER_MESSAGES.gemini_truncated });
});

Deno.test("any other error stays the generic 500 (no internal detail to the client)", async () => {
  const res = documentErrorResponse(new SyntaxError("Unterminated string in JSON at position 124"), {});
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "Nem sikerült legenerálni a dokumentumot.");
});
