import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  generateText,
  generateEmbedding,
  GeminiUnavailableError,
  geminiUnavailableResponse,
  retryWaitMs,
  GEMINI_USER_MESSAGES,
  EMBEDDING_DIMENSIONS,
  type GeminiDeps,
} from "./gemini.ts";

// What Google actually answers on an exhausted free tier (shape measured 2026-09-25).
const RAW_429 = JSON.stringify({
  error: {
    code: 429,
    message: "[GoogleGenerativeAI Error]: You exceeded your current quota. GenerateRequestsPerDayPerProjectPerModel-FreeTier",
    status: "RESOURCE_EXHAUSTED",
    details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3s" }],
  },
});
const RAW_429_DAILY = RAW_429.replace('"3s"', '"3600s"');
const RAW_503 = JSON.stringify({ error: { code: 503, message: "The model is overloaded. Please try again later.", status: "UNAVAILABLE" } });
const OK_TEXT = JSON.stringify({ candidates: [{ content: { parts: [{ text: "kész akcióterv" }] } }] });

function scripted(responses: Array<[number, string, Record<string, string>?]>) {
  const calls: string[] = [];
  const waits: number[] = [];
  const deps: GeminiDeps = {
    fetch: (async (url: string) => {
      calls.push(String(url));
      const next = responses.shift();
      if (!next) throw new Error("no more scripted responses");
      return new Response(next[1], { status: next[0], headers: next[2] ?? {} });
    }) as unknown as typeof fetch,
    sleep: async (ms: number) => { waits.push(ms); },
  };
  return { deps, calls, waits };
}

Deno.test("429 then 200: one retry after Google's retryDelay, then success", async () => {
  const s = scripted([[429, RAW_429], [200, OK_TEXT]]);
  const text = await generateText("p", "key", {}, s.deps);
  assertEquals(text, "kész akcióterv");
  assertEquals(s.calls.length, 2);
  assertEquals(s.waits, [3000]);
});

Deno.test("429 twice: typed gemini_quota error with the Hungarian text, no third call", async () => {
  const s = scripted([[429, RAW_429], [429, RAW_429]]);
  const err = await assertRejects(() => generateText("p", "key", {}, s.deps), GeminiUnavailableError);
  assertEquals(err.code, "gemini_quota");
  assertEquals(err.status, 429);
  assertEquals(err.message, GEMINI_USER_MESSAGES.gemini_quota);
  assert(!err.message.includes("GoogleGenerativeAI"), "the raw Google text must not reach the user");
  assertEquals(s.calls.length, 2);
});

Deno.test("503 twice: typed gemini_busy error", async () => {
  const s = scripted([[503, RAW_503], [503, RAW_503]]);
  const err = await assertRejects(() => generateText("p", "key", {}, s.deps), GeminiUnavailableError);
  assertEquals(err.code, "gemini_busy");
  assertEquals(err.status, 503);
  assertEquals(s.waits, [2000]); // no retryDelay in the body: the default wait
});

Deno.test("exhausted daily quota (retryDelay 3600s): no pointless retry inside the request", async () => {
  const s = scripted([[429, RAW_429_DAILY]]);
  const err = await assertRejects(() => generateText("p", "key", {}, s.deps), GeminiUnavailableError);
  assertEquals(err.code, "gemini_quota");
  assertEquals(s.calls.length, 1);
  assertEquals(s.waits, []);
});

Deno.test("a healthy call is untouched: one request, no wait", async () => {
  const s = scripted([[200, OK_TEXT]]);
  assertEquals(await generateText("p", "key", {}, s.deps), "kész akcióterv");
  assertEquals(s.calls.length, 1);
  assertEquals(s.waits, []);
});

Deno.test("other errors (500) are not retried and not typed as quota/busy", async () => {
  const s = scripted([[500, "boom"]]);
  const err = await assertRejects(() => generateText("p", "key", {}, s.deps), Error);
  assert(!(err instanceof GeminiUnavailableError));
  assertEquals(s.calls.length, 1);
});

Deno.test("embeddings get the same one-retry treatment", async () => {
  const vec = JSON.stringify({ embedding: { values: Array(EMBEDDING_DIMENSIONS).fill(0.1) } });
  const ok = scripted([[503, RAW_503], [200, vec]]);
  assertEquals((await generateEmbedding("t", "key", ok.deps)).length, EMBEDDING_DIMENSIONS);
  const bad = scripted([[429, RAW_429], [429, RAW_429]]);
  const err = await assertRejects(() => generateEmbedding("t", "key", bad.deps), GeminiUnavailableError);
  assertEquals(err.code, "gemini_quota");
});

Deno.test("retryWaitMs: RetryInfo, Retry-After header, default, and too long", () => {
  assertEquals(retryWaitMs(new Response(""), RAW_429), 3000);
  assertEquals(retryWaitMs(new Response("", { headers: { "retry-after": "5" } }), "{}"), 5000);
  assertEquals(retryWaitMs(new Response(""), "{}"), 2000);
  assertEquals(retryWaitMs(new Response(""), RAW_429_DAILY), null);
});

Deno.test("the HTTP answer carries the code, the Hungarian text and the 429/503 status", async () => {
  const res = geminiUnavailableResponse(new GeminiUnavailableError(429), { "Access-Control-Allow-Origin": "*" }, { search_refunded: true });
  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(await res.json(), { code: "gemini_quota", error: GEMINI_USER_MESSAGES.gemini_quota, search_refunded: true });
  const busy = geminiUnavailableResponse(new GeminiUnavailableError(503), {});
  assertEquals(busy.status, 503);
  assertEquals((await busy.json()).code, "gemini_busy");
});
