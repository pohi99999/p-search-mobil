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

    // Supabase kliens létrehozása a bejelentkezett felhasználó JWT tokenjével (RLS kontextus)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Kliens paraméterek beolvasása
    const { message, history, business_profile_id, match_id } = await req.json()

    if (!message) {
      return new Response(JSON.stringify({ error: 'message paraméter megadása kötelező' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Cégprofil adatainak lekérdezése (ha van ID)
    let companyContext = "";
    if (business_profile_id) {
      const { data: profile } = await supabaseClient
        .from('business_profiles')
        .select('*')
        .eq('id', business_profile_id)
        .single();
      
      if (profile) {
        companyContext = `Cégnév: ${profile.company_name}
TEÁOR kód (iparág): ${profile.industry_code || 'Nincs megadva'}
Alkalmazottak száma: ${profile.employee_count || 'Nincs megadva'}
Éves árbevétel: ${profile.yearly_revenue ? profile.yearly_revenue.toLocaleString('hu-HU') + ' Ft' : 'Nincs megadva'}
Cég céljai: ${profile.goals || 'Nincs megadva'}`;
      }
    }

    // 2. Pályázat adatainak lekérdezése (ha van ID)
    let grantContext = "";
    if (match_id) {
      const { data: match } = await supabaseClient
        .from('grant_matches')
        .select('*, grants(*)')
        .eq('id', match_id)
        .single();
      
      if (match?.grants) {
        const g = match.grants;
        grantContext = `Pályázat címe: ${g.title}
Kiíró/Szolgáltató: ${g.provider || 'Nincs megadva'}
Típus: ${g.grant_type || 'Nincs megadva'}
Összeg: ${g.amount_min ? g.amount_min.toLocaleString('hu-HU') + ' Ft' : '0'} - ${g.amount_max ? g.amount_max.toLocaleString('hu-HU') + ' Ft' : '?'}
Határidő: ${g.deadline || 'Nincs megadva'}
Elfogadhatósági feltételek: ${g.eligibility_criteria || 'Nincs megadva'}
Leírás: ${g.description || 'Nincs megadva'}`;
      }
    }

    // 3. Rendszerprompt felépítése
    const systemPrompt = `Te a P-Search AI Pályázati Copilot asszisztense vagy, egy intelligens, professzionális és segítőkész tanácsadó.
Segítesz a KKV cégeknek megérteni a pályázatokat, felkészülni a benyújtásra és pontosítani a szükséges információkat.

${companyContext ? `Aktuális ügyfél (cég) adatai:\n${companyContext}\n` : ""}
${grantContext ? `Aktuálisan tárgyalt pályázat adatai:\n${grantContext}\n` : ""}

Irányelvek:
- Mindig maradj professzionális, precíz és udvarias.
- Adj lényegretörő, pontos válaszokat a fenti cég- és pályázati adatok alapján.
- Válaszolj magyarul.
- Ha a felhasználó a felkészülés lépéseiről kérdez, hivatkozz az akciótervre (Action Plan).
- Ha nem tudod a választ vagy az adatok hiányoznak, kérdezz rá udvariasan.`;

    // 4. Előzmények leképezése a Gemini API formátumára
    const geminiContents = [];
    if (history && Array.isArray(history)) {
      // Csak az utolsó 10 üzenetet küldjük a kontextus méretének kordában tartására
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        // A welcome üzenetet és a hibákat kiszűrjük a történetből a tisztaság kedvéért
        if (msg.id === 'welcome' || msg.id.startsWith('err-')) continue;
        
        const role = msg.sender === 'user' ? 'user' : 'model';
        geminiContents.push({
          role: role,
          parts: [{ text: msg.text }]
        });
      }
    }

    // Aktuális üzenet hozzáfűzése
    geminiContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // 5. Gemini API hívása (REST)
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY környezeti változó nincs beállítva a backendben.');
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: geminiContents,
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        }
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Gemini API error (${apiResponse.status}): ${errorText}`);
    }

    const responseData = await apiResponse.json();
    const replyText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sajnálom, nem sikerült választ generálnom.';

    return new Response(
      JSON.stringify({ reply: replyText }),
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
