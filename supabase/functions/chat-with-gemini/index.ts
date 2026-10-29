import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';
import { chatJson, type Turn } from '../_shared/llm.ts';
import {
  describeRequestData,
  describeText,
  describeJsonText,
  describeParseError,
} from '../_shared/request-log.ts';
import { validateChatInput } from '../_shared/input-limits.ts';
import { consumeDailyChat } from '../_shared/daily-chat.ts';
import { refundDailyChat } from '../_shared/daily-search-refund.ts';
import { openGrantCutoffIso } from '../_shared/matching.ts';
import { companyContext as buildCompanyContext, type CompanyFields } from '../_shared/company-context.ts';
import { chatProfileDecision, chatProfileId } from '../_shared/chat-profile.ts';
import { matchOwnership } from '../_shared/match-ownership.ts';
import { generateEmbedding } from '../_shared/gemini.ts';
import {
  buildChatSystemPrompt,
  buildRagContext,
  chatGrantContext,
  type ChatGrant,
  OWN_CHUNK_LIMIT,
  RAG_MATCH_COUNT,
  RAG_MIN_SIMILARITY,
  type RagChunk,
} from '../_shared/chat-context.ts';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// The handler takes its Supabase clients and env as deps, so the ownership checks are tested without a network
// (the pattern of match-grants, vies-check, delete-account).
export interface Deps {
  createClient: (url: string, key: string, options?: Record<string, unknown>) => SupabaseClient;
  env: (name: string) => string | undefined;
}

const defaultDeps: Deps = {
  createClient: (url, key, options) => createClient(url, key, options),
  env: (name) => Deno.env.get(name),
};

