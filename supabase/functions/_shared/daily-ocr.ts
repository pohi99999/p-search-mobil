// P-Search kör 2, Kenshin P1-5 (Péter 12036, "Igen, napi 3 mindenkinek"): the daily cap on the financial-statement
// OCR (process-master-document), 3 a day per user, Pro and free alike. The check-reset-increment is atomic in
// consume_daily_ocr (supabase/migrations/20261030150000_daily_ocr_cap.sql); this decides the answer.

// deno-lint-ignore no-explicit-any
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => any };

export const DAILY_OCR_CAP = 3;
export const OCR_DAILY_LIMIT_CODE = 'ocr_daily_limit';

export type OcrGate =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; body: { success: false; error: string; code?: string } };

/** Consumes one OCR of today's cap. Call it before the paid vision call; the service-role client (EXECUTE grant). */
export async function consumeDailyOcr(client: RpcClient, userId: string, cap: number = DAILY_OCR_CAP): Promise<OcrGate> {
  const { data, error } = await client.rpc('consume_daily_ocr', { p_user: userId, p_cap: cap });
  if (error) {
    console.error('consume_daily_ocr hiba:', error.message);
    return { allowed: false, status: 503, body: { success: false, error: 'A dokumentumfeldolgozás átmenetileg nem elérhető, próbáld újra később.' } };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.allowed !== true) {
    return {
      allowed: false,
      status: 429,
      body: {
        success: false,
        error: `Mára elérted a dokumentumfeltöltések keretét (napi ${cap}). Holnap újra feltölthetsz.`,
        code: OCR_DAILY_LIMIT_CODE,
      },
    };
  }
  return { allowed: true };
}
