// The answers of a failed action-plan run: Gemini 429/503 with their code and Hungarian text, everything else a
// generic 500, and never the raw Google error text. The last case runs the real path: Claude off, Gemini 429 twice.
import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { ACTION_PLAN_GENERIC_ERROR, actionPlanErrorResponse } from './errors.ts';
import { GeminiUnavailableError } from '../_shared/gemini.ts';
import { generateText, type LlmDeps } from '../_shared/llm.ts';

const RAW_GOOGLE = '[GoogleGenerativeAI Error]: You exceeded your current quota. GenerateRequestsPerDayPerProjectPerModel-FreeTier';
const quiet = async (fn: () => Promise<void>) => {
  const e = console.error;
  console.error = () => {};
  try { await fn(); } finally { console.error = e; }
};

Deno.test('Gemini 429: 429 {code: gemini_quota, error: the Hungarian text}', async () => {
  const res = actionPlanErrorResponse(new GeminiUnavailableError(429), {});
  assertEquals(res.status, 429);
  assertEquals(await res.json(), { code: 'gemini_quota', error: 'A napi AI-keret elfogyott, holnap 09:00 után próbáld újra.' });
});

Deno.test('Gemini 503: 503 {code: gemini_busy, error: the Hungarian text}', async () => {
  const res = actionPlanErrorResponse(new GeminiUnavailableError(503), {});
  assertEquals(res.status, 503);
  assertEquals(await res.json(), { code: 'gemini_busy', error: 'Az AI-szolgáltatás átmenetileg túlterhelt, próbáld újra egy perc múlva.' });
});

Deno.test('any other error: a generic 500, the raw Google text is not in the answer', async () => {
  await quiet(async () => {
    const res = actionPlanErrorResponse(new Error(RAW_GOOGLE), { 'Access-Control-Allow-Origin': '*' });
    assertEquals(res.status, 500);
    const text = await res.text();
    assertEquals(JSON.parse(text), { error: ACTION_PLAN_GENERIC_ERROR });
    assertEquals(text.includes('GoogleGenerativeAI'), false);
  });
});

Deno.test('the real path: Claude fails, Gemini answers 429 twice -> one retry, then the 429 answer', async () => {
  await quiet(async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    const deps: LlmDeps = {
      fetch: (async (url: string | URL | Request) => {
        const u = String(url);
        calls.push(u.startsWith('https://api.anthropic.com/') ? 'claude' : 'gemini');
        if (u.startsWith('https://api.anthropic.com/')) return new Response('{"type":"overloaded_error"}', { status: 529 });
        return new Response(JSON.stringify({ error: { code: 429, message: RAW_GOOGLE, details: [{ retryDelay: '4s' }] } }), { status: 429 });
      }) as typeof fetch,
      sleep: (ms) => { waits.push(ms); return Promise.resolve(); },
      // a key-shaped value is never committed; any non-empty string switches Claude on here
      env: (n) => (n === 'ANTHROPIC_API_KEY' ? crypto.randomUUID() : undefined),
      log: () => {},
    };
    const err = await assertRejects(() => generateText('p', 'g', {}, deps), GeminiUnavailableError);
    assertEquals(calls, ['claude', 'gemini', 'gemini'], 'Claude first, Gemini as the fallback, one retry');
    assertEquals(waits, [4000], "Google's retryDelay is respected");
    const res = actionPlanErrorResponse(err, {});
    assertEquals(res.status, 429);
    assertEquals((await res.json()).code, 'gemini_quota');
  });
});
