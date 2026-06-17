import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  console.log("Kérés megérkezett. Metódus:", req.method);
  
  // CORS preflight kérések kezelése
  if (req.method === 'OPTIONS') {
    console.log("OPTIONS preflight kérés lekezelve.");
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  try {
    console.log("Authorization fejléc ellenőrzése...");
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("Hiba: Nincs hitelesítési fejléc");
      return new Response(JSON.stringify({ error: 'Nincs hitelesítési fejléc' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("Supabase kliens inicializálása...");
    // Supabase kliens létrehozása a bejelentkezett felhasználó JWT tokenjével (RLS kontextus)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    console.log("Kérés törzsének (JSON) beolvasása...");
    // Kliens paraméterek beolvasása
    const requestData = await req.json()
    console.log("Beolvasott adatok:", JSON.stringify(requestData))
    
    const message = requestData.prompt || requestData.message || requestData.text || "";
    const history = requestData.history || [];
    const business_profile_id = requestData.business_profile_id || requestData.businessProfileId || null;
    const match_id = requestData.match_id || requestData.matchId || null;

    console.log(`Kinyert prompt/üzenet: "${message}"`);
    console.log(`Profil ID: ${business_profile_id}, Match ID: ${match_id}`);
    console.log(`Előzmények száma: ${history.length}`);

    if (!message) {
      console.error("Hiba: message/prompt paraméter hiányzik");
      return new Response(JSON.stringify({ error: 'message paraméter megadása kötelező' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Cégprofil adatainak lekérdezése (ha van ID)
    let companyContext = "";
    if (business_profile_id) {
      console.log(`Cégprofil lekérdezése az adatbázisból: ${business_profile_id}...`);
      const { data: profile, error: profileDbError } = await supabaseClient
        .from('business_profiles')
        .select('*')
        .eq('id', business_profile_id)
        .single();
      
      if (profileDbError) {
        console.warn("Nem sikerült lekérni a cégprofilt:", profileDbError);
      }
      
      if (profile) {
        companyContext = `Cégnév: ${profile.company_name}
TEÁOR kód (iparág): ${profile.industry_code || 'Nincs megadva'}
Alkalmazottak száma: ${profile.employee_count || 'Nincs megadva'}
Éves árbevétel: ${profile.yearly_revenue ? profile.yearly_revenue.toLocaleString('hu-HU') + ' Ft' : 'Nincs megadva'}
Cég céljai: ${profile.goals || 'Nincs megadva'}`;
        console.log("Cégprofil kontextus sikeresen felépítve.");
      }
    }

    // 2. Pályázat adatainak lekérdezése (ha van ID)
    let grantContext = "";
    if (match_id) {
      console.log(`Pályázati egyezés lekérdezése az adatbázisból: ${match_id}...`);
      const { data: match, error: matchDbError } = await supabaseClient
        .from('grant_matches')
        .select('*, grants(*)')
        .eq('id', match_id)
        .single();
      
      if (matchDbError) {
        console.warn("Nem sikerült lekérni a pályázati egyezést:", matchDbError);
      }
      
      if (match?.grants) {
        const g = match.grants;
        grantContext = `Pályázat címe: ${g.title}
Kiíró/Szolgáltató: ${g.provider || 'Nincs megadva'}
Típus: ${g.grant_type || 'Nincs megadva'}
Összeg: ${g.amount_min ? g.amount_min.toLocaleString('hu-HU') + ' Ft' : '0'} - ${g.amount_max ? g.amount_max.toLocaleString('hu-HU') + ' Ft' : '?'}
Határidő: ${g.deadline || 'Nincs megadva'}
Elfogadhatósági feltételek: ${g.eligibility_criteria || 'Nincs megadva'}
Leírás: ${g.description || 'Nincs megadva'}`;
        console.log("Pályázat kontextus sikeresen felépítve.");
      }
    }

    // 3. Feladatok lekérdezése a céghez az azonosítókkal a rendszerpromptba dúsításhoz
    let tasksContext = "";
    if (business_profile_id) {
      console.log("Aktív felkészülési feladatok lekérdezése...");
      const { data: plans, error: plansDbError } = await supabaseClient
        .from('action_plans')
        .select('id, title')
        .eq('business_profile_id', business_profile_id);
      
      if (plansDbError) {
        console.warn("Nem sikerült lekérni az akcióterveket:", plansDbError);
      }
      
      if (plans && plans.length > 0) {
        const planIds = plans.map(p => p.id);
        const { data: tasks, error: tasksDbError } = await supabaseClient
          .from('action_tasks')
          .select('id, title, status')
          .in('plan_id', planIds)
          .order('order_index', { ascending: true });
        
        if (tasksDbError) {
          console.warn("Nem sikerült lekérni az akciófeladatokat:", tasksDbError);
        }
        
        if (tasks && tasks.length > 0) {
          tasksContext = "Az adatbázisban szereplő aktív felkészülési feladatok és azonosítóik (UUID):\n";
          tasks.forEach(t => {
            tasksContext += `- Feladat: "${t.title}", Állapot: "${t.status}", Azonosító (ID): "${t.id}"\n`;
          });
          console.log(`Feladatok kontextus felépítve (${tasks.length} feladat).`);
        }
      }
    }

    console.log("Rendszerprompt összeállítása...");
    // 4. Rendszerprompt felépítése
    const systemPrompt = `Te a P-Search AI Pályázati Copilot asszisztense vagy. Segítesz a KKV cégeknek a pályázati felkészülésben.
Képes vagy a beszélgetés alapján frissíteni a cég adatait vagy lezárni a teendőket az adatbázisban.

${companyContext ? `Aktuális ügyfél (cég) adatai:\n${companyContext}\n` : ""}
${grantContext ? `Aktuálisan tárgyalt pályázat adatai:\n${grantContext}\n` : ""}
${tasksContext ? `Aktuális teendők listája az adatbázisban:\n${tasksContext}\n` : ""}

KÖTELEZŐ UTASÍTÁSOK:
1. A válaszodat KIZÁRÓLAG egy érvényes JSON formátumban adhatod vissza az alábbi kulcsokkal:
   - "reply": A felhasználónak küldött válasz szövege (magyarul, udvariasan, professzionálisan).
   - "profile_updates": Ha a beszélgetés során a felhasználó egyértelműen új vagy pontosabb cégadatot adott meg (pl. az árbevételt vagy az alkalmazottak számát), akkor töltsd ki ezt az objektumot a megfelelő értékekkel (kulcsok: "revenue" (szám), "employee_count" (szám)). Ha nem volt új adat, hagyd el a kulcsot vagy legyen null.
   - "task_updates": Ha a felhasználó jelezte, hogy egy feladatot elvégzett (pl. "ellenőriztem a pénzügyi adatokat" vagy "megvan a nyilatkozat"), keresd meg a fenti feladatlistából a hozzá tartozó feladatot, és a "completed_task_ids" tömbbe tedd bele annak UUID azonosítóját. Ha nem volt ilyen, a tömb legyen üres vagy a kulcs null.

Példa a kimenetre:
{
  "reply": "Szuper, rögzítettem a 10 milliós árbevételt és lezártam a pénzügyi adatok ellenőrzése feladatot!",
  "profile_updates": {
    "revenue": 10000000
  },
  "task_updates": {
    "completed_task_ids": ["feladat-uuid-1"]
  }
}`;

    console.log("Beszélgetési előzmények leképezése a Gemini formátumára...");
    // 5. Előzmények leképezése a Gemini API formátumára
    const geminiContents = [];
    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.id === 'welcome' || msg.id.startsWith('err-')) continue;
        
        const role = msg.sender === 'user' ? 'user' : 'model';
        geminiContents.push({
          role: role,
          parts: [{ text: msg.text }]
        });
      }
    }

    geminiContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    console.log("API kulcs ellenőrzése a környezeti változókban...");
    // 6. Gemini API hívása a hivatalos GoogleGenerativeAI SDK-val
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY környezeti változó nincs beállítva a Deno környezetben.');
    }

    console.log("Gemini SDK inicializálása és hívás indítása...");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000,
        responseMimeType: "application/json"
      }
    });

    const result = await model.generateContent({
      contents: geminiContents
    });

    console.log("Gemini hívás sikeresen lefutott.");
    const replyJSONText = result.response.text() || '{}';
    console.log("Gemini nyers JSON válasz:", replyJSONText);

    let reply = "Sajnálom, nem sikerült választ generálnom.";
    let databaseUpdated = false;

    // 7. A kapott JSON feldolgozása és Supabase UPDATE műveletek végrehajtása
    try {
      console.log("Gemini válasz JSON parsing indítása...");
      const parsedReply = JSON.parse(replyJSONText.trim());
      reply = parsedReply.reply || reply;

      // 7.1. Cégprofil frissítése, ha van profile_updates
      if (parsedReply.profile_updates && business_profile_id) {
        const updates: Record<string, any> = {};
        if (typeof parsedReply.profile_updates.revenue === 'number') {
          updates.yearly_revenue = parsedReply.profile_updates.revenue;
        }
        if (typeof parsedReply.profile_updates.employee_count === 'number') {
          updates.employee_count = parsedReply.profile_updates.employee_count;
        }

        if (Object.keys(updates).length > 0) {
          console.log("Cégprofil frissítése az adatbázisban a következő értékekkel:", JSON.stringify(updates));
          const { error: profileError } = await supabaseClient
            .from('business_profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', business_profile_id);

          if (!profileError) {
            databaseUpdated = true;
            console.log("Cégprofil sikeresen frissítve az adatbázisban.");
          } else {
            console.error('Hiba a cégprofil frissítésekor az Edge Functionben:', profileError);
          }
        }
      }

      // 7.2. Feladatok státuszának frissítése 'done'-ra, ha van completed_task_ids
      if (parsedReply.task_updates && Array.isArray(parsedReply.task_updates.completed_task_ids) && parsedReply.task_updates.completed_task_ids.length > 0) {
        console.log("Feladatok státuszának frissítése 'done'-ra a következő ID-kkal:", JSON.stringify(parsedReply.task_updates.completed_task_ids));
        const { error: taskError } = await supabaseClient
          .from('action_tasks')
          .update({ status: 'done', updated_at: new Date().toISOString() })
          .in('id', parsedReply.task_updates.completed_task_ids);

        if (!taskError) {
          databaseUpdated = true;
          console.log("Feladatok státusza sikeresen frissítve.");
        } else {
          console.error('Hiba a feladatok frissítésekor az Edge Functionben:', taskError);
        }
      }

    } catch (parseErr) {
      console.error('Hiba a Gemini JSON válasz feldolgozásakor:', parseErr, replyJSONText);
      // Fallback: Ha mégsem JSON jött vissza, a teljes szöveget küldjük el válaszként
      reply = replyJSONText;
    }

    console.log("Kérés kiszolgálása sikeres. Küldött válasz:", reply);
    return new Response(
      JSON.stringify({ 
        reply: reply,
        database_updated: databaseUpdated 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (err: any) {
    console.error("Végzetes hiba az Edge Function futása során:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Ismeretlen hiba történt a szerveren." }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
