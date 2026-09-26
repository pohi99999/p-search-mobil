-- General rule (owner GO 2026-09-26, Telegram 4859): a NEW function in public must not be
-- executable by the API roles unless it is granted explicitly. Until now the schema's default
-- privileges handed EXECUTE to anon and authenticated to every new function, which is how
-- consume_daily_search became callable by anyone (fixed in 20260926150000).
--
-- Scope: the defaults of the `postgres` role, i.e. everything created by migrations, the SQL
-- editor and `supabase db push`. The `supabase_admin` defaults (extension objects such as
-- pgvector's operator functions) cannot be altered by postgres (not a member of that role) and
-- are left as they are; extension functions need EXECUTE for the API roles anyway.
-- Existing functions are NOT touched by ALTER DEFAULT PRIVILEGES.
--
-- Pattern for a function the client must call from now on:
--   GRANT EXECUTE ON FUNCTION public.my_rpc(args) TO authenticated;  -- explicit, per function
--
-- Rollback: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--           GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--           ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- Two forms are needed (measured 2026-09-26 with a probe function): the per-schema entry is
-- where Supabase hands EXECUTE to anon/authenticated, so it is revoked per schema; the built-in
-- EXECUTE for PUBLIC can only be removed by the GLOBAL form (a per-schema REVOKE leaves the
-- '=X' entry in place, and the anon key could still call the new function).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
