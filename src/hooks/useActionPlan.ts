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
        .order('created_at', { ascending: false });

      if (plansError) throw plansError;

      if (plansData && plansData.length > 0) {
        const parsedPlans: ActionPlan[] = [];
        const tasksMap: Record<string, ActionTask[]> = {};

        for (const planRow of plansData) {
          const { action_tasks, ...plan } = planRow as any;
          parsedPlans.push(plan);

          const tasks = (action_tasks || []) as ActionTask[];
          // Sort tasks locally by order_index
          tasks.sort((a, b) => a.order_index - b.order_index);
          tasksMap[plan.id] = tasks;
        }

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

  const updateTaskStatus = async (taskId: string, planId: string, newStatus: ActionTaskStatus) => {
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('action_tasks')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', taskId);

      if (updateError) throw updateError;

      // Helyi állapot frissítése a gyorsabb UX érdekében
      setTasks(prev => {
        const planTasks = prev[planId] || [];
        const updatedTasks = planTasks.map(t => 
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
  };

  useEffect(() => {
    fetchPlansAndTasks();
  }, [fetchPlansAndTasks]);

  const generatePlanForMatch = async (businessProfileId: string, matchId: string) => {
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('generate-action-plan', {
        body: { business_profile_id: businessProfileId, match_id: matchId }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      // Frissítjük a terveket és feladatokat
      await fetchPlansAndTasks();
      return data;
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Nem sikerült legenerálni az akciótervet.');
      throw err;
    }
  };

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