import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleWeeklyDigest, type OutgoingEmail } from '../_shared/weekly-digest-handler.ts';
import type { DigestGrant, DigestMatch } from '../_shared/digest.ts';

/**
 * The weekly e-mail digest (P-Search round 6, item A). Called by pg_cron on Monday 05:00 and 06:00 UTC (migration
 * 20261126120000_weekly_digest.sql) with the scheduler secret; sends only in the Budapest 07:00 run. The logic and
 * its tests are in ../_shared/weekly-digest-handler.ts; this file only wires Supabase and Resend.
 *
 * Env: SCHEDULER_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_ENABLED ('true' to send at
 * all), DIGEST_ALLOWLIST (user ids, comma-separated; '*' only after the owner's approval), DIGEST_APP_URL (optional).
 * Deploy with verify_jwt = false (no user JWT in a cron call; the scheduler secret is checked inside).
 */

const GRANT_COLUMNS = 'id, title, provider, grant_type, amount_min, amount_max, deadline, source_closed_at';
const MAX_RECIPIENTS_PER_RUN = 500;

serve((req) => {
  const env = (name: string) => Deno.env.get(name);
  const admin = createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return handleWeeklyDigest(req, {
    env,
    now: () => new Date(),
    listRecipients: async () => {
      const { data, error } = await admin
        .from('profiles')
        .select('id, weekly_digest_last_sent_at')
        .eq('weekly_digest', true)
        .limit(MAX_RECIPIENTS_PER_RUN);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: { id: string; weekly_digest_last_sent_at: string | null }) => ({
        id: r.id,
        last_sent_at: r.weekly_digest_last_sent_at,
      }));
    },
    getEmail: async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw new Error(error.message);
      return data.user?.email ?? null;
    },
    getCompany: async (userId) => {
      const { data, error } = await admin.from('business_profiles').select('id, company_name').eq('user_id', userId);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; company_name: string | null }[];
      return { name: rows[0]?.company_name ?? null, businessIds: rows.map((r) => r.id) };
    },
    getMatches: async (businessIds) => {
      const { data, error } = await admin
        .from('grant_matches')
        .select(`id, match_score, status, created_at, grants(${GRANT_COLUMNS})`)
        .in('business_id', businessIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DigestMatch[];
    },
    getFollowed: async (userId) => {
      const { data, error } = await admin.from('followed_grants').select(`grants(${GRANT_COLUMNS})`).eq('user_id', userId);
      if (error) {
        // the followed_grants migration (20261125120000) not applied yet: the digest goes without the followed part
        console.warn(`digest followed_grants unreadable: ${error.message}`);
        return [];
      }
      return ((data ?? []) as unknown as { grants: DigestGrant | null }[]).map((r) => r.grants).filter((g): g is DigestGrant => !!g);
    },
    send: async (email: OutgoingEmail) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': email.idempotencyKey,
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: email.headers,
        }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
    },
    markSent: async (userId, at) => {
      const { error } = await admin.from('profiles').update({ weekly_digest_last_sent_at: at }).eq('id', userId);
      if (error) throw new Error(error.message);
    },
  });
});
