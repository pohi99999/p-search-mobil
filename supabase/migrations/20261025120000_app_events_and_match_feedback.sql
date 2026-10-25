-- Card [G] (review 2026-10-25, spec: Irisz, irisz-G-esemenyek.md): usage events for the closed test, and the
-- "Hasznos / Nem releváns" feedback on a match. Additive only: a new table, two new nullable columns, one function.
--
-- Privacy is enforced here, not only in the client: the event name comes from a closed list, and meta may carry
-- only whitelisted keys with short scalar values (no free text, no company data, no message bodies).

-- 1. app_events -------------------------------------------------------------------------------------------------

-- Allowed meta keys (Irisz 2.) and a cap on string values, so a free-text field cannot ride in under a known key.
CREATE OR REPLACE FUNCTION public.app_event_meta_ok(meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(meta) = 'object'
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_each(meta) AS e(key, value)
        WHERE e.key NOT IN (
                'has_goals', 'has_industry', 'has_revenue', 'has_employees', 'has_tax_number',
                'trigger', 'ok', 'matches_found', 'candidates_considered', 'duration_ms', 'error_code',
                'search_refunded', 'n_total', 'n_stale', 'n_expired', 'match_id', 'grant_id', 'rank',
                'score_band', 'value', 'n_tasks', 'to', 'source', 'package')
           OR jsonb_typeof(e.value) NOT IN ('string', 'number', 'boolean')
           OR (jsonb_typeof(e.value) = 'string' AND length(e.value #>> '{}') > 40)
     );
$$;

CREATE TABLE IF NOT EXISTS public.app_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN (
    'app_open', 'onboarding_done', 'profile_updated', 'search_start', 'search_result',
    'match_list_view', 'match_open', 'match_feedback', 'source_link_open',
    'plan_created', 'task_status_change', 'doc_generated', 'chat_message_sent',
    'paywall_view', 'purchase_done', 'daily_limit_hit', 'document_uploaded')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (pg_column_size(meta) < 512)
    CHECK (public.app_event_meta_ok(meta)),
  app_version text CHECK (app_version IS NULL OR length(app_version) <= 32),
  platform text CHECK (platform IS NULL OR platform IN ('android', 'ios', 'web')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_events_user_time_idx ON public.app_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS app_events_event_time_idx ON public.app_events (event, created_at);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- A signed-in user may only add rows about themselves. No select/update/delete policy: the client never reads the
-- log back, the evaluation runs as service_role.
DROP POLICY IF EXISTS app_events_insert_own ON public.app_events;
CREATE POLICY app_events_insert_own ON public.app_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Explicit grants (Supabase no longer grants new public tables to the API roles by default, see
-- 20261021120000_explicit_api_grants.sql). Unlike that migration, anon gets nothing and authenticated only INSERT.
REVOKE ALL ON public.app_events FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.app_events TO authenticated;
GRANT ALL ON public.app_events TO service_role;

-- 2. Feedback on a match ------------------------------------------------------------------------------------------

-- A separate column, not status: status is written by the matching engine (new/stale) and a rescan would overwrite
-- a feedback kept there.
ALTER TABLE public.grant_matches
  ADD COLUMN IF NOT EXISTS feedback text CHECK (feedback IN ('useful', 'not_relevant')),
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

-- The client writes the feedback only through this function: own matches only, only these two columns. (The
-- table-level UPDATE grant on grant_matches is wider than that; narrowing it is a separate card.)
CREATE OR REPLACE FUNCTION public.set_match_feedback(p_match_id uuid, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_value IS NOT NULL AND p_value NOT IN ('useful', 'not_relevant') THEN
    RAISE EXCEPTION 'invalid feedback value' USING ERRCODE = '22023';
  END IF;

  UPDATE public.grant_matches m
     SET feedback = p_value,
         feedback_at = CASE WHEN p_value IS NULL THEN NULL ELSE now() END
    FROM public.business_profiles b
   WHERE m.id = p_match_id
     AND b.id = m.business_id
     AND b.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_match_feedback(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_match_feedback(uuid, text) TO authenticated, service_role;
-- The meta check runs as the inserting role, so authenticated needs EXECUTE on it (a pure function, no data access).
REVOKE EXECUTE ON FUNCTION public.app_event_meta_ok(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_event_meta_ok(jsonb) TO authenticated, service_role;
