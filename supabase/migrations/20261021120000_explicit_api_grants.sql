-- Explicit Data API grants for every public table (P-Search), Supabase change of 2026-10-30.
--
-- From 2026-10-30 Supabase stops granting the API roles (anon, authenticated, service_role) on new
-- tables in "public" automatically. Existing tables keep their grants, but a schema rebuilt from the
-- migrations (supabase db reset, a preview branch, a new project) would get tables without them.
--
-- This migration grants exactly what each table carries on the live project today (relacl, read
-- 2026-10-21), so a rebuilt schema matches production. It is not a blanket grant: a table that is
-- stricter on purpose stays stricter. On the live project every statement is a no-op.
-- A table that does not exist yet (created outside the migrations) is skipped.

do $$
begin
  if to_regclass('public.action_plans') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.action_plans to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.action_plans to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.action_plans to service_role;
  end if;
  if to_regclass('public.action_tasks') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.action_tasks to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.action_tasks to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.action_tasks to service_role;
  end if;
  if to_regclass('public.business_profiles') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.business_profiles to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.business_profiles to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.business_profiles to service_role;
  end if;
  if to_regclass('public.financial_documents') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.financial_documents to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.financial_documents to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.financial_documents to service_role;
  end if;
  if to_regclass('public.grant_chunks') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grant_chunks to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grant_chunks to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grant_chunks to service_role;
  end if;
  if to_regclass('public.grant_matches') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grant_matches to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grant_matches to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grant_matches to service_role;
  end if;
  if to_regclass('public.grants') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grants to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grants to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.grants to service_role;
  end if;
  if to_regclass('public.processed_webhook_events') is not null then
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.processed_webhook_events to anon;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.processed_webhook_events to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.processed_webhook_events to service_role;
  end if;
  if to_regclass('public.profiles') is not null then
    grant select, references, trigger, maintain on public.profiles to anon;
    grant select, references, trigger, maintain on public.profiles to authenticated;
    grant select, insert, update, delete, truncate, references, trigger, maintain on public.profiles to service_role;
  end if;
end
$$;
