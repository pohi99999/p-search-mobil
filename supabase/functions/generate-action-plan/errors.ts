// The HTTP answer for a failed action-plan run. Gemini 429/503 (after the one retry in _shared/gemini.ts, on the
// Gemini path behind Claude) get their code and Hungarian text; anything else is a generic 500. The raw error text
// (it used to be Google's "[GoogleGenerativeAI Error] ...") stays in the server log, never in the answer.
import { GeminiUnavailableError, geminiUnavailableResponse } from '../_shared/gemini.ts';

export const ACTION_PLAN_GENERIC_ERROR = 'Nem sikerült elkészíteni az akciótervet, próbáld újra később.';

export function actionPlanErrorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof GeminiUnavailableError) {
    return geminiUnavailableResponse(err, headers);
  }
  console.error('Akcióterv-generálás hiba:', err);
  return new Response(JSON.stringify({ error: ACTION_PLAN_GENERIC_ERROR }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
    status: 500,
  });
}
