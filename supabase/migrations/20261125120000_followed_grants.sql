-- Followed grants on the server (P-Search round 6, Péter's decision Telegram 18328 via Marveen 9160).
--
-- Until now "Követem" lived only on the device (src/lib/followedGrants.ts, AsyncStorage): a reinstall or a second
-- device lost the list, and the free limit of 3 (owner decision 2026-11-21, Péter GO 17591) could be dodged by
-- clearing the app's storage. This table is the list; the app keeps its in-memory cache and uploads the device list
-- once (src/lib/followedGrants.ts).
--
-- - One row per (user, grant). match_snapshot is the match as the home list showed it (grants included), the same
--   object the device stored, so the detail view opens from the list without a query; the list screen refreshes the
--   deadline and the closed state from public.grants, as before.
-- - RLS: a user reads, adds and removes only their own rows; no UPDATE (a follow is added or removed, never edited).
-- - The free limit is enforced here: a BEFORE INSERT trigger refuses the 4th row of a non-Pro user with P0001
--   'follow_limit'. A per-user transaction lock serialises concurrent inserts, so two parallel taps cannot both pass
--   the count. Pro (profiles.subscription_tier = 'pro') has no limit, like the app (FREE_FOLLOW_LIMIT).
-- - Deleting the account deletes the auth user (delete-account), and the rows go with it (ON DELETE CASCADE).
--
-- Idempotent where it can be (if not exists / or replace / drop policy if exists).

create table if not exists public.followed_grants (
  user_id uuid not null references auth.users (id) on delete cascade,
  grant_id uuid not null references public.grants (id) on delete cascade,
  match_snapshot jsonb not null,
  followed_at timestamptz not null default now(),
  primary key (user_id, grant_id)
);

alter table public.followed_grants enable row level security;

drop policy if exists "followed_grants: own rows are readable" on public.followed_grants;
create policy "followed_grants: own rows are readable" on public.followed_grants
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "followed_grants: a user follows for themselves" on public.followed_grants;
create policy "followed_grants: a user follows for themselves" on public.followed_grants
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "followed_grants: a user unfollows their own" on public.followed_grants;
create policy "followed_grants: a user unfollows their own" on public.followed_grants
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Only what the app does: read, add, remove. Nothing for anon.
revoke all on public.followed_grants from anon, authenticated;
grant select, insert, delete on public.followed_grants to authenticated;
grant all on public.followed_grants to service_role;

create or replace function public.enforce_follow_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier text;
  already integer;
begin
  -- A row for somebody else is RLS's to refuse. A BEFORE trigger runs before the policy's WITH CHECK, so counting
  -- here would answer "follow_limit" for another user's list and tell the caller whether that user is at the limit.
  -- The service role (no JWT, auth.uid() is null) is counted like the user it writes for.
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  -- Serialise this user's inserts, so the count below cannot be raced by a parallel insert.
  perform pg_advisory_xact_lock(hashtextextended('followed_grants:' || new.user_id::text, 0));
  select subscription_tier into tier from public.profiles where id = new.user_id;
  if coalesce(tier, 'free') = 'pro' then
    return new;
  end if;
  -- A grant already followed is not a new follow: let the primary key (or ON CONFLICT DO NOTHING) decide, so a
  -- repeated upload of the same list never reads as "limit".
  if exists (select 1 from public.followed_grants where user_id = new.user_id and grant_id = new.grant_id) then
    return new;
  end if;
  select count(*) into already from public.followed_grants where user_id = new.user_id;
  if already >= 3 then
    raise exception 'follow_limit' using errcode = 'P0001', hint = 'free accounts follow at most 3 grants';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_follow_limit() from public, anon, authenticated;

drop trigger if exists followed_grants_limit on public.followed_grants;
create trigger followed_grants_limit
  before insert on public.followed_grants
  for each row execute function public.enforce_follow_limit();
