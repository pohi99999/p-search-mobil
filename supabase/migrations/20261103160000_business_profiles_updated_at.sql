-- business_profiles.updated_at follows every edit (round 3, 2026-11-03).
--
-- The table predates the migration history, and no migration in this repo puts an update trigger on it, so an edited
-- profile (Settings / Onboarding edit, card fa68ea84) can keep its insert time in updated_at. The grants table has had
-- the same trigger since 20260618102838_init_rag_grants.sql; this reuses its function.
--
-- Idempotent: the column is added only when missing, the trigger is replaced by name. Before applying it live, list the
-- table's triggers (select tgname from pg_trigger where tgrelid = 'public.business_profiles'::regclass and not tgisinternal)
-- so a differently named copy is not doubled.

ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER set_business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
