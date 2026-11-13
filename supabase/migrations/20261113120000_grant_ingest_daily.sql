-- Daily grant ingest (Marveen 7326, Péter GO 15383).
--
-- Until 2026-11-13 public.grants was loaded only by hand (scripts/ingest-grants/run.ts on 09-04, 09-12 and 10-25,
-- measured live by Marveen): no CI job, no fleet schedule, no pg_cron job, so the open calls went stale. This adds:
--   1. public.grant_ingest_runs: one row per run, good or bad, so a missing or failed day is visible;
--   2. public.ingest_grants_apply(): the whole write of one run in ONE transaction. New calls go in with
--      ON CONFLICT (source_url) DO NOTHING (the grants_source_url_key constraint, 20260912140000), so two
--      overlapping runs, or a re-run, can never create a duplicate. Changed deadlines are updated; calls gone
--      from the source get source_closed_at. Nothing is deleted: grant_matches point at these rows.
--   3. a daily pg_cron job calling the ingest-grants-daily Edge Function with the existing scheduler secret
--      (20260817130000: vault 'scheduler_secret', runtime SCHEDULER_SECRET). No new secret.
-- Tests: supabase/tests/grant-ingest.pglite.mjs (npm run test:sql).

-- 1. Run log ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grant_ingest_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error', 'dry_run')),
  fetched integer NOT NULL DEFAULT 0,
  to_insert integer NOT NULL DEFAULT 0,
  to_update integer NOT NULL DEFAULT 0,
  to_close integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  closed integer NOT NULL DEFAULT 0,
  closing_skipped boolean NOT NULL DEFAULT false,
  backfill text,
  error text
);
CREATE INDEX IF NOT EXISTS grant_ingest_runs_started_at ON public.grant_ingest_runs (started_at DESC);
-- Operations data, not for the app: RLS on with no policy, and no client privilege at all.
ALTER TABLE public.grant_ingest_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.grant_ingest_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.grant_ingest_runs_id_seq FROM PUBLIC, anon, authenticated;

-- 2. The write of one run, atomic --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_grants_apply(p_insert jsonb, p_update jsonb, p_close text[], p_closed_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated integer := 0;
  v_closed integer := 0;
BEGIN
  INSERT INTO public.grants (title, description, provider, grant_type, amount_min, amount_max, deadline, eligibility_criteria, source_url)
  SELECT x.title, x.description, x.provider, x.grant_type, x.amount_min, x.amount_max, x.deadline, x.eligibility_criteria, x.source_url
    FROM jsonb_to_recordset(coalesce(p_insert, '[]'::jsonb)) AS x(
      title text, description text, provider text, grant_type text, amount_min bigint, amount_max bigint,
      deadline timestamptz, eligibility_criteria text, source_url text)
   WHERE x.source_url IS NOT NULL AND x.title IS NOT NULL
  ON CONFLICT (source_url) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.grants g
     SET deadline = u.deadline, source_closed_at = NULL, updated_at = now()
    FROM jsonb_to_recordset(coalesce(p_update, '[]'::jsonb)) AS u(source_url text, deadline timestamptz)
   WHERE g.source_url = u.source_url;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.grants
     SET source_closed_at = p_closed_at, updated_at = now()
   WHERE source_url = ANY (coalesce(p_close, ARRAY[]::text[])) AND source_closed_at IS NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'closed', v_closed);
END;
$$;
-- Only the server side (the Edge Function and the manual script, both with the service key) may call it.
REVOKE ALL ON FUNCTION public.ingest_grants_apply(jsonb, jsonb, text[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_grants_apply(jsonb, jsonb, text[], timestamptz) TO service_role;

-- 3. Daily schedule ---------------------------------------------------------------------------------------------------
DO $$
DECLARE
  fn_url TEXT := 'https://icextvgecinmhrhjtfcm.supabase.co/functions/v1/ingest-grants-daily';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'pg_cron nem érhető el, az ütemezés kimarad.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('p-search-grant-ingest')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'p-search-grant-ingest');

  PERFORM cron.schedule(
    'p-search-grant-ingest',
    '23 4 * * *',            -- daily 04:23 UTC (05:23 / 06:23 Budapest); the next hourly scan (minute 7) sees the new calls
    format($job$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || public.get_scheduler_secret()
                   ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$, fn_url)
  );
END $$;
