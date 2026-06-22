-- Biztonság (RLS) és Adatbázis Finomhangolás az action_tasks táblára

-- Töröljük a meglévő RLS policy-kat az action_tasks táblán, ha vannak
DROP POLICY IF EXISTS "Users can view tasks for their plans" ON public.action_tasks;
DROP POLICY IF EXISTS "Users can insert tasks for their plans" ON public.action_tasks;
DROP POLICY IF EXISTS "Users can update tasks for their plans" ON public.action_tasks;
DROP POLICY IF EXISTS "Users can delete tasks for their plans" ON public.action_tasks;

-- Biztosítjuk, hogy az RLS be legyen kapcsolva
ALTER TABLE public.action_tasks ENABLE ROW LEVEL SECURITY;

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
      WHERE user_id = auth.uid()
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
      WHERE user_id = auth.uid()
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
      WHERE user_id = auth.uid()
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
      WHERE user_id = auth.uid()
    )
  )
);
