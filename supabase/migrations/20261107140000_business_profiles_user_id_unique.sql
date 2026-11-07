-- One business profile per user (round 4, P1-1).
--
-- The app reads a user's profile as one row, and nothing in the database held that: a failed read on the home used to
-- open the Onboarding, whose save inserts, so a user could get a second row. Then .single() fails on the same user
-- with PGRST116, the same code as "no row", and the app asks for a profile again.
--
-- 0 users had more than one profile when this was written (live read, 2026-11-07). With a duplicate present this
-- statement fails and changes nothing: the duplicates have to be sorted out by hand, nothing is deleted here.
--
-- The unique index also serves every lookup the plain index served (the RLS policies), so that one goes.

CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_user_id_key ON public.business_profiles (user_id);
DROP INDEX IF EXISTS public.business_profiles_user_id_idx;
