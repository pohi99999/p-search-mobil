import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight kérések kezelése
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nincs hitelesítési fejléc' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Supabase kliens létrehozása (RLS támogatás a bejelentkezett felhasználó JWT tokenjével)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Paraméterek beolvasása a kérésből
    const { business_profile_id, match_id, document_type } = await req.json()

    if (!business_profile_id || !match_id) {
      return new Response(JSON.stringify({ error: 'business_profile_id és match_id megadása kötelező' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Cégprofil lekérdezése
    const { data: profile, error: profileError } = await supabaseClient
      .from('business_profiles')
      .select('*')
      .eq('id', business_profile_id)
      .single();

    if (profileError) throw profileError;

    // 2. Pályázat lekérdezése
    const { data: match, error: matchError } = await supabaseClient
      .from('grant_matches')
      .select('*, grants(*)')
      .eq('id', match_id)
      .single();

    if (matchError) throw matchError;

    const companyName = profile.company_name;
    const grantTitle = match.grants?.title || 'Kiválasztott Pályázat';

    const companyContext = `Cégnév: ${companyName}
TEÁOR kód (iparág): ${profile.industry_code || 'Nincs megadva'}
Alkalmazottak száma: ${profile.employee_count || 'Nincs megadva'}
Éves árbevétel: ${profile.yearly_revenue ? profile.yearly_revenue.toLocaleString('hu-HU') + ' Ft' : 'Nincs megadva'}
Cég céljai: ${profile.goals || 'Nincs megadva'}`;

    const grantContext = `Pályázat címe: ${grantTitle}
Kiíró: ${match.grants?.provider || 'Nincs megadva'}
Támogatás összege: ${match.grants?.amount_min ? match.grants.amount_min.toLocaleString('hu-HU') + ' Ft' : '0'} - ${match.grants?.amount_max ? match.grants.amount_max.toLocaleString('hu-HU') + ' Ft' : '?'}
Kritériumok: ${match.grants?.eligibility_criteria || 'Nincs megadva'}
Pályázat leírása: ${match.grants?.description || 'Nincs megadva'}`;

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
${grantContext}`;

    // 4. Gemini API hívása (REST)
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY környezeti változó hiányzik a szerveren.');
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Kérlek, generáld le a pályázathoz illeszkedő üzleti terv vázlatot a megadott adatok alapján.' }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1500,
          responseMimeType: "application/json"
        }
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Gemini API hiba (${apiResponse.status}): ${errorText}`);
    }

    const responseData = await apiResponse.json();
    const replyJSONText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Parse-oljuk a Gemini JSON kimenetét
    const parsedData = JSON.parse(replyJSONText.trim());

    const executiveSummary = parsedData.executive_summary || 'Nincs kitöltve.';
    const marketAnalysis = parsedData.market_analysis || 'Nincs kitöltve.';
    const financialPlan = parsedData.financial_plan || 'Nincs kitöltve.';

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
      <td><strong>${companyName}</strong></td>
    </tr>
    <tr>
      <td class="meta-label">Célzott Pályázat:</td>
      <td>${grantTitle}</td>
    </tr>
    <tr>
      <td class="meta-label">Dátum:</td>
      <td>${new Date().toLocaleDateString('hu-HU')}</td>
    </tr>
  </table>

  <h2>1. Vezetői Összefoglaló (Executive Summary)</h2>
  <p>${executiveSummary}</p>

  <h2>2. Piacelemzés és Versenyelőny (Market Analysis)</h2>
  <p>${marketAnalysis}</p>

  <h2>3. Pénzügyi Terv és Megtérülés (Financial Plan)</h2>
  <p>${financialPlan}</p>

  <div class="footer">
    Ez a dokumentum a P-Search Mobil Alkalmazás és a Gemini AI segítségével készült.<br/>
    &copy; ${new Date().getFullYear()} P-Search Mobil. Minden jog fenntartva.
  </div>
</body>
</html>
    `.trim();

    return new Response(
      JSON.stringify({ html: htmlContent }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