export async function handler(req: Request, deps: Deps = defaultDeps): Promise<Response> {
  console.log('Kérés megérkezett. Metódus:', req.method);

  // CORS preflight kérések kezelése
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS preflight kérés lekezelve.');
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Card [L]: the daily chat cap is consumed before the paid AI call and given back if that call fails.
  let capConsumedFor: string | null = null;
  let aiAnswered = false;
  // deno-lint-ignore no-explicit-any
  let capClient: any = null;

  try {
    console.log('Authorization fejléc ellenőrzése...');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Hiba: Nincs hitelesítési fejléc');
      return new Response(JSON.stringify({ error: 'Nincs hitelesítési fejléc' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Supabase kliens inicializálása service_role kulccsal az RLS kikerüléséhez...');
    // Supabase kliens létrehozása service_role kulccsal
    const supabaseClient = deps.createClient(
      deps.env('SUPABASE_URL') ?? '',
      deps.env('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    console.log('Felhasználó azonosítása...');
    const userClient = deps.createClient(
      deps.env('SUPABASE_URL') ?? '',
      deps.env('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error('Hiba a felhasználó azonosításakor:', authError);
      return new Response(JSON.stringify({ error: 'Érvénytelen hitelesítés' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Kérés törzsének (JSON) beolvasása...');
    // Kliens paraméterek beolvasása
    const requestData = await req.json();
    // Csak a kulcsok es meretek: a tartalom (a felhasznalo uzenete, uzleti
    // kontextusa) NEM kerulhet a szolgaltatoi naplóba (2026-09-08, merve).
    console.log('Beolvasott adatok (kulcsok es meretek):', describeRequestData(requestData));

    // Size caps before any paid AI call (SECURITY_AUDIT.md H1): bounded message, at most the
    // last 10 well-formed history turns, each truncated.
    const input = validateChatInput(
      requestData.prompt || requestData.message || requestData.text || '',
      requestData.history,
    );
    if (!input.ok) {
      console.error('Hiba: érvénytelen üzenet:', input.status);
      return new Response(JSON.stringify({ error: input.error }), {
        status: input.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const message = input.message;
    const history = input.history;

    const business_profile_id =
      requestData.business_profile_id || requestData.businessProfileId || null;
    const requestedMatchId: string | null = requestData.match_id || requestData.matchId || null;

    // The match is read with the service role below, so its owner (business_id -> business_profiles.user_id) is
    // checked first. A foreign match is refused before the daily chat cap is touched; one that is missing or could
    // not be checked is dropped and the chat goes on without grant data, as it did for an unknown id.
    let match_id: string | null = null;
    let matchBusinessId: string | null = null;
    if (requestedMatchId) {
      const ownership = await matchOwnership(supabaseClient, requestedMatchId, user.id);
      if (ownership.status === 'foreign') {
        console.error('Jogosulatlan hozzáférés a pályázati találathoz');
        return new Response(JSON.stringify({ error: 'Nincs jogosultság a megadott pályázati találathoz' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (ownership.status === 'own') {
        match_id = requestedMatchId;
        matchBusinessId = ownership.businessId;
      } else {
        console.warn(`A találat nem használható (${ownership.status}), pályázati adat nélkül folytatom.`);
      }
    }

    const gate = await consumeDailyChat(supabaseClient, user.id);
    if (!gate.allowed) {
      return new Response(JSON.stringify(gate.body), {
        status: gate.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    capConsumedFor = user.id;
    capClient = supabaseClient;

    console.log('Kinyert prompt/üzenet:', describeText(message));
    console.log(`Profil ID: ${business_profile_id}, Match ID: ${match_id}`);
    console.log(`Előzmények száma: ${history.length}`);

    // 1. Cégprofil adatainak lekérdezése (ha van ID)
    // Installed builds can send no profile id (live 2026-10-25, see _shared/chat-profile.ts): then the discussed
    // match's own business_id is used. profileId is set only once the profile proved to be the caller's.
    let companyContext = '';
    let companyProfile: CompanyFields | null = null;
    let profileId: string | null = null;
    if (!business_profile_id && match_id) {
      console.warn(`A kérés profil-azonosító nélkül jött (match_id: ${match_id}); a találat profilja: ${matchBusinessId ?? 'nincs'}.`);
    }
    const profileRef = chatProfileId(business_profile_id, matchBusinessId);
    if (profileRef) {
      console.log(`Cégprofil lekérdezése az adatbázisból: ${profileRef.id} (forrás: ${profileRef.source})...`);
      const { data: profile, error: profileDbError } = await supabaseClient
        .from('business_profiles')
        .select('*')
        .eq('id', profileRef.id)
        .single();

      if (profileDbError) {
        console.warn('Nem sikerült lekérni a cégprofilt:', profileDbError);
      }

      const decision = profile ? chatProfileDecision(profileRef.source, profile.user_id, user.id) : 'skip';
      if (decision === 'skip' && profile) {
        console.warn('A találat profilja nem a hívóé, cégadat nélkül folytatom.');
      }
      if (profile && decision !== 'skip') {
        if (decision === 'forbidden') {
          console.error('Jogosulatlan hozzáférés a cégprofilhoz');
          // Card [L]: no AI call happens on this path, so the consumed chat message is given back.
          await refundDailyChat(supabaseClient, user.id);
          return new Response(JSON.stringify({ error: 'Nincs jogosultság a megadott profilhoz' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Only the filled fields, as in the other generation prompts (card 431a496e); the ask rule names them.
        companyContext = buildCompanyContext(profile);
        companyProfile = profile;
        profileId = profileRef.id;
        console.log('Cégprofil kontextus sikeresen felépítve.');
      }
    }
    if (match_id && !companyProfile) {
      console.warn('Pályázatról kérdez, de cégprofil nélkül: a válasz a cégadatokat vissza fogja kérdezni.');
    }

    // 2. Pályázat adatainak lekérdezése (ha van ID)
    let grantContext = '';
    let discussedGrant: ChatGrant | null = null;
    if (match_id) {
      console.log(`Pályázati egyezés lekérdezése az adatbázisból: ${match_id}...`);
      const { data: match, error: matchDbError } = await supabaseClient
        .from('grant_matches')
        .select('*, grants(*)')
        .eq('id', match_id)
        .single();

      if (matchDbError) {
        console.warn('Nem sikerült lekérni a pályázati egyezést:', matchDbError);
      }

      if (match?.grants) {
        discussedGrant = match.grants as ChatGrant;
        grantContext = chatGrantContext(discussedGrant);
        console.log('Pályázat kontextus sikeresen felépítve.');
      }
    }

    // 3. Feladatok lekérdezése a céghez az azonosítókkal a rendszerpromptba dúsításhoz
    let tasksContext = '';
    // Plans that belong to the caller's (already ownership-checked) business profile. The
    // task-status write below must stay inside this set: the ids come from the model's reply,
    // and the service-role client would otherwise update any user's task (measured 2026-09-26).
    let ownedPlanIds: string[] = [];
    if (profileId) {
      console.log('Aktív felkészülési feladatok lekérdezése...');
      const { data: plans, error: plansDbError } = await supabaseClient
        .from('action_plans')
        .select('id, title')
        .eq('business_profile_id', profileId);

      if (plansDbError) {
        console.warn('Nem sikerült lekérni az akcióterveket:', plansDbError);
      }

      if (plans && plans.length > 0) {
        const planIds = plans.map((p) => p.id);
        ownedPlanIds = planIds;
        const { data: tasks, error: tasksDbError } = await supabaseClient
          .from('action_tasks')
          .select('id, title, status')
          .in('plan_id', planIds)
          .order('order_index', { ascending: true });

        if (tasksDbError) {
          console.warn('Nem sikerült lekérni az akciófeladatokat:', tasksDbError);
        }

        if (tasks && tasks.length > 0) {
          tasksContext =
            'Az adatbázisban szereplő aktív felkészülési feladatok és azonosítóik (UUID):\n';
          tasks.forEach((t) => {
            tasksContext += `- Feladat: "${t.title}", Állapot: "${t.status}", Azonosító (ID): "${t.id}"\n`;
          });
          console.log(`Feladatok kontextus felépítve (${tasks.length} feladat).`);
        }
      }
    }

    console.log('API kulcs ellenőrzése a környezeti változókban...');
    // 4. Gemini API kulcs lekérése és az SDK inicializálása
    const apiKey = deps.env('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY környezeti változó nincs beállítva a Deno környezetben.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);

    // 5. RAG (Retrieval-Augmented Generation) - Vektoros keresés
    const debugInfo: Record<string, any> = {
      embedding_length: 0,
      matched_chunks_count: 0,
      rpc_error: null,
      embed_error: null,
      rpc_exception: null,
    };

    // With a discussed grant the knowledge is its own chunks only (chat-context.ts), so the question is not
    // embedded and nothing is searched over the other grants.
    let queryEmbedding: number[] = [];
    if (!discussedGrant) {
      try {
        console.log("Embedding generálása a felhasználói kérdésre ('gemini-embedding-001')...");
        // The REST helper (_shared/gemini.ts): the SDK's embedContent typings have no outputDimensionality, so the
        // SDK call failed `deno check`; the helper also verifies the 768 dimensions grant_chunks.embedding needs.
        const values = await generateEmbedding(message, apiKey);
        if (values.length > 0) {
          queryEmbedding = values;
          debugInfo.embedding_length = queryEmbedding.length;
          console.log(`Embedding sikeresen generálva: ${queryEmbedding.length} dimenzió.`);
        } else {
          console.warn('Az embedding generálás üres választ adott vissza.');
          debugInfo.embed_error = 'Az embedding generálás üres választ adott vissza.';
        }
      } catch (embedErr: any) {
        console.error('Hiba az embedding generálása során:', embedErr);
        debugInfo.embed_error = embedErr.message || String(embedErr);
      }
    }

    let ragContext = '';
    let sourceTitles: string[] = [];
    // With a match the discussed grant's own chunks are the knowledge (Copilot card; live at most 5 per grant, Brunella 4853).
    let own: { title: string; chunks: string[] } | null = null;
    if (discussedGrant?.id) {
      const { data: ownRows, error: ownError } = await supabaseClient
        .from('grant_chunks')
        .select('content')
        .eq('grant_id', discussedGrant.id)
        .order('created_at', { ascending: true })
        .limit(OWN_CHUNK_LIMIT);
      if (ownError) console.warn('Nem sikerült lekérni a tárgyalt pályázat részleteit:', ownError.message);
      own = { title: discussedGrant.title || 'A tárgyalt pályázat', chunks: (ownRows ?? []).map((r: { content: string }) => r.content) };
      debugInfo.own_chunks_count = own.chunks.length;
    }

    let hits: RagChunk[] = [];
    if (queryEmbedding.length > 0) {
      try {
        console.log('Szemantikai keresés indítása a Supabase-ben (match_grant_chunks RPC)...');
        const { data: matchedChunks, error: rpcError } = await supabaseClient.rpc(
          'match_grant_chunks',
          {
            query_embedding: queryEmbedding,
            match_threshold: RAG_MIN_SIMILARITY,
            match_count: RAG_MATCH_COUNT,
          },
        );
        if (rpcError) {
          console.error('Hiba a match_grant_chunks RPC futtatásakor:', rpcError);
          debugInfo.rpc_error = rpcError.message || JSON.stringify(rpcError);
        } else {
          hits = (matchedChunks ?? []) as RagChunk[];
          debugInfo.matched_chunks_count = hits.length;
        }
      } catch (rpcErr: any) {
        console.error('Hiba történt a vektoros adatbázis-lekérdezés során:', rpcErr);
        debugInfo.rpc_exception = rpcErr.message || String(rpcErr);
      }
    }

    // Other grants only while open (the matching's rule), so their deadline and state are read by id.
    const grantsById = new Map<string, ChatGrant>();
    const hitIds = Array.from(new Set(hits.map((h) => h.grant_id).filter(Boolean)));
    if (hitIds.length > 0) {
      const { data: grantsList, error: grantsError } = await supabaseClient
        .from('grants')
        .select('id, title, deadline, source_closed_at')
        .in('id', hitIds);
      if (grantsError) console.error('Hiba a pályázatok lekérdezésekor:', grantsError);
      for (const g of grantsList ?? []) grantsById.set(g.id, g as ChatGrant);
    }

    const rag = buildRagContext({
      own,
      hits,
      grants: grantsById,
      cutoffIso: openGrantCutoffIso(),
    });
    ragContext = rag.text;
    sourceTitles = rag.sources;
    debugInfo.similar_chunks_used = rag.similarCount;
    console.log('Források:', JSON.stringify(sourceTitles));

    console.log('Rendszerprompt összeállítása...');
    // 6. Rendszerprompt felépítése dúsított kontextussal
    const systemPrompt = buildChatSystemPrompt({
      company: companyContext,
      grant: grantContext,
      rag: ragContext,
      tasks: tasksContext,
      profile: companyProfile,
    });

    console.log('Beszélgetési előzmények leképezése a Gemini formátumára...');
    // 7. Előzmények leképezése a Gemini API formátumára
    const geminiContents: { role: string; parts: { text: string }[] }[] = [];
    for (const msg of history) {
      if (msg.id === 'welcome' || msg.id.startsWith('err-')) continue;

      const role = msg.sender === 'user' ? 'user' : 'model';
      geminiContents.push({
        role: role,
        parts: [{ text: msg.text }],
      });
    }

    geminiContents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    console.log('Gemini SDK model és config beállítása és hívás indítása...');
    // 8. Gemini API hívása a hivatalos GoogleGenerativeAI SDK-val
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
      },
    });

    // d8ff4f1b: Claude first, this SDK call is the fallback (same history, same system prompt).
    const claudeTurns: Turn[] = geminiContents.map((c) => ({
      role: c.role === 'user' ? 'user' as const : 'assistant' as const,
      text: c.parts.map((p) => p.text).join(''),
    }));
    const replyJSONText = (await chatJson(systemPrompt, claudeTurns, async () => {
      const result = await model.generateContent({
        contents: geminiContents,
      });
      return result.response.text();
    }, 1000)) || '{}';
    aiAnswered = true;
    console.log('Modell-hívás sikeresen lefutott.');
    console.log('Gemini nyers JSON válasz:', describeJsonText(replyJSONText));

    let reply = 'Sajnálom, nem sikerült választ generálnom.';
    let databaseUpdated = false;

    // 7. A kapott JSON feldolgozása és Supabase UPDATE műveletek végrehajtása
    try {
      console.log('Gemini válasz JSON parsing indítása...');
      const parsedReply = JSON.parse(replyJSONText.trim());
      reply = parsedReply.reply || reply;

      // 7.1. Cégprofil frissítése, ha van profile_updates
      if (parsedReply.profile_updates && profileId) {
        const updates: Record<string, any> = {};
        if (typeof parsedReply.profile_updates.revenue === 'number') {
          updates.yearly_revenue = parsedReply.profile_updates.revenue;
        }
        if (typeof parsedReply.profile_updates.employee_count === 'number') {
          updates.employee_count = parsedReply.profile_updates.employee_count;
        }

        if (Object.keys(updates).length > 0) {
          console.log(
            'Cégprofil frissítése az adatbázisban a következő értékekkel:',
            describeRequestData(updates),
          );
          const { error: profileError } = await supabaseClient
            .from('business_profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', profileId);

          if (!profileError) {
            databaseUpdated = true;
            console.log('Cégprofil sikeresen frissítve az adatbázisban.');
          } else {
            console.error('Hiba a cégprofil frissítésekor az Edge Functionben:', profileError);
          }
        }
      }

      // 7.2. Feladatok státuszának frissítése 'done'-ra, ha van completed_task_ids
      if (
        parsedReply.task_updates &&
        Array.isArray(parsedReply.task_updates.completed_task_ids) &&
        parsedReply.task_updates.completed_task_ids.length > 0
      ) {
        console.log(
          "Feladatok státuszának frissítése 'done'-ra a következő ID-kkal:",
          JSON.stringify(parsedReply.task_updates.completed_task_ids),
        );
        // Ownership guard: only tasks of the caller's own plans can be closed, whatever ids the
        // model echoed. With no owned plans nothing is written.
        const { error: taskError } = ownedPlanIds.length === 0
          ? { error: null }
          : await supabaseClient
            .from('action_tasks')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .in('id', parsedReply.task_updates.completed_task_ids)
            .in('plan_id', ownedPlanIds);

        if (!taskError) {
          databaseUpdated = true;
          console.log('Feladatok státusza sikeresen frissítve.');
        } else {
          console.error('Hiba a feladatok frissítésekor az Edge Functionben:', taskError);
        }
      }
    } catch (parseErr) {
      console.error(
        'Hiba a Gemini JSON válasz feldolgozásakor:',
        describeParseError(parseErr),
        describeJsonText(replyJSONText),
      );
      // Fallback: Ha mégsem JSON jött vissza, a teljes szöveget küldjük el válaszként
      reply = replyJSONText;
    }

    console.log('Kérés kiszolgálása sikeres. Küldött válasz:', describeText(reply));
    return new Response(
      JSON.stringify({
        reply: reply,
        database_updated: databaseUpdated,
        sources: sourceTitles,
        debug: debugInfo,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err: any) {
    console.error('Végzetes hiba az Edge Function futása során:', err);
    if (capConsumedFor && !aiAnswered) {
      const refunded = await refundDailyChat(capClient, capConsumedFor);
      console.warn('A napi chat-keret visszaadva (AI-hiba):', refunded);
    }
    return new Response(
      JSON.stringify({
        error: err.message || 'Ismeretlen hiba történt a szerveren.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

if (import.meta.main) {
  serve((req) => handler(req));
}
