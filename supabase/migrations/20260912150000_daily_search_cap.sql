-- Daily free-search cost cap (owner decision 2026-09-12: search is free, but a
-- non-Pro user gets at most 20 matches/day; Pro is unlimited). Enforced
-- server-side in the match-grants function. Two columns on profiles track the
-- per-day counter; the function resets the count when the date rolls over.
-- subscription_tier already exists (free/pro) and is written by the RevenueCat
-- webhook; the generate-* functions gate on it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_search_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_search_date DATE;
