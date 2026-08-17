-- =============================================================================
-- P-Search Mobil — Scheduling + Matching hardening
--
-- Context (verified against the live project icextvgecinmhrhjtfcm on
-- 2026-08-17 via the PostgREST OpenAPI document):
--
--   1. `profiles.search_count` DOES NOT EXIST in production, yet the
--      `increment-search-count` Edge Function selects and updates it. Every
--      free user therefore hit "Hiba történt a keresési limit ellenőrzésekor!"
--      when pressing the primary "Új AI Keresés" button — the main call to
--      action was dead for the entire free tier.
--
--   2. `grant_matches` contained 0 rows because nothing in the system ever
--      wrote to it. The scheduled scan introduced alongside this migration is
--      the first producer, so the table needs a de-duplication key and an
--      INSERT policy.
--
--   3. `profiles.search_frequency` exists but nothing read it and no
--      constraint bounded its values. Scheduling state is added here.
--
-- Every statement is written to be idempotent so the migration can be applied
-- to the drifted production database as well as to a fresh one.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Restore the missing free-tier search counter
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS search_count INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. Per-user scan scheduling state
--
-- `next_scan_at` is the single column the scheduler reads. Storing the due
-- timestamp (rather than recomputing it from last_scan_at + frequency on every
-- run) keeps the scheduler query a simple, index-backed range scan.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS next_scan_at TIMESTAMP WITH TIME ZONE;

-- Normalise any pre-existing values before the CHECK constraint is applied,
-- otherwise adding the constraint would fail on legacy rows.
UPDATE public.profiles
   SET search_frequency = 'weekly'
 WHERE search_frequency IS NULL
    OR search_frequency NOT IN ('daily', 'weekly', 'manual');

ALTER TABLE public.profiles
  ALTER COLUMN search_frequency SET DEFAULT 'weekly';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_search_frequency_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_search_frequency_check
      CHECK (search_frequency IN ('daily', 'weekly', 'manual'));
  END IF;
END $$;

-- Users who have never been scheduled become due immediately, so enabling the
-- feature does not require waiting a full cycle for the first scan.
UPDATE public.profiles
   SET next_scan_at = timezone('utc', now())
 WHERE next_scan_at IS NULL
   AND search_frequency <> 'manual';

-- Partial index: the scheduler only ever asks for rows that are actually due,
-- so 'manual' users are kept out of the index entirely.
CREATE INDEX IF NOT EXISTS idx_profiles_next_scan_at
  ON public.profiles (next_scan_at)
  WHERE search_frequency <> 'manual';

-- -----------------------------------------------------------------------------
-- 3. Make `grant_matches` safe for repeated automated scans
--
-- Without a uniqueness key, every scheduled run would re-insert the same
-- (business, grant) pair and the home screen would fill with duplicates.
-- Existing duplicates are collapsed first (keeping the highest score) so the
-- unique index can be created.
-- -----------------------------------------------------------------------------
DELETE FROM public.grant_matches a
      USING public.grant_matches b
      WHERE a.business_id = b.business_id
        AND a.grant_id    = b.grant_id
        AND (a.match_score, a.created_at, a.id) < (b.match_score, b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_matches_business_grant_unique
  ON public.grant_matches (business_id, grant_id);

CREATE INDEX IF NOT EXISTS idx_grant_matches_business_id
  ON public.grant_matches (business_id);

CREATE INDEX IF NOT EXISTS idx_grant_matches_grant_id
  ON public.grant_matches (grant_id);

-- The original hand-run schema granted SELECT and UPDATE on grant_matches but
-- never INSERT or DELETE, so a user could not dismiss a match and no
-- user-context insert was possible. Policies are recreated with the
-- `(select auth.uid())` form used by the rest of the migrations, which lets
-- Postgres evaluate the uid once per statement instead of once per row.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view matches for their business" ON public.grant_matches;
  DROP POLICY IF EXISTS "Users can update matches for their business" ON public.grant_matches;
  DROP POLICY IF EXISTS "Users can insert matches for their business" ON public.grant_matches;
  DROP POLICY IF EXISTS "Users can delete matches for their business" ON public.grant_matches;
END $$;

ALTER TABLE public.grant_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view matches for their business"
  ON public.grant_matches FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.business_profiles WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert matches for their business"
  ON public.grant_matches FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.business_profiles WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update matches for their business"
  ON public.grant_matches FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM public.business_profiles WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.business_profiles WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete matches for their business"
  ON public.grant_matches FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM public.business_profiles WHERE user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Guarantee a `profiles` row exists for every auth user
--
-- `useHomeData.handleNewSearch` aborts with "Felhasználói profil nem található!"
-- when the row is missing, and `increment-search-count` throws on `.single()`.
-- A trigger removes the dependency on rows being created by hand.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, subscription_tier, search_frequency, search_count, next_scan_at)
  VALUES (NEW.id, 'free', 'weekly', 0, timezone('utc', now()))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any auth users that predate the trigger.
INSERT INTO public.profiles (id, subscription_tier, search_frequency, search_count, next_scan_at)
SELECT u.id, 'free', 'weekly', 0, timezone('utc', now())
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL
    ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Index supporting the semantic-match read path
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_grant_chunks_grant_id
  ON public.grant_chunks (grant_id);
