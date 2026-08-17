import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runMatchingForProfile } from '../_shared/matching.ts';

/**
 * User-initiated grant matching ("Új AI Keresés").
 *
 * Authorisation is two-step and deliberately uses two different clients:
 *   - an anon client carrying the caller's JWT, used ONLY to resolve who the
 *     caller is and to prove they own the requested business profile;
 *   - a service-role client used for the actual matching work, because the
 *     pipeline writes `grant_matches` rows and reads across tables whose
 *     policies are scoped to the end user.
 *
 * Doing the ownership check against the *user* client (not the service-role
 * one) means RLS is still the backstop if this check is ever refactored away.
 */

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Nincs hitelesítési fejléc' }, 401);
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: 'Érvénytelen hitelesítés' }, 401);
    }

    let body: { business_profile_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Érvénytelen kérés törzs' }, 400);
    }

    const businessProfileId = body.business_profile_id;
    if (!businessProfileId) {
      return json({ error: 'Hiányzó business_profile_id' }, 400);
    }

    // Ownership check via the caller's own client.
    const { data: owned, error: ownershipError } = await userClient
      .from('business_profiles')
      .select('id')
      .eq('id', businessProfileId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownershipError || !owned) {
      return json({ error: 'Hozzáférés megtagadva' }, 403);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY nincs beállítva.');
      return json({ error: 'A szolgáltatás átmenetileg nem elérhető.' }, 503);
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const summary = await runMatchingForProfile(adminClient, businessProfileId, geminiApiKey);

    // Record that a scan happened so the Settings screen can show it, without
    // touching next_scan_at: a manual run should not shift the user's cadence.
    const { error: stampError } = await adminClient
      .from('profiles')
      .update({ last_scan_at: new Date().toISOString() })
      .eq('id', user.id);

    if (stampError) {
      console.warn('Nem sikerült frissíteni a last_scan_at mezőt:', stampError.message);
    }

    return json(
      {
        success: true,
        matches_found: summary.inserted,
        candidates_considered: summary.candidates,
      },
      200,
    );
  } catch (err) {
    // Detail stays server-side; the client gets a generic Hungarian message.
    console.error('Hiba a pályázatkeresés során:', err);
    return json({ error: 'Nem sikerült lefuttatni a pályázatkeresést.' }, 500);
  }
});
