import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeNextScanAt, runMatchingForProfile } from '../_shared/matching.ts';

/**
 * The recurring per-user grant-hunting agent.
 *
 * Invoked by pg_cron (see migration 20260817130000_schedule_grant_scan_cron.sql),
 * NOT by end users. It selects every profile whose `next_scan_at` has come due,
 * runs the matching pipeline for each of their companies, then re-arms
 * `next_scan_at` according to that user's chosen cadence.
 *
 * Because there is no user JWT in a cron context, the endpoint is protected by
 * a shared secret (`SCHEDULER_SECRET`) instead. It is compared in constant time
 * and the function refuses to run at all if the secret is unset, so a
 * misconfiguration fails closed rather than leaving an open endpoint that would
 * let anyone burn the project's Gemini quota.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** How many users one invocation will process, bounding runtime and quota. */
const MAX_USERS_PER_RUN = 25;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function secureCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  let mismatch = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < max; i++) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return mismatch === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get('SCHEDULER_SECRET');
    if (!expectedSecret) {
      // Fail closed: without a configured secret the endpoint would otherwise
      // be callable by anyone.
      console.error('SCHEDULER_SECRET nincs beállítva, a futás megtagadva.');
      return json({ error: 'A szolgáltatás nincs konfigurálva.' }, 503);
    }

    const presented = (req.headers.get('Authorization') ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!secureCompare(presented, expectedSecret)) {
      return json({ error: 'Hozzáférés megtagadva' }, 401);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY nincs beállítva.');
      return json({ error: 'A szolgáltatás átmenetileg nem elérhető.' }, 503);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const nowIso = new Date().toISOString();

    // Users who opted out ('manual') have next_scan_at = NULL and are excluded
    // by the NOT NULL semantics of the lte filter.
    const { data: dueProfiles, error: dueError } = await admin
      .from('profiles')
      .select('id, search_frequency, next_scan_at')
      .neq('search_frequency', 'manual')
      .lte('next_scan_at', nowIso)
      .order('next_scan_at', { ascending: true })
      .limit(MAX_USERS_PER_RUN);

    if (dueError) {
      throw new Error(`Nem sikerült lekérdezni az esedékes felhasználókat: ${dueError.message}`);
    }

    const due = dueProfiles ?? [];
    let usersProcessed = 0;
    let totalMatches = 0;
    let failures = 0;

    for (const profile of due) {
      // Re-arm the schedule FIRST. If the matching below throws or the whole
      // invocation times out, the user simply waits for the next cycle instead
      // of the scheduler retrying them on every run and starving everyone else.
      const nextScanAt = computeNextScanAt(profile.search_frequency, new Date());
      const { error: rearmError } = await admin
        .from('profiles')
        .update({ last_scan_at: nowIso, next_scan_at: nextScanAt })
        .eq('id', profile.id);

      if (rearmError) {
        console.error(`Nem sikerült újraütemezni a(z) ${profile.id} felhasználót:`, rearmError.message);
        failures++;
        continue;
      }

      const { data: businesses, error: bizError } = await admin
        .from('business_profiles')
        .select('id')
        .eq('user_id', profile.id);

      if (bizError) {
        console.error(`Cégprofil lekérdezési hiba (${profile.id}):`, bizError.message);
        failures++;
        continue;
      }

      for (const business of businesses ?? []) {
        try {
          const summary = await runMatchingForProfile(admin, business.id, geminiApiKey);
          totalMatches += summary.inserted;
        } catch (err) {
          // One company's failure must not abort the whole scheduled batch.
          console.error(`Matching hiba (cégprofil ${business.id}):`, err);
          failures++;
        }
      }

      usersProcessed++;
    }

    console.log(
      `Ütemezett keresés kész: ${usersProcessed} felhasználó, ${totalMatches} egyezés, ${failures} hiba.`,
    );

    return json(
      {
        success: true,
        users_processed: usersProcessed,
        matches_created: totalMatches,
        failures,
      },
      200,
    );
  } catch (err) {
    console.error('Végzetes hiba az ütemezett keresés során:', err);
    return json({ error: 'Az ütemezett keresés nem futott le.' }, 500);
  }
});
