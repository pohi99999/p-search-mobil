/**
 * The text-generation provider switch (card d8ff4f1b): Claude first, Gemini as the fallback.
 *
 * generateText / generateJson keep the exact signatures of the gemini.ts helpers, so a call site
 * only changes its import. The chat and the OCR call the Google SDK directly; they pass that call
 * in as the fallback (chatJson / extractJson below), so the existing Gemini code runs unchanged
 * whenever Claude does not answer.
 *
 * Fallback on ANY Claude failure: 429, 529/503 overloaded, the 400 "credit balance is too low"
 * (the 100 USD monthly credit is shared with the HomolaMentor site; when it runs out, everything
 * goes to Gemini), other non-2xx, network error, timeout, an empty answer, an answer cut off at
 * max_tokens, or JSON that does not parse. The user sees no difference; the function log names the
 * provider and the reason (`llm provider=... reason=...`).
 *
 * Embeddings are NOT here: grant_chunks.embedding is vector(768) from gemini-embedding-001, and
 * Claude has no embedding API. generateEmbedding stays in gemini.ts.
 *
 * Not sent to Claude on purpose: temperature, an assistant prefill, thinking / budget_tokens (the
 * owner's instruction, 3344: on the 5.x models these come back 400, and a 400 would only burn the
 * shared credit before every fallback). The Gemini-only options (temperature, thinkingBudget,
 * responseMimeType) still reach the Gemini fallback untouched.
 *
 * Env: ANTHROPIC_API_KEY (no key = Gemini only, the pre-change behaviour), ANTHROPIC_MODEL,
 * LLM_PROVIDER=gemini (kill switch, takes effect without a redeploy).
 */

import {
  generateJson as geminiJson,
  generateText as geminiText,
  parseJsonFromModel,
  type GeminiDeps,
  type GenerateOptions,
} from './gemini.ts';

const CLAUDE_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
/** The live name comes from ANTHROPIC_MODEL; this default was checked against GET /v1/models on
 *  2026-10-12 (claude-haiku-5-5 and claude-sonnet-5-5 listed). */
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';
/** Haiku 5.5 thinks adaptively and its thinking counts against max_tokens (measured 2026-10-12:
 *  736 of 1142 output tokens were thinking on a short task). The Gemini caps of the call sites
 *  (1000 for the chat, 1024 for the OCR) would cut Claude off mid-answer, so Claude gets at least
 *  this much; it is only a ceiling, output is billed as used. */
export const MIN_CLAUDE_MAX_TOKENS = 8000;
export const DEFAULT_TIMEOUT_MS = 30_000;

const JSON_ONLY =
  'A válaszod KIZÁRÓLAG egyetlen érvényes JSON érték legyen (objektum vagy tömb, ahogy a feladat kéri), kódblokk és más szöveg nélkül.';

export type ClaudeFailure = 'claude_quota' | 'claude_busy' | 'claude_credit' | 'claude_error' | 'claude_timeout' | 'claude_empty' | 'claude_truncated' | 'claude_bad_json';

