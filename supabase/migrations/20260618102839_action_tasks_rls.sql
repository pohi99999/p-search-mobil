-- Biztonság (RLS) és Adatbázis Finomhangolás az action_tasks táblára

-- Biztonságos ellenőrzés a DROP POLICY és ALTER TABLE utasításokra
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'action_tasks') THEN
    DROP POLICY IF EXISTS "Users can view tasks for their plans" ON public.action_tasks;
    DROP POLICY IF EXISTS "Users can insert tasks for their plans" ON public.action_tasks;
    DROP POLICY IF EXISTS "Users can update tasks for their plans" ON public.action_tasks;
    DROP POLICY IF EXISTS "Users can delete tasks for their plans" ON public.action_tasks;
    
    DROP POLICY IF EXISTS "Users can view tasks for their own plans" ON public.action_tasks;
    DROP POLICY IF EXISTS "Users can insert tasks for their own plans" ON public.action_tasks;
    DROP POLICY IF EXISTS "Users can update tasks for their own plans" ON public.action_tasks;
    DROP POLICY IF EXISTS "Users can delete tasks for their own plans" ON public.action_tasks;

    ALTER TABLE public.action_tasks ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Új, szigorúbb RLS policy-k beállítása
-- Csak a saját (vagy saját céghez tartozó) feladatokat olvashatja a felhasználó
CREATE POLICY "Users can view tasks for their own plans" ON public.action_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.action_plans
    WHERE public.action_plans.id = public.action_tasks.plan_id
    AND public.action_plans.business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (select auth.uid())
    )
  )
);

-- Csak a saját (vagy saját céghez tartozó) feladatokat hozhatja létre a felhasználó
CREATE POLICY "Users can insert tasks for their own plans" ON public.action_tasks
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.action_plans
    WHERE public.action_plans.id = plan_id
    AND public.action_plans.business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (select auth.uid())
    )
  )
);

-- Csak a saját (vagy saját céghez tartozó) feladatokat módosíthatja a felhasználó
CREATE POLICY "Users can update tasks for their own plans" ON public.action_tasks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.action_plans
    WHERE public.action_plans.id = public.action_tasks.plan_id
    AND public.action_plans.business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (select auth.uid())
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.action_plans
    WHERE public.action_plans.id = public.action_tasks.plan_id
    AND public.action_plans.business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (select auth.uid())
    )
  )
);

-- Csak a saját (vagy saját céghez tartozó) feladatokat törölheti a felhasználó
CREATE POLICY "Users can delete tasks for their own plans" ON public.action_tasks
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.action_plans
    WHERE public.action_plans.id = public.action_tasks.plan_id
    AND public.action_plans.business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (select auth.uid())
    )
  )
);

-- Teljesítmény indexek létrehozása a policy-kben használt oszlopokra
CREATE INDEX IF NOT EXISTS action_tasks_plan_id_idx ON public.action_tasks(plan_id);
CREATE INDEX IF NOT EXISTS action_plans_business_profile_id_idx ON public.action_plans(business_profile_id);
CREATE INDEX IF NOT EXISTS business_profiles_user_id_idx ON public.business_profiles(user_id);
