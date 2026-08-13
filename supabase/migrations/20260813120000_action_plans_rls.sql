-- =============================================================
-- Migration: Add RLS policies to action_plans
-- Reason: action_plans had RLS enabled but zero policies, meaning
-- no data could ever be returned via the Data API to real users
-- (confirmed live: "No data will be returned via the Data API as
-- no RLS policies exist on this table"). action_tasks already has
-- an equivalent ownership-scoped policy set (see
-- 20260618102839_action_tasks_rls.sql) via business_profiles.
-- Date: 2026-08-13
-- =============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'action_plans') THEN
    DROP POLICY IF EXISTS "Users can view their own action plans" ON public.action_plans;
    DROP POLICY IF EXISTS "Users can insert their own action plans" ON public.action_plans;
    DROP POLICY IF EXISTS "Users can update their own action plans" ON public.action_plans;
    DROP POLICY IF EXISTS "Users can delete their own action plans" ON public.action_plans;

    ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Csak a saját céghez tartozó akcióterveket olvashatja a felhasználó
CREATE POLICY "Users can view their own action plans" ON public.action_plans
FOR SELECT
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles
    WHERE user_id = (select auth.uid())
  )
);

-- Csak a saját céghez tartozó akcióterveket hozhatja létre a felhasználó
CREATE POLICY "Users can insert their own action plans" ON public.action_plans
FOR INSERT
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles
    WHERE user_id = (select auth.uid())
  )
);

-- Csak a saját céghez tartozó akcióterveket módosíthatja a felhasználó
CREATE POLICY "Users can update their own action plans" ON public.action_plans
FOR UPDATE
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles
    WHERE user_id = (select auth.uid())
  )
)
WITH CHECK (
  business_profile_id IN (
    SELECT id FROM public.business_profiles
    WHERE user_id = (select auth.uid())
  )
);

-- Csak a saját céghez tartozó akcióterveket törölheti a felhasználó
CREATE POLICY "Users can delete their own action plans" ON public.action_plans
FOR DELETE
USING (
  business_profile_id IN (
    SELECT id FROM public.business_profiles
    WHERE user_id = (select auth.uid())
  )
);
