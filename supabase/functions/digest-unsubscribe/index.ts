import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleUnsubscribe } from '../_shared/digest-unsubscribe-handler.ts';

/**
 * One-click unsubscribe from the weekly digest (P-Search round 6, item A). The link in every digest e-mail and the
 * List-Unsubscribe header point here; the token is an HMAC of the user id (../_shared/digest.ts). The logic and its
 * tests are in ../_shared/digest-unsubscribe-handler.ts.
 *
 * Env: SCHEDULER_SECRET (the HMAC key), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DIGEST_APP_URL (optional).
 * Deploy with verify_jwt = false: the link is opened without signing in.
 */

serve((req) => {
  const env = (name: string) => Deno.env.get(name);
  const admin = createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return handleUnsubscribe(req, {
    env,
    optOut: async (userId) => {
      const { error } = await admin.from('profiles').update({ weekly_digest: false }).eq('id', userId);
      if (error) throw new Error(error.message);
    },
  });
});
