import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.1.3';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // CORS preflight kérések kezelése
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nincs hitelesítési fejléc' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Supabase kliens példányosítása a bejelentkezett felhasználó JWT tokenjével
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    // Paraméterek beolvasása a kérésből
    const { business_profile_id, match_id, match_ids, chat_history } = await req.json();

    if (!business_profile_id) {
      return new Response(JSON.stringify({ error: 'business_profile_id megadása kötelező' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const matchesToProcess = match_ids || (match_id ? [match_id] : []);

    // 1 & 2. Párhuzamosan megpróbáljuk lekérni a cég és a pályázatok adatait
    const businessPromise = supabaseClient
      .from('business_profiles')
      .select('*')
      .eq('id', business_profile_id)
      .single();

    const matchesPromise = matchesToProcess.length > 0
      ? supabaseClient
          .from('grant_matches')
          .select('*, grants(*)')
          .in('id', matchesToProcess)
      : Promise.resolve({ data: [], error: null });

    const [businessResult, matchesResult] = await Promise.all([
      businessPromise,
      matchesPromise,
    ]);

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: businessData, error: businessError } = businessResult;
    if (businessError) throw businessError;

    if (businessData.user_id !== user.id) {
      return new Response(
        JSON.stringify({
          error: 'Hozzáférés megtagadva (403): Nem te vagy a cégprofil tulajdonosa',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Ellenőrizzük a pályázatokat
    if (matchesToProcess.length > 0) {
      const { data: matchesData, error: matchError } = matchesResult;
      if (matchError || !matchesData || matchesData.length === 0) {
        return new Response(
          JSON.stringify({
            error: 'A megadott pályázati egyezés(ek) nem található(k)',
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Ellenőrizzük a hozzáférést
      for (const match of matchesData) {
        if (match.business_profile_id !== business_profile_id) {
          return new Response(
            JSON.stringify({
              error:
                'Hozzáférés megtagadva (403): Egy vagy több match_id nem tartozik ehhez a cégprofilhoz',
            }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }
    }

    const matchesData = matchesResult.data || [];

    // 3. Generatív AI inicializálása
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY nincs beállítva');
    }
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Handle generic plan (no match provided)
    if (matchesData.length === 0) {
      matchesData.push(null);
    }

    // 4. Gemini hívások párhuzamosan (batch AI generation)
    const aiResults = await Promise.all(
      matchesData.map(async (matchItem: any) => {
        let grantTitle = "Pályázati Felkészülési Terv";
        let grantData = null;

        if (matchItem?.grants) {
          grantTitle = `${matchItem.grants.title} - Felkészülési Terv`;
          grantData = matchItem.grants;
        }

        const systemPrompt = `Te egy Professzionális Pályázati és Digitalizációs Szakértő Copilot vagy.
A feladatod egy strukturált, Markdown formátumú "Pályázati Akcióterv" generálása az alábbi adatok alapján.
Az akciótervnek tartalmaznia kell:
1. Célok (Goals)
2. Javasolt Pályázatok (Recommended Grants) - ha van konkrét pályázat, emeld ki
3. Következő Lépések (Next Steps) - konkrét, cselekvésre ösztönző feladatok

Cég adatai:
- Név: ${businessData?.company_name || 'Ismeretlen'}
- Árbevétel: ${businessData?.yearly_revenue || 'Ismeretlen'} Ft
- Létszám: ${businessData?.employee_count || 'Ismeretlen'} fő

${grantData ? `Kiválasztott pályázat:\n- Cím: ${grantData.title}\n- Leírás: ${grantData.description}\n` : ''}

Eddigi beszélgetés előzményei (ha van):
${chat_history ? JSON.stringify(chat_history) : 'Nincs előzmény'}

Kérlek, generáld le az akciótervet magyar nyelven, Markdown formátumban. Ne tegyél semmilyen egyéb szöveget a válaszba, csak a Markdownt.`;

        const result = await model.generateContent(systemPrompt);
        const generatedMarkdown = result.response.text();

        return {
          match_id: matchItem?.id || null,
          title: grantTitle,
          markdown: generatedMarkdown,
        };
      })
    );

    // 5. Akcióterv (action_plan) rekordok beszúrása bulk formában
    const plansToInsert = aiResults.map((res) => ({
      business_profile_id,
      match_id: res.match_id,
      title: res.title,
      ai_context: {
        generated_by: "AI Edge Function",
        version: "1.1",
        markdown_plan: res.markdown,
      },
    }));

    const { data: insertedPlans, error: plansError } = await supabaseClient
      .from("action_plans")
      .insert(plansToInsert)
      .select();

    if (plansError) throw plansError;

    // 6. Feladatok kinyerése a Markdownból és bulk mentése action_tasks-ba
    const allTasksToInsert: any[] = [];

    for (let i = 0; i < aiResults.length; i++) {
      const res = aiResults[i];
      const plan = insertedPlans[i];

      const taskRegex = /^[*-]\s+(.+)$/gm;
      let regexMatch;
      const extractedTasks = [];
      let orderIndex = 1;

      while ((regexMatch = taskRegex.exec(res.markdown)) !== null) {
        if (extractedTasks.length < 5) {
          extractedTasks.push({
            plan_id: plan.id,
            title: regexMatch[1].substring(0, 100),
            description: `Automatikusan generált feladat az akciótervből: ${res.match_id}`,
            status: 'todo',
            order_index: orderIndex++,
          });
        }
      }

      if (extractedTasks.length > 0) {
        allTasksToInsert.push(...extractedTasks);
      } else {
        allTasksToInsert.push({
          plan_id: plan.id,
          title: 'Akcióterv áttekintése',
          description: 'Olvasd el a generált akciótervet.',
          status: 'todo',
          order_index: 1,
        });
      }
    }

    const { data: insertedTasks, error: tasksError } = await supabaseClient
      .from('action_tasks')
      .insert(allTasksToInsert)
      .select();

    if (tasksError) throw tasksError;

    return new Response(
      JSON.stringify({
        message: 'Akcióterv(ek) sikeresen legenerálva',
        plans: insertedPlans,
        tasks: insertedTasks,
        // Ha csak 1 generálódott (kompatibilitás), visszatérünk sima "plan"-nel is
        plan: insertedPlans[0],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
