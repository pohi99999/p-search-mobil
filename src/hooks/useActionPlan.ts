import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ActionPlan, ActionTask, ActionTaskStatus } from '../types/database';
import { getErrorMessage } from '../utils/error';

export const useActionPlan = (businessProfileId?: string) => {
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [tasks, setTasks] = useState<Record<string, ActionTask[]>>({}); // planId -> tasks[]
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlansAndTasks = useCallback(async () => {
    if (!businessProfileId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Lekérdezzük az akcióterveket a cégprofilhoz
      const { data: plansData, error: plansError } = await supabase
        .from('action_plans')
        .select('*, action_tasks(*)')
        .eq('business_profile_id', businessProfileId)
        .order('created_at', { ascending: false })
        .order('order_index', { referencedTable: 'action_tasks', ascending: true });

      if (plansError) throw plansError;

      if (plansData && plansData.length > 0) {
        const { parsedPlans, tasksMap } = plansData.reduce(
          (acc, planRow) => {
            const { action_tasks, ...plan } = planRow as ActionPlan & { action_tasks: ActionTask[] | null };
            acc.parsedPlans.push(plan);
            acc.tasksMap[plan.id] = action_tasks || [];
            return acc;
          },
          { parsedPlans: [] as ActionPlan[], tasksMap: {} as Record<string, ActionTask[]> }
        );

        setPlans(parsedPlans);
        setTasks(tasksMap);
      } else {
        setPlans([]);
        setTasks({});
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Hiba történt az akciótervek betöltése során.');
    } finally {
      setLoading(false);
    }
  }, [businessProfileId]);

  const updateTaskStatus = useCallback(async (taskId: string, planId: string, newStatus: ActionTaskStatus) => {
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('action_tasks')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', taskId);

      if (updateError) throw updateError;

      // Helyi állapot frissítése a gyorsabb UX érdekében
      setTasks((prev: Record<string, ActionTask[]>) => {
        const planTasks = prev[planId] || [];
        const updatedTasks = planTasks.map((t: ActionTask) =>
          t.id === taskId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t
        );
        return {
          ...prev,
          [planId]: updatedTasks
        };
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Nem sikerült frissíteni a feladat állapotát.');
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchPlansAndTasks();
  }, [fetchPlansAndTasks]);

  const generatePlanForMatch = useCallback(async (businessProfileId: string, matchId: string | string[]) => {
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('generate-action-plan', {
        body: { business_profile_id: businessProfileId, match_ids: Array.isArray(matchId) ? matchId : [matchId], match_id: Array.isArray(matchId) ? matchId[0] : matchId }
      });

      if (invokeError) {
        // Pro-gate: a 403 {code:'pro_required'} means this is a Pro feature. Read
        // the server's Hungarian message and surface a typed error so the screen
        // can route to the Paywall instead of showing a generic failure.
        const status = (invokeError as { context?: { status?: number } })?.context?.status;
        if (status === 403) {
          let serverMessage = '';
          try {
            const ctx = (invokeError as { context?: { json?: () => Promise<{ code?: string; error?: string }> } }).context;
            const body = ctx?.json ? await ctx.json() : {};
            serverMessage = body?.error ?? '';
          } catch { /* fall through */ }
          const msg = serverMessage || 'A Copilot akcióterv a Pro csomag része. Válts Pro-ra a használatához.';
          setError(msg);
          const proErr = new Error(msg) as Error & { proRequired?: boolean };
          proErr.proRequired = true;
          throw proErr;
        }
        throw invokeError;
      }
      if (data?.error) throw new Error(data.error);

      // Frissítjük a terveket és feladatokat
      await fetchPlansAndTasks();
      return data;
    } catch (err: unknown) {
      if (!(err as { proRequired?: boolean })?.proRequired) {
        setError(getErrorMessage(err) || 'Nem sikerült legenerálni az akciótervet.');
      }
      throw err;
    }
  }, [fetchPlansAndTasks]);

  return {
    plans,
    tasks,
    loading,
    error,
    refetch: fetchPlansAndTasks,
    updateTaskStatus,
    generatePlanForMatch
  };
};