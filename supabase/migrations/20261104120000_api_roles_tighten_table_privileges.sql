-- Tighten the table privileges of the API roles (anon, authenticated) on grant_matches, grants and
-- processed_webhook_events.
--
-- 20261021120000_explicit_api_grants.sql copied the live relacl and so grants anon AND authenticated
-- select, insert, update, delete, truncate, references, trigger, maintain on these tables. RLS filters rows for
-- SELECT/INSERT/UPDATE/DELETE, but it does not stop TRUNCATE, REFERENCES (FK creation), TRIGGER (trigger
-- creation) or MAINTAIN (VACUUM/ANALYZE/REINDEX/CLUSTER/REFRESH/LOCK): those are privilege questions only.
-- PostgREST never issues them, but any client that reaches SQL as one of these roles could.
--
-- Writers (read 2026-11-04, see the PR description for file:line):
--   grant_matches  INSERT/UPSERT: _shared/matching.ts (runMatchingForProfile) via match-grants and
--                  scheduled-grant-scan, both with the service-role client.
--                  DELETE: delete-account with the service-role client.
--                  UPDATE of feedback: set_match_feedback() (SECURITY DEFINER), unchanged.
--   grants         INSERT/UPDATE: ingest-n8n-grants (service role), scripts/ingest-grants/run.ts (service role),
--                  scripts/seed-grants.js (service role, falls back to the anon key; under RLS that fallback
--                  was already refused, the only write policy is TO service_role).
--   processed_webhook_events: revenuecat-webhook with the service role; explicit deny-all policy for clients.
-- No writer runs with the user's JWT (authenticated), so the client write privileges go.
--
-- Unchanged on purpose: SELECT for anon/authenticated, every RLS policy, all of service_role's privileges, the
-- earlier REVOKE UPDATE on grant_matches (20261029120000) and the set_match_feedback EXECUTE grants.
--
-- Idempotent: REVOKE of a privilege that is not held is a no-op. A table that does not exist (a database built
-- outside the migrations) is skipped, like in 20261021120000.

do $$
begin
  if to_regclass('public.grant_matches') is not null then
    revoke insert, delete, truncate, references, trigger, maintain on public.grant_matches from anon, authenticated;
  end if;
  if to_regclass('public.grants') is not null then
    revoke insert, update, delete, truncate, references, trigger, maintain on public.grants from anon, authenticated;
  end if;
  if to_regclass('public.processed_webhook_events') is not null then
    revoke truncate, references, trigger, maintain on public.processed_webhook_events from anon, authenticated;
  end if;
end
$$;