export class ClaudeUnavailableError extends Error {
  readonly status: number;
  readonly code: ClaudeFailure;
  constructor(status: number, code: ClaudeFailure) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface LlmDeps extends GeminiDeps {
  /** Env lookup; the default never throws (the _shared tests run without --allow-env). */
  env?: (name: string) => string | undefined;
  log?: (line: string) => void;
}

const safeEnv = (name: string): string | undefined => {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
};

const defaultDeps: LlmDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** HTTP status + body -> why Claude did not answer; the credit message is its own code. */
export function classifyFailure(status: number, body: string): ClaudeFailure {
  if (status === 429) return 'claude_quota';
  if (status === 529 || status === 503) return 'claude_busy';
  if (/credit balance/i.test(body)) return 'claude_credit';
  return 'claude_error';
}

export type Turn = { role: 'user' | 'assistant'; text: string };
export type Attachment = { mimeType: string; base64: string };

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Can Claude read this file inline? PDF as a document block, the four image types as images. */
export function claudeReadable(mimeType: string): boolean {
  return mimeType === 'application/pdf' || CLAUDE_IMAGE_TYPES.includes(mimeType);
}

function attachmentBlock(a: Attachment) {
  const source = { type: 'base64', media_type: a.mimeType, data: a.base64 };
  return a.mimeType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
}

type ClaudeRequest = { system?: string; turns: Turn[]; attachment?: Attachment; maxTokens?: number };

/** One Claude Messages call. Throws ClaudeUnavailableError on every failure; no retry here. */
export async function claudeCall(req: ClaudeRequest, key: string, model: string, deps: LlmDeps, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const messages = req.turns.map((t, i) => {
    const last = i === req.turns.length - 1;
    if (last && req.attachment && t.role === 'user') {
      return { role: 'user', content: [attachmentBlock(req.attachment), { type: 'text', text: t.text }] };
    }
    return { role: t.role, content: t.text };
  });
  let res: Response;
  try {
    res = await deps.fetch(`${CLAUDE_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({
        model,
        max_tokens: Math.max(req.maxTokens ?? 0, MIN_CLAUDE_MAX_TOKENS),
        ...(req.system ? { system: req.system } : {}),
        messages,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new ClaudeUnavailableError(0, timeout ? 'claude_timeout' : 'claude_error');
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    // the body goes to the function log only; it can echo request metadata
    console.error(`Claude ${model} hiba (${res.status}):`, body);
    throw new ClaudeUnavailableError(res.status, classifyFailure(res.status, body));
  }
  const json = await res.json();
  const text = (Array.isArray(json?.content) ? json.content : [])
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('');
  if (json?.stop_reason === 'max_tokens') throw new ClaudeUnavailableError(200, 'claude_truncated');
  if (!text.trim()) throw new ClaudeUnavailableError(200, 'claude_empty');
  return text;
}

function claudeConfig(deps: LlmDeps): { key: string; model: string } | { skip: string } {
  const env = deps.env ?? safeEnv;
  if (env('LLM_PROVIDER') === 'gemini') return { skip: 'switch' };
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return { skip: 'no_claude_key' };
  return { key, model: env('ANTHROPIC_MODEL') || DEFAULT_CLAUDE_MODEL };
}

/**
 * Claude first; on any failure (or when Claude is off) the given Gemini call. `parse` runs on the
 * Claude text and may throw: an unusable Claude answer falls back too, never reaches the user.
 */
async function withFallback<T>(
  label: string,
  req: ClaudeRequest,
  deps: LlmDeps,
  gemini: () => Promise<T>,
  parse: (text: string) => T,
): Promise<T> {
  const log = deps.log ?? ((l: string) => console.log(l));
  const cfg = claudeConfig(deps);
  if ('skip' in cfg) {
    log(`llm ${label} provider=gemini reason=${cfg.skip}`);
    return gemini();
  }
  try {
    const text = await claudeCall(req, cfg.key, cfg.model, deps);
    let out: T;
    try {
      out = parse(text);
    } catch {
      throw new ClaudeUnavailableError(200, 'claude_bad_json');
    }
    log(`llm ${label} provider=claude model=${cfg.model} ok`);
    return out;
  } catch (err) {
    const why = err instanceof ClaudeUnavailableError ? `${err.code} ${err.status}` : 'claude_error';
    log(`llm ${label} provider=gemini fallback reason=${why}`);
    return gemini();
  }
}

const isJson = (o: GenerateOptions) => o.responseMimeType === 'application/json';
const systemFor = (o: GenerateOptions) =>
  [o.systemInstruction, isJson(o) ? JSON_ONLY : null].filter(Boolean).join('\n\n') || undefined;

/** Drop-in for gemini.generateText. A JSON request is validated before Claude's text is accepted. */
export function generateText(prompt: string, apiKey: string, options: GenerateOptions = {}, deps: LlmDeps = defaultDeps): Promise<string> {
  return withFallback(
    'text',
    { system: systemFor(options), turns: [{ role: 'user', text: prompt }], maxTokens: options.maxOutputTokens },
    deps,
    () => geminiText(prompt, apiKey, options, deps),
    (text) => (isJson(options) ? JSON.stringify(parseJsonFromModel(text)) : text),
  );
}

/** Drop-in for gemini.generateJson: Claude's answer must parse, else the Gemini path (its own two attempts). */
export function generateJson<T>(prompt: string, apiKey: string, options: GenerateOptions = {}, deps: LlmDeps = defaultDeps): Promise<T> {
  const opts = { responseMimeType: 'application/json', ...options };
  return withFallback<T>(
    'json',
    { system: systemFor(opts), turns: [{ role: 'user', text: prompt }], maxTokens: opts.maxOutputTokens },
    deps,
    () => geminiJson<T>(prompt, apiKey, options, deps),
    (text) => parseJsonFromModel<T>(text),
  );
}

/** The Messages API wants the conversation to open with the user and the roles to alternate; the
 *  stored chat history guarantees neither (a welcome bubble first, two user lines in a row). */
export function normalizeTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    if (!t.text.trim()) continue;
    if (out.length === 0 && t.role !== 'user') continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) prev.text = `${prev.text}\n\n${t.text}`;
    else out.push({ ...t });
  }
  return out;
}

/**
 * The chat: a multi-turn JSON answer. Returns JSON TEXT (re-serialised from the parsed Claude
 * answer, so the caller's JSON.parse sees no code fence), or whatever the Gemini SDK call returns.
 */
export function chatJson(system: string, turns: Turn[], gemini: () => Promise<string>, maxTokens: number, deps: LlmDeps = defaultDeps): Promise<string> {
  return withFallback('chat', { system: `${system}\n\n${JSON_ONLY}`, turns: normalizeTurns(turns), maxTokens }, deps, gemini, (text) =>
    JSON.stringify(parseJsonFromModel(text)),
  );
}

/** The OCR: one file + an extraction prompt, a JSON answer as text. A file type Claude cannot read goes to Gemini. */
export function extractJson(prompt: string, file: Attachment, gemini: () => Promise<string>, maxTokens: number, deps: LlmDeps = defaultDeps): Promise<string> {
  if (!claudeReadable(file.mimeType)) {
    (deps.log ?? ((l: string) => console.log(l)))(`llm ocr provider=gemini reason=unsupported_type ${file.mimeType}`);
    return gemini();
  }
  return withFallback('ocr', { system: JSON_ONLY, turns: [{ role: 'user', text: prompt }], attachment: file, maxTokens }, deps, gemini, (text) =>
    JSON.stringify(parseJsonFromModel(text)),
  );
}
