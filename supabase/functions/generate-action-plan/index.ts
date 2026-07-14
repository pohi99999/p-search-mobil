import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Supabase kliens példányosítása a bejelentkezett felhasználó JWT tokenjével
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Paraméterek beolvasása a kérésből
    const { business_profile_id, match_id, chat_history } = await req.json();

    if (!business_profile_id) {
      return new Response(
        JSON.stringify({ error: "business_profile_id megadása kötelező" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1. Megpróbáljuk lekérni a cég adatait
    const { data: businessData, error: businessError } = await supabaseClient
      .from("business_profiles")
      .select("*")
      .eq("id", business_profile_id)
      .single();

    if (businessError) throw businessError;

    // 2. Megpróbáljuk lekérni a pályázat (match) adatait, ha meg van adva
    let grantTitle = "Pályázati Felkészülési Terv";
    let grantData = null;
    if (match_id) {
      const { data: matchData, error: matchError } = await supabaseClient
        .from("grant_matches")
        .select("*, grants(*)")
        .eq("id", match_id)
        .single();

      if (matchError || !matchData) {
        return new Response(
          JSON.stringify({
            error: "A megadott pályázati egyezés nem található",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (matchData.business_profile_id !== business_profile_id) {
        return new Response(
          JSON.stringify({
            error:
              "Hozzáférés megtagadva (403): A megadott match_id nem tartozik ehhez a cégprofilhoz",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (matchData?.grants) {
        grantTitle = `${matchData.grants.title} - Felkészülési Terv`;
        grantData = matchData.grants;
      }
    }

    // 3. Generatív AI inicializálása
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY nincs beállítva");
    }
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 4. Prompt összeállítása
    const systemPrompt = `Te egy Professzionális Pályázati és Digitalizációs Szakértő Copilot vagy.
A feladatod egy strukturált, Markdown formátumú "Pályázati Akcióterv" generálása az alábbi adatok alapján.
Az akciótervnek tartalmaznia kell:
1. Célok (Goals)
2. Javasolt Pályázatok (Recommended Grants) - ha van konkrét pályázat, emeld ki
3. Következő Lépések (Next Steps) - konkrét, cselekvésre ösztönző feladatok

Cég adatai:
- Név: ${businessData?.company_name || "Ismeretlen"}
- Árbevétel: ${businessData?.yearly_revenue || "Ismeretlen"} Ft
- Létszám: ${businessData?.employee_count || "Ismeretlen"} fő

${grantData ? `Kiválasztott pályázat:\n- Cím: ${grantData.title}\n- Leírás: ${grantData.description}\n` : ""}

Eddigi beszélgetés előzményei (ha van):
${chat_history ? JSON.stringify(chat_history) : "Nincs előzmény"}

Kérlek, generáld le az akciótervet magyar nyelven, Markdown formátumban. Ne tegyél semmilyen egyéb szöveget a válaszba, csak a Markdownt.`;

    const result = await model.generateContent(systemPrompt);
    const generatedMarkdown = result.response.text();

    // 5. Új akcióterv (action_plan) rekord beszúrása
    const { data: newPlan, error: planError } = await supabaseClient
      .from("action_plans")
      .insert({
        business_profile_id,
        match_id: match_id || null,
        title: grantTitle,
        ai_context: {
          generated_by: "AI Edge Function",
          version: "1.1",
          markdown_plan: generatedMarkdown,
        },
      })
      .select()
      .single();

    if (planError) throw planError;

    // 6. Feladatok kinyerése a Markdownból és mentése action_tasks-ba
    // Egyszerű regex alapú kinyerés a Markdown listákból
    const taskRegex = /^[*-]\s+(.+)$/gm;
    let match;
    const extractedTasks = [];
    let orderIndex = 1;

    // Keresünk az "Következő Lépések" (vagy hasonló) szekcióban, de egyszerűség kedvéért minden listaelemből csinálunk egy taskot,
    // vagy ha túl sok van, akkor csak a mock taskokat adjuk.

    while ((match = taskRegex.exec(generatedMarkdown)) !== null) {
      if (extractedTasks.length < 5) {
        // Limitáljuk 5 feladatra
        extractedTasks.push({
          plan_id: newPlan.id,
          title: match[1].substring(0, 100), // Max 100 karakter
          description: `Automatikusan generált feladat az akciótervből: ${match[1]}`,
          status: "todo",
          order_index: orderIndex++,
        });
      }
    }

    const tasksToInsert =
      extractedTasks.length > 0
        ? extractedTasks
        : [
            {
              plan_id: newPlan.id,
              title: "Akcióterv áttekintése",
              description: "Olvasd el a generált akciótervet.",
              status: "todo",
              order_index: 1,
            },
          ];

    const { data: insertedTasks, error: tasksError } = await supabaseClient
      .from("action_tasks")
      .insert(tasksToInsert)
      .select();

    if (tasksError) throw tasksError;

    return new Response(
      JSON.stringify({
        message: "Akcióterv sikeresen legenerálva",
        plan: newPlan,
        tasks: insertedTasks,
        markdown: generatedMarkdown,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
