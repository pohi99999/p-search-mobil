-- Weekly e-mail digest (P-Search round 6, item A; Péter 18328 via Marveen 9160, plan approved 9199).
--
-- Opt-in, OFF by default. The app asks once after the first successful search and offers a switch in Settings;
-- the weekly-digest Edge Function writes on Monday 07:00 Budapest time to users who opted in, and only while
-- DIGEST_ENABLED is on and the user is on the DIGEST_ALLOWLIST (the internal test account until Péter has approved
-- the text and the first test e-mail). Unsubscribing is one click (digest-unsubscribe).
--
-- profiles:
--   weekly_digest               the opt-in (the app writes it)
--   weekly_digest_asked_at      the one-time question was answered, either way (the app writes it)
--   weekly_digest_consent_at    when the opt-in was given: set HERE by a trigger, never by the client, so it is
--                               a server-side record of the consent; cleared when the user opts out
--   weekly_digest_last_sent_at  the last digest sent (the Edge Function, service role), against sending twice a week
--
-- Idempotent (if not exists / or replace / drop … if exists). Rollback: drop the two cron jobs, the trigger and the
-- function, revoke the two column grants; the columns can stay (default false = nobody gets anything).

alter table public.profiles add column if not exists weekly_digest boolean not null default false;
alter table public.profiles add column if not exists weekly_digest_asked_at timestamptz;
alter table public.profiles add column if not exists weekly_digest_consent_at timestamptz;
alter table public.profiles add column if not exists weekly_digest_last_sent_at timestamptz;

-- The client may change only the opt-in and the "asked" stamp (the same column-grant pattern as
-- 20260926150000_lock_entitlement_columns_and_rpc.sql). The consent and the last-sent stamps are server-side.
grant update (weekly_digest, weekly_digest_asked_at) on public.profiles to authenticated;

create or replace function public.stamp_weekly_digest_consent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.weekly_digest and not coalesce(old.weekly_digest, false) then
    new.weekly_digest_consent_at := now();
  elsif not new.weekly_digest then
    new.weekly_digest_consent_at := null;
  else
    -- unchanged opt-in: the stamp cannot be moved through any other update
    new.weekly_digest_consent_at := old.weekly_digest_consent_at;
  end if;
  return new;
end
$$;

revoke all on function public.stamp_weekly_digest_consent() from public, anon, authenticated;

drop trigger if exists profiles_weekly_digest_consent on public.profiles;
create trigger profiles_weekly_digest_consent
  before update on public.profiles
  for each row execute function public.stamp_weekly_digest_consent();

-- Monday 07:00 Europe/Budapest the whole year: pg_cron runs in UTC, so both 05:00 (summer time) and 06:00 (winter
-- time) call the function; it sends only in the run whose local hour is 7 (Marveen 9199), and a per-user,
-- per-week idempotency key keeps it to one e-mail a week even if both ran.
do $$
declare
  fn_url text := 'https://icextvgecinmhrhjtfcm.supabase.co/functions/v1/weekly-digest';
  slot text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron nem érhető el, a heti összefoglaló ütemezése kimarad.';
    return;
  end if;
  foreach slot in array array['05', '06'] loop
    perform cron.unschedule('p-search-weekly-digest-' || slot)
     where exists (select 1 from cron.job where jobname = 'p-search-weekly-digest-' || slot);
    perform cron.schedule(
      'p-search-weekly-digest-' || slot,
      format('0 %s * * 1', slot::int),
      format($job$
        select net.http_post(
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
  end loop;
end $$;
