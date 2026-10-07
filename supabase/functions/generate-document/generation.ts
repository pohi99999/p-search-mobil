// The Gemini settings and the error answers of generate-document, kept apart from the request
// handler so they can be tested (card 6c7049fa #12, 2026-10-07).
import { GeminiOutputError, GeminiUnavailableError, geminiUnavailableResponse, type GenerateOptions } from "../_shared/gemini.ts";

// Three Hungarian sections of 150-200 words need well over 1500 tokens, and on gemini-2.5-flash the
// thinking tokens counted against the old 1500 cap too: the JSON was cut off at character 124.
// Thinking off, a cap with room to spare.
export const DOCUMENT_GENERATION: Required<Pick<GenerateOptions, "temperature" | "maxOutputTokens" | "thinkingBudget" | "responseMimeType">> = {
  temperature: 0.4,
  maxOutputTokens: 4096,
  thinkingBudget: 0,
  responseMimeType: "application/json",
};

/** The client answer for a failed generation: Gemini errors with their code and Hungarian text, anything else a generic 500. */
export function documentErrorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof GeminiUnavailableError) return geminiUnavailableResponse(err, headers);
  if (err instanceof GeminiOutputError) {
    return new Response(JSON.stringify({ code: err.code, error: err.message }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: "Nem sikerült legenerálni a dokumentumot." }), {
    status: 500,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
