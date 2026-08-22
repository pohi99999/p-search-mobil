-- Security & performance hardening pass (2026-08-22)
-- Source: Supabase advisor security + performance lints, reviewed during a full
-- pre-production audit. Applied directly to the project via the Supabase MCP tool;
-- this file exists so the change is tracked in version control like every other
-- migration.

-- 1. profiles was exposing every user's subscription_tier / search_count / full_name
--    to anyone holding the public anon key (policy qual = true, role = public).
--    No code path in the app reads another user's profile (src/hooks/useHomeData.ts,
--    src/screens/SettingsScreen.tsx both only touch the caller's own row) - this was
--    unused, unnecessary exposure of paywall tier and PII. Restrict to the owner.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Users can view own profile."
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = id);

-- 2. RLS initplan: wrap auth.uid() in (select ...) so it's evaluated once per query,
--    not once per row (Supabase performance advisor: auth_rls_initplan).
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id);

-- 3. Duplicate permissive SELECT policy on grants: the authenticated-only policy is a
--    strict subset of the public one, which already covers authenticated
--    (Supabase performance advisor: multiple_permissive_policies).
DROP POLICY IF EXISTS "Allow read access for authenticated users on grants" ON public.grants;

-- 4. Trigger / event-trigger functions left directly callable via RPC by anon/
--    authenticated (Supabase security advisor: anon/authenticated_security_definer_
--    function_executable). Neither does anything useful outside its trigger context;
--    revoking direct EXECUTE removes the exposed /rest/v1/rpc/* surface without
--    affecting trigger firing (trigger invocation bypasses this privilege check).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

-- 5. Mutable search_path on two functions (security advisor: function_search_path_
--    mutable) - pin it so they can't be tricked by a session-level search_path change.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.match_grant_chunks(vector, double precision, integer) SET search_path = public;

-- 6. Duplicate indexes (performance advisor: duplicate_index) - drop the redundant
--    twin, keep the original/more descriptively named one.
DROP INDEX IF EXISTS public.idx_action_tasks_plan_id_fk;
DROP INDEX IF EXISTS public.idx_business_profiles_user_id_fk;

-- 7. Missing covering index for a foreign key (performance advisor:
--    unindexed_foreign_keys).
CREATE INDEX IF NOT EXISTS action_plans_match_id_idx ON public.action_plans (match_id);
