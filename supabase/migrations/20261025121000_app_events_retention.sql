-- Card [G] (review 2026-10-25, Brunella decision 4685): app_events rows are kept for 12 months, or until the account
-- is deleted if that comes first (the cascade on auth.users). The privacy notice says exactly this, so the job must
-- really exist: unlike the grant-scan schedule (20260817130000), this migration FAILS when pg_cron is missing instead
-- of skipping with a notice.

CREATE INDEX IF NOT EXISTS app_events_created_at_idx ON public.app_events (created_at);

-- The deletion itself, separate from the schedule so it can be run and tested on its own. Returns the rows removed.
CREATE OR REPLACE FUNCTION public.purge_old_app_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM public.app_events WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_app_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_app_events() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE EXCEPTION 'pg_cron is not available: the 12-month app_events retention cannot be scheduled';
  END IF;

  -- Replace any previous definition so re-running the migration is safe.
  PERFORM cron.unschedule('p-search-purge-old-app-events')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'p-search-purge-old-app-events');

  PERFORM cron.schedule(
    'p-search-purge-old-app-events',
    '23 3 * * *',           -- daily at 03:23 UTC, away from the hourly grant scan at minute 7
    'SELECT public.purge_old_app_events();'
  );
END $$;
