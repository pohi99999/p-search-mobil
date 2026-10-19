-- Lock INSERT (and DELETE/TRUNCATE) on public.profiles for the API roles (SECURITY_AUDIT.md M1,
-- measured live 2026-10-16, card 47c4888a).
--
-- 20260926150000 locked UPDATE to the five columns the app edits, but INSERT stayed granted on
-- every column to anon and authenticated, and the policy "Users can insert their own profile."
-- only checks auth.uid() = id. A signed-in user whose profiles row is missing (delete-account
-- removed it but the auth user survived, a manual cleanup, a user created while the trigger was
-- absent) could insert { id: <own uid>, subscription_tier: 'pro' } and pass every Pro gate.
-- Measured on the live DB: has_column_privilege(authenticated, profiles.subscription_tier, INSERT)
-- = true, UPDATE = false, no trigger on profiles.
--
-- Nothing legitimate inserts as anon/authenticated: the row is created at sign-up by
-- public.handle_new_user() (SECURITY DEFINER, runs as its owner), the app only SELECTs and UPDATEs
-- its own row (SettingsScreen, useHomeData), and delete-account / revenuecat-webhook /
-- match-grants write with the service role. There is no DELETE policy, so DELETE was already
-- denied by RLS; DELETE and TRUNCATE are revoked as defence in depth.
--
-- Rollback (if a client path breaks): GRANT INSERT ON public.profiles TO authenticated; and
-- recreate the policy below.

REVOKE INSERT, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

-- Without the grant the policy is dead code; dropping it means a future accidental GRANT INSERT
-- still finds no permissive INSERT policy and RLS denies the row.
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
