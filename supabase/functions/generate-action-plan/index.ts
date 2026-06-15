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

    // Supabase kliens példányosítása a bejelentkezett felhasználó JWT tokenjével
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Paraméterek beolvasása a kérésből
    const { business_profile_id, match_id } = await req.json()

    if (!business_profile_id) {
      return new Response(JSON.stringify({ error: 'business_profile_id megadása kötelező' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Megpróbáljuk lekérni a pályázat (match) nevét, ha meg van adva
    let grantTitle = 'Pályázati Felkészülési Terv';
    if (match_id) {
      const { data: matchData } = await supabaseClient
        .from('grant_matches')
        .select('*, grants(*)')
        .eq('id', match_id)
        .single();
      
      if (matchData?.grants?.title) {
        grantTitle = `${matchData.grants.title} - Felkészülési Terv`;
      }
    }

    // 2. Új akcióterv (action_plan) rekord beszúrása
    const { data: newPlan, error: planError } = await supabaseClient
      .from('action_plans')
      .insert({
        business_profile_id,
        match_id: match_id || null,
        title: grantTitle,
        ai_context: { generated_by: 'AI Edge Function', version: '1.0' }
      })
      .select()
      .single();

    if (planError) throw planError;

    // 3. Alapértelmezett feladatok (action_tasks) generálása
    const mockTasks = [
      {
        plan_id: newPlan.id,
        title: 'Pénzügyi adatok ellenőrzése',
        description: 'Ellenőrizni kell a legutóbbi lezárt üzleti év árbevételét és mérlegét az alkalmasság megerősítéséhez.',
        status: 'todo',
        order_index: 1
      },
      {
        plan_id: newPlan.id,
        title: 'Üzleti terv sablon letöltése',
        description: 'Töltsd le a hivatalos üzleti terv sablont, és kezdd el a cégadatok beírását a korábbi beszélgetések alapján.',
        status: 'todo',
        order_index: 2
      },
      {
        plan_id: newPlan.id,
        title: 'Nyilatkozatok aláírása és összegyűjtése',
        description: 'A de minimis támogatásokról és köztartozásmentességről szóló nyilatkozatok kitöltése és aláírása.',
        status: 'todo',
        order_index: 3
      }
    ];

    const { data: insertedTasks, error: tasksError } = await supabaseClient
      .from('action_tasks')
      .insert(mockTasks)
      .select();

    if (tasksError) throw tasksError;

    return new Response(
      JSON.stringify({ 
        message: 'Akcióterv sikeresen legenerálva', 
        plan: newPlan, 
        tasks: insertedTasks 
      }),
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
