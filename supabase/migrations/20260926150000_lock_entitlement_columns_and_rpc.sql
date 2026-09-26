-- Lock the entitlement columns and the daily-cap RPC (measured live 2026-09-26, owner GO
-- Telegram 4852). Findings from docs/ARCHITECTURE.md ch. 6 (PR #193), confirmed on the live DB:
--
-- 1. profiles: the UPDATE policy only checks auth.uid() = id and the authenticated/anon roles held
--    column-level UPDATE on subscription_tier, so a signed-in user could set itself to 'pro'.
--    The client legitimately writes search_frequency / next_scan_at (SettingsScreen) and nothing
--    else; every entitlement or counter column is written by edge functions with the service role
--    (match-grants, revenuecat-webhook, daily-search-refund).
-- 2. consume_daily_search is SECURITY DEFINER and, through the schema's default privileges, had
--    EXECUTE for anon and authenticated with no auth.uid() check, so anyone could burn any user's
--    daily cap. Only match-grants calls it, with the service role. match_grant_chunks has the same
--    grant shape; it is read-only and only called by edge functions, so it is locked the same way.
--
-- Rollback (if a client path breaks): GRANT UPDATE ON public.profiles TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.consume_daily_search(uuid, integer) TO anon, authenticated;

-- 1. profiles: table-level UPDATE away from the API roles, back only for the columns the app edits.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url, search_frequency, next_scan_at, updated_at)
  ON public.profiles TO authenticated;

-- 2. RPCs: service role only.
REVOKE EXECUTE ON FUNCTION public.consume_daily_search(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_search(uuid, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.match_grant_chunks(vector, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_grant_chunks(vector, double precision, integer) TO service_role;

-- Proposal, NOT applied here (owner decision): new functions in public still get EXECUTE for
-- anon/authenticated from the schema's default privileges. To close that for good:
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- and grant EXECUTE per function where the client must call it.
