import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSubscriptionTier, isPro } from "../_shared/entitlement.ts";
import { companyContext as buildCompanyContext, grantContext as buildGrantContext, NO_MISSING_DATA_RULE } from "../_shared/company-context.ts";
import { documentErrorResponse, generateSections } from "./generation.ts";
import { huThousands } from "../_shared/hu-numbers.ts";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};


function escapeHtml(unsafe: string): string {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

serve(async (req) => {
  // CORS preflight kérések kezelése
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Nincs hitelesítési fejléc" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Supabase kliens létrehozása (RLS támogatás a bejelentkezett felhasználó JWT tokenjével)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Paraméterek beolvasása a kérésből
    const { business_profile_id, match_id } = await req.json();

    if (!business_profile_id || !match_id) {
      return new Response(
        JSON.stringify({
          error: "business_profile_id és match_id megadása kötelező",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 0. Felhasználó azonosítása
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Érvénytelen vagy lejárt hitelesítési token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pro-kapu (owner döntés 2026-09-12): a dokumentum-generálás a Pro csomag része.
    const tier = await getSubscriptionTier(supabaseClient, userData.user.id);
    if (!isPro(tier)) {
      return new Response(
        JSON.stringify({ error: "A dokumentum-generálás a Pro csomag része. Válts Pro-ra a használatához.", code: "pro_required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Cégprofil és Pályázat lekérdezése párhuzamosan
    const [
      { data: profile, error: profileError },
      { data: match, error: matchError },
    ] = await Promise.all([
      supabaseClient
        .from("business_profiles")
        .select("*")
        .eq("id", business_profile_id)
        .single(),
      supabaseClient
        .from("grant_matches")
        .select("*, grants(*)")
        .eq("id", match_id)
        .single(),
    ]);

    if (profileError) throw profileError;
    if (matchError) throw matchError;

    // Jogosultság ellenőrzése: Csak a saját cégprofilhoz generálhat dokumentumot
    if (profile.user_id !== userData.user.id) {
      return new Response(
        JSON.stringify({ error: "Nincs jogosultság a megadott cégprofilhoz" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only the filled fields reach the prompt (card 431a496e): no "Nincs megadva" for the model to repeat.
    const companyName = profile.company_name;
    const grantTitle = match.grants?.title || "Kiválasztott Pályázat";
    const companyContext = buildCompanyContext(profile);
    const grantContext = buildGrantContext(match.grants);

    // 3. Gemini Prompt összeállítása a tartalmi blokkokhoz
    const systemPrompt = `Te egy professzionális pályázatíró AI asszisztens vagy.
A megadott cégprofil és pályázati adatok alapján készíts el egy Üzleti Terv Vázlatot a pályázati felkészüléshez.

Kimeneti formátum: KIZÁRÓLAG egy érvényes JSON formátumot adhatsz vissza, az alábbi kulcsokkal:
- "executive_summary": Vezetői összefoglaló, a projekt célja és a pályázati támogatás felhasználása (magyarul, kb. 150 szó).
- "market_analysis": Piacelemzés, célcsoport és versenyelőny bemutatása a TEÁOR kód és cégprofil alapján (magyarul, kb. 150-200 szó).
- "financial_plan": Pénzügyi terv vázlat, a támogatási összeg elosztása és a várható megtérülés a cégbevétele alapján (magyarul, kb. 150 szó).

Adatok a generáláshoz:
Cégadatok:
${companyContext}

Pályázati adatok:
${grantContext}

${NO_MISSING_DATA_RULE}`;

    // 4. Gemini (REST, _shared/gemini.ts): one retry on 429/503 and on a cut-off or broken JSON answer,
    // thinking off and a 4096-token cap (DOCUMENT_GENERATION); the finishReason is logged on failure.
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY környezeti változó hiányzik a szerveren.",
      );
    }

    const parsedData = await generateSections(
      "Kérlek, generáld le a pályázathoz illeszkedő üzleti terv vázlatot a megadott adatok alapján.",
      apiKey,
      systemPrompt,
    );

    const executiveSummary = huThousands(parsedData.executive_summary || "Nincs kitöltve.");
    const marketAnalysis = huThousands(parsedData.market_analysis || "Nincs kitöltve.");
    // "50.000.000 Ft" -> "50 000 000 Ft" in the model text (card a96dd8e2 #14)
    const financialPlan = huThousands(parsedData.financial_plan || "Nincs kitöltve.");

    // 5. HTML Sablon összeállítása CSS stílusokkal és az adatok behelyettesítésével
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #333333;
      line-height: 1.6;
      padding: 40px;
      background-color: #ffffff;
    }
    .header {
      border-bottom: 3px solid #1A237E;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h1 {
      color: #1A237E;
      font-size: 26px;
      margin: 0 0 10px 0;
      font-weight: 700;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      font-size: 13px;
    }
    .meta-table td {
      padding: 8px 0;
      border-bottom: 1px solid #E0E0E0;
    }
    .meta-label {
      font-weight: bold;
      color: #5C6BC0;
      width: 30%;
    }
    h2 {
      color: #1A237E;
      font-size: 18px;
      border-bottom: 1px solid #E0E0E0;
      padding-bottom: 6px;
      margin-top: 30px;
      font-weight: 600;
    }
    p {
      font-size: 14px;
      text-align: justify;
    }
    .footer {
      margin-top: 60px;
      padding-top: 15px;
      border-top: 1px solid #E0E0E0;
      font-size: 11px;
      color: #9E9E9E;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Pályázati Felkészülési Üzleti Terv</h1>
    <p style="margin: 0; color: #757575; font-size: 14px;">AI által generált előkészítő dokumentum</p>
  </div>

  <table class="meta-table">
    <tr>
      <td class="meta-label">Pályázó Szervezet:</td>
      <td><strong>${escapeHtml(companyName)}</strong></td>
    </tr>
    <tr>
      <td class="meta-label">Célzott Pályázat:</td>
      <td>${escapeHtml(grantTitle)}</td>
    </tr>
    <tr>
      <td class="meta-label">Dátum:</td>
      <td>${escapeHtml(String(new Date().toLocaleDateString("hu-HU")))}</td>
    </tr>
  </table>

  <h2>1. Vezetői Összefoglaló (Executive Summary)</h2>
  <p>${escapeHtml(executiveSummary)}</p>

  <h2>2. Piacelemzés és Versenyelőny (Market Analysis)</h2>
  <p>${escapeHtml(marketAnalysis)}</p>

  <h2>3. Pénzügyi Terv és Megtérülés (Financial Plan)</h2>
  <p>${escapeHtml(financialPlan)}</p>

  <div class="footer">
    Ez a dokumentum a P-Search Mobil Alkalmazás és a Gemini AI segítségével készült.<br/>
    &copy; ${new Date().getFullYear()} P-Search Mobil. Minden jog fenntartva.
  </div>
</body>
</html>
    `.trim();

    // 6. Elmentjük a generált HTML-t az akcióterv ai_context mezőjébe a tárhelykímélő kezeléshez
    const { data: planData } = await supabaseClient
      .from("action_plans")
      .select("id, ai_context")
      .eq("business_profile_id", business_profile_id)
      .eq("match_id", match_id)
      .maybeSingle();

    if (planData?.id) {
      const existingContext = planData.ai_context || {};
      const updatedContext = {
        ...existingContext,
        generated_document_html: htmlContent,
      };

      const { error: updatePlanError } = await supabaseClient
        .from("action_plans")
        .update({
          ai_context: updatedContext,
          updated_at: new Date().toISOString(),
        })
        .eq("id", planData.id);

      if (updatePlanError) {
        console.error(
          "Hiba az akcióterv ai_context frissítésekor:",
          updatePlanError,
        );
      }
    }

    return new Response(JSON.stringify({ html: htmlContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    // Full detail stays in the server log; the client receives a generic
    // message so internal identifiers and provider errors are not disclosed.
    console.error("Hiba a dokumentum generálása során:", err);
    // Gemini quota/busy/cut-off answers get their code and Hungarian text, anything else stays generic.
    return documentErrorResponse(err, corsHeaders);
  }
});
