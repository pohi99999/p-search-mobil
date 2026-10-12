// Card d8ff4f1b: Claude first, Gemini as the fallback. Every Claude failure shape must end on the
// Gemini answer (the user never sees a Claude error), and the Claude request must carry none of
// the parameters the owner said return 400 on the 5.x models.
// Runs under the CI's `deno test --allow-read supabase/functions/_shared/`: no env permission,
// so the env is injected through deps, and one case checks that a missing permission is no crash.
import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { chatJson, classifyFailure, extractJson, generateJson, generateText, normalizeTurns, type LlmDeps } from './llm.ts';

type Seen = { claude: { url: string; body: Record<string, unknown> }[]; gemini: number };

function claudeOk(text: string, stop = 'end_turn') {
  return new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: stop }), { status: 200 });
}
function geminiOk(text: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200 });
}

function setup(claude: () => Response | Promise<Response>, env: Record<string, string> = { ANTHROPIC_API_KEY: 'k' }, gemini = 'gemini-valasz') {
  const seen: Seen = { claude: [], gemini: 0 };
  const lines: string[] = [];
  const deps: LlmDeps = {
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://api.anthropic.com/')) {
        seen.claude.push({ url: u, body: JSON.parse(String(init?.body)) });
        return await claude();
      }
      seen.gemini++;
      return geminiOk(gemini);
    }) as typeof fetch,
    sleep: () => Promise.resolve(),
    env: (n) => env[n],
    log: (l) => lines.push(l),
  };
  return { seen, lines, deps };
}

const quiet = async (fn: () => Promise<void>) => {
  const e = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = e;
  }
};

Deno.test('Claude answers: its text is used and Gemini is NOT called', async () => {
  const s = setup(() => claudeOk('claude-valasz'));
  assertEquals(await generateText('p', 'g', {}, s.deps), 'claude-valasz');
  assertEquals(s.seen.gemini, 0);
  assertMatch(s.lines[0], /provider=claude model=claude-haiku-4-5 ok/);
});

Deno.test('the Claude request carries NO temperature / thinking / prefill; the model comes from env', async () => {
  const s = setup(() => claudeOk('x'), { ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm' });
  await generateText('p', 'g', { temperature: 1.0, thinkingBudget: 0, systemInstruction: 'rendszer' }, s.deps);
  const b = s.seen.claude[0].body;
  assertEquals(b.model, 'm');
  assertEquals(b.system, 'rendszer');
  assertEquals(b.messages, [{ role: 'user', content: 'p' }]);
  for (const k of ['temperature', 'thinking', 'top_p', 'top_k']) assert(!(k in b), k);
});

for (const [name, res, code] of [
  ['429 rate limit', () => new Response('rate', { status: 429 }), 'claude_quota'],
  ['529 overloaded', () => new Response('{"type":"overloaded_error"}', { status: 529 }), 'claude_busy'],
  ['credit ran out (400)', () => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 }), 'claude_credit'],
  ['500', () => new Response('x', { status: 500 }), 'claude_error'],
  ['empty answer', () => claudeOk('   '), 'claude_empty'],
  ['cut off at max_tokens', () => claudeOk('{"a":', 'max_tokens'), 'claude_truncated'],
  ['network error', () => { throw new TypeError('connection reset'); }, 'claude_error'],
] as const) {
  Deno.test(`Claude ${name} -> the user gets the Gemini answer, the log says why`, async () => {
    await quiet(async () => {
      const s = setup(res as () => Response);
      assertEquals(await generateText('p', 'g', {}, s.deps), 'gemini-valasz');
      assertEquals(s.seen.gemini, 1);
      assertMatch(s.lines[0], new RegExp(`provider=gemini fallback reason=${code}`));
    });
  });
}

Deno.test('generateJson: Claude JSON is parsed (fence tolerated); broken Claude JSON falls back to Gemini', async () => {
  const ok = setup(() => claudeOk('```json\n{"executive_summary":"x"}\n```'));
  assertEquals(await generateJson<{ executive_summary: string }>('p', 'g', {}, ok.deps), { executive_summary: 'x' });
  assertEquals(ok.seen.gemini, 0);
  assertMatch(String(ok.seen.claude[0].body.system), /KIZÁRÓLAG egyetlen érvényes JSON/);
  const bad = setup(() => claudeOk('ez nem json'), undefined, '{"executive_summary":"g"}');
  await quiet(async () => {
    assertEquals(await generateJson<{ executive_summary: string }>('p', 'g', {}, bad.deps), { executive_summary: 'g' });
  });
  assertMatch(bad.lines[0], /reason=claude_bad_json/);
});

