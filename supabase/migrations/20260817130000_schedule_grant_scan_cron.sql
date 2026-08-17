-- =============================================================================
-- P-Search Mobil — Scheduled grant scan (pg_cron)
--
-- Turns `profiles.search_frequency` from a column nobody read into an actual
-- recurring agent: an hourly cron job calls the `scheduled-grant-scan` Edge
-- Function, which picks up every user whose `next_scan_at` has come due and
-- re-arms it according to their chosen cadence.
--
-- Why hourly rather than one job per cadence: the per-user due date already
-- lives in `next_scan_at`, so a single frequent tick supports daily, weekly and
-- any future cadence without adding more cron entries, and it lets a user who
-- switches from weekly to daily take effect within the hour.
--
-- SECRET HANDLING
-- The shared secret is generated *inside the database* with gen_random_uuid()
-- and stored in Supabase Vault. It is therefore never written into this file
-- and never committed to git. After applying this migration the same value must
-- be published to the Edge Function runtime as `SCHEDULER_SECRET`; the helper
-- `public.get_scheduler_secret()` below exists so an operator can read it once
-- for that purpose.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. Generate-and-store the scheduler secret (idempotent)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  existing_id uuid;
BEGIN
  -- Vault is not present on every local/self-hosted setup; skip gracefully
  -- rather than failing the whole migration.
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE NOTICE 'Vault séma nem érhető el, a scheduler secret létrehozása kimarad.';
    RETURN;
  END IF;

  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'scheduler_secret';

  IF existing_id IS NULL THEN
    -- gen_random_uuid() is core Postgres (13+), unlike gen_random_bytes()
    -- which lives in pgcrypto under the `extensions` schema and is not on the
    -- migration search_path. Two concatenated UUIDs give a 64-character hex
    -- secret with ample entropy.
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'scheduler_secret',
      'Shared secret used by pg_cron to authenticate against the scheduled-grant-scan Edge Function.'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Operator helper to read the secret back exactly once, for publishing it
--    to the Edge Function runtime. Restricted to service_role.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_scheduler_secret()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret INTO secret_value
    FROM vault.decrypted_secrets
   WHERE name = 'scheduler_secret';
  RETURN secret_value;
END;
$$;

REVOKE ALL ON FUNCTION public.get_scheduler_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_scheduler_secret() TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Schedule the hourly tick
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  fn_url TEXT := 'https://icextvgecinmhrhjtfcm.supabase.co/functions/v1/scheduled-grant-scan';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'pg_cron nem érhető el, az ütemezés kimarad.';
    RETURN;
  END IF;

  -- Replace any previous definition so re-running the migration is safe.
  PERFORM cron.unschedule('p-search-scheduled-grant-scan')
   WHERE EXISTS (
     SELECT 1 FROM cron.job WHERE jobname = 'p-search-scheduled-grant-scan'
   );

  PERFORM cron.schedule(
    'p-search-scheduled-grant-scan',
    '7 * * * *',            -- hourly, at minute 7 to avoid the top-of-hour rush
    format($job$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || public.get_scheduler_secret()
                   ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$, fn_url)
  );
END $$;
