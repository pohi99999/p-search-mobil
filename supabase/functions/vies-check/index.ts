import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// vies-check: looks up a Hungarian tax number in the EU VIES register and
// returns the registered name/address so the onboarding form can be
// pre-filled (kanban eeac42d8, B2/3). Read-only, best-effort: a miss or a
// VIES outage never blocks registration -- the client just gets found:false.
//
// Measured 2026-09-23: VIES REST answers in 0.1-0.4 s; HU10773381 -> valid
// with name+address, HU12345678 -> valid:false with '---' placeholders.
// VIES knows the FIRST 8 digits of the Hungarian tax number (HU + 8 digits);
// the "-2-44" suffix is not part of the VAT id.

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

export type CreateClientFn = typeof createClient;
export type FetchFn = typeof fetch;

/** "12345678-2-44", "HU 12345678", "12 345 678" -> "12345678"; null when not 8 digits. */
export function normalizeHuTaxNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/^\s*HU/i, "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(0, 8);
}

export type ViesResult = { found: boolean; vat: string | null; name: string | null; address: string | null; reason?: string };

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t !== "---" ? t : null;
};

export async function lookupVies(vat8: string, fetchFn: FetchFn): Promise<ViesResult> {
  const res = await fetchFn(VIES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Mozilla/5.0 (P-Search vies-check)" },
    body: JSON.stringify({ countryCode: "HU", vatNumber: vat8 }),
  });
  if (!res.ok) return { found: false, vat: "HU" + vat8, name: null, address: null, reason: `vies_${res.status}` };
  const data = await res.json();
  if (data?.valid !== true) return { found: false, vat: "HU" + vat8, name: null, address: null, reason: data?.userError || "invalid" };
  return { found: true, vat: "HU" + vat8, name: clean(data.name), address: clean(data.address) };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export async function handler(
  req: Request,
  deps: { createClient: CreateClientFn; fetch: FetchFn } = { createClient, fetch },
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Csak POST" });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Nincs hitelesítési fejléc" });
    const client = deps.createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json(401, { error: "Érvénytelen token" });

    let body: { tax_number?: unknown } = {};
    try { body = await req.json(); } catch { body = {}; }
    const vat8 = normalizeHuTaxNumber(body.tax_number);
    if (!vat8) return json(400, { error: "Az adószám első 8 számjegye kell" });

    try {
      return json(200, await lookupVies(vat8, deps.fetch));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`vies-check: VIES nem érhető el (${msg})`);
      return json(200, { found: false, vat: "HU" + vat8, name: null, address: null, reason: "unreachable" });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("vies-check hiba:", message);
    return json(500, { error: message });
  }
}

if (import.meta.main) {
  serve((req) => handler(req));
}