Deno.test('generateText with a JSON request validates the Claude answer before accepting it', async () => {
  const s = setup(() => claudeOk('[{"grant_id":"a","match_score":80}]'));
  assertEquals(JSON.parse(await generateText('p', 'g', { responseMimeType: 'application/json' }, s.deps)), [{ grant_id: 'a', match_score: 80 }]);
  const bad = setup(() => claudeOk('bocs, nem tudom'), undefined, '[]');
  await quiet(async () => {
    assertEquals(await generateText('p', 'g', { responseMimeType: 'application/json' }, bad.deps), '[]');
  });
});

Deno.test('no key, or LLM_PROVIDER=gemini: Claude is never called', async () => {
  for (const env of [{}, { ANTHROPIC_API_KEY: 'k', LLM_PROVIDER: 'gemini' }] as Record<string, string>[]) {
    const s = setup(() => claudeOk('x'), env);
    assertEquals(await generateText('p', 'g', {}, s.deps), 'gemini-valasz');
    assertEquals(s.seen.claude.length, 0);
    assertMatch(s.lines[0], env.LLM_PROVIDER ? /reason=switch/ : /reason=no_claude_key/);
  }
});

Deno.test('without --allow-env (the CI case) the default env lookup does not throw: Gemini path', async () => {
  const s = setup(() => claudeOk('x'));
  const deps: LlmDeps = { fetch: s.deps.fetch, sleep: s.deps.sleep, log: s.deps.log };
  assertEquals(await generateText('p', 'g', {}, deps), 'gemini-valasz');
  assertEquals(s.seen.claude.length, 0);
});

Deno.test('chatJson: history is normalised, the answer comes back as clean JSON text; failure -> the SDK fallback', async () => {
  const s = setup(() => claudeOk('```json\n{"reply":"szia"}\n```'));
  const turns = [{ role: 'assistant' as const, text: 'Üdv!' }, { role: 'user' as const, text: 'a' }, { role: 'user' as const, text: 'b' }];
  const out = await chatJson('rendszer', turns, () => Promise.resolve('{"reply":"sdk"}'), 1000, s.deps);
  assertEquals(JSON.parse(out), { reply: 'szia' });
  assertEquals(s.seen.claude[0].body.messages, [{ role: 'user', content: 'a\n\nb' }]);
  const down = setup(() => new Response('x', { status: 529 }));
  await quiet(async () => {
    assertEquals(await chatJson('rendszer', turns, () => Promise.resolve('{"reply":"sdk"}'), 1000, down.deps), '{"reply":"sdk"}');
  });
});

Deno.test('normalizeTurns: opens with the user, merges same-role runs, drops empty lines', () => {
  assertEquals(normalizeTurns([
    { role: 'assistant', text: 'welcome' },
    { role: 'user', text: 'x' },
    { role: 'assistant', text: ' ' },
    { role: 'assistant', text: 'y' },
    { role: 'assistant', text: 'z' },
    { role: 'user', text: 'w' },
  ]), [{ role: 'user', text: 'x' }, { role: 'assistant', text: 'y\n\nz' }, { role: 'user', text: 'w' }]);
});

Deno.test('extractJson (OCR): PDF goes as a document, an image as an image; another type goes straight to Gemini', async () => {
  const pdf = setup(() => claudeOk('{"net_revenue":1}'));
  assertEquals(JSON.parse(await extractJson('kinyeres', { mimeType: 'application/pdf', base64: 'QUJD' }, () => Promise.resolve('{}'), 1024, pdf.deps)), { net_revenue: 1 });
  const msg = (pdf.seen.claude[0].body.messages as { content: { type: string; source?: { media_type: string } }[] }[])[0];
  assertEquals(msg.content[0].type, 'document');
  assertEquals(msg.content[0].source?.media_type, 'application/pdf');
  assertEquals(msg.content[1].type, 'text');
  const png = setup(() => claudeOk('{}'));
  await extractJson('k', { mimeType: 'image/png', base64: 'QUJD' }, () => Promise.resolve('{}'), 1024, png.deps);
  assertEquals((png.seen.claude[0].body.messages as { content: { type: string }[] }[])[0].content[0].type, 'image');
  const tif = setup(() => claudeOk('{}'));
  assertEquals(await extractJson('k', { mimeType: 'image/tiff', base64: 'QUJD' }, () => Promise.resolve('{"sdk":1}'), 1024, tif.deps), '{"sdk":1}');
  assertEquals(tif.seen.claude.length, 0);
  assertMatch(tif.lines[0], /unsupported_type image\/tiff/);
});

Deno.test('classifyFailure maps the statuses and the credit message', () => {
  assertEquals(classifyFailure(429, ''), 'claude_quota');
  assertEquals(classifyFailure(529, ''), 'claude_busy');
  assertEquals(classifyFailure(400, 'Your credit balance is too low to access the Anthropic API.'), 'claude_credit');
  assertEquals(classifyFailure(400, 'temperature: unsupported'), 'claude_error');
});
