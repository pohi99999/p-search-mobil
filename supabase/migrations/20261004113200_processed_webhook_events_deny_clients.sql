-- processed_webhook_events had RLS on but no policy (security advisor rls_enabled_no_policy).
-- Only revenuecat-webhook writes it, with the service role, which bypasses RLS; clients were
-- already denied, this states it explicitly. Applied to the live project on 2026-10-04 11:32
-- (owner GO, Telegram 5903); measured after: anon SELECT [] and INSERT 42501, the webhook's
-- service-role insert path still answers 200.
create policy "No client access (service role only)" on public.processed_webhook_events
  as permissive for all to anon, authenticated using (false) with check (false);

comment on policy "No client access (service role only)" on public.processed_webhook_events is
  'Only revenuecat-webhook writes this table, with the service role (bypasses RLS). Explicit deny for clients (security advisor rls_enabled_no_policy, 2026-10-04).';
