-- Revenue backend (owner decision 2026-09-12): search is free, but a non-Pro
-- user gets at most 20 matches/day; Pro is unlimited. Enforced server-side in
-- match-grants via the atomic function below.

-- Per-day counter columns on profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_search_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_search_date DATE;

-- Atomic "consume one search" for the daily cap. Row-locks the caller's profile
-- (FOR UPDATE) so concurrent calls cannot double-count or slip past the cap.
-- Resets the counter when the stored date is not today. Pro users always pass
-- and are not counted. Returns whether the search is allowed and the new count.
CREATE OR REPLACE FUNCTION public.consume_daily_search(p_user uuid, p_cap integer)
RETURNS TABLE(allowed boolean, used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur integer;
  d date;
  tier text;
BEGIN
  SELECT daily_search_count, daily_search_date, subscription_tier
    INTO cur, d, tier
    FROM public.profiles
    WHERE id = p_user
    FOR UPDATE;

  IF NOT FOUND THEN
    -- No profile row: treat as free, first search of the day.
    RETURN QUERY SELECT true, 1;
    RETURN;
  END IF;

  IF tier = 'pro' THEN
    RETURN QUERY SELECT true, COALESCE(cur, 0);
    RETURN;
  END IF;

  IF d IS DISTINCT FROM CURRENT_DATE THEN
    cur := 0;
  END IF;

  IF COALESCE(cur, 0) >= p_cap THEN
    RETURN QUERY SELECT false, COALESCE(cur, 0);
    RETURN;
  END IF;

  UPDATE public.profiles
    SET daily_search_count = COALESCE(cur, 0) + 1,
        daily_search_date = CURRENT_DATE
    WHERE id = p_user;

  RETURN QUERY SELECT true, COALESCE(cur, 0) + 1;
END;
$$;

-- Webhook idempotency: a repeated delivery of the same RevenueCat event must not
-- re-apply (and thus must not roll back to an older state). The webhook inserts
-- event_id here first; a duplicate insert (PK conflict) means "already handled".
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role (webhook) touches it; RLS-on + no policy
-- denies all anon/authenticated access by default.
