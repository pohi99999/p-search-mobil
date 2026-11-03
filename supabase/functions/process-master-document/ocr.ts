// The OCR answer of a financial statement, read and logged without its content (P-Search kör 2, Kenshin P1-4).
// Until 2026-10-30 the function logged the whole OCR text ("Gemini OCR nyers válasz") and the extracted figures
// ("Kinyert pénzügyi adatok"), and a parse error carried the first 200 characters of the text in its message,
// which went to the log too. A financial statement is the most sensitive data the app holds: the log keeps its
// shape (sizes, field names), never its characters. Plain TypeScript, no Deno API.
import { describeRequestData, describeText } from '../_shared/request-log.ts';

/** The extracted figures, or an error whose message names only the text's size. */
export function parseOcrJson(raw: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(String(raw ?? '').trim());
  } catch {
    throw new Error(`A Gemini nem adott vissza érvényes JSON-t (${describeText(raw)}).`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`A Gemini válasza nem JSON-objektum (${describeText(raw)}).`);
  }
  return value as Record<string, unknown>;
}

/** The log line for the OCR answer: its size only. */
export function ocrAnswerLog(raw: string): string {
  return `Gemini OCR válasz megérkezett: ${describeText(raw)}`;
}

/** The log line for the extracted figures: field names and kinds, no value. */
export function extractedLog(extracted: Record<string, unknown>): string {
  return `Kinyert pénzügyi mezők: ${describeRequestData(extracted)}`;
}
