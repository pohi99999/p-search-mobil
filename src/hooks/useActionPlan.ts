import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ActionPlan, ActionTask, ActionTaskStatus } from '../types/database';

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
        .select('*')
        .eq('business_profile_id', businessProfileId)
        .order('created_at', { ascending: false });

      if (plansError) throw plansError;

      if (plansData && plansData.length > 0) {
        setPlans(plansData);

        // 2. Lekérdezzük a feladatokat az összes tervhez
        const planIds = plansData.map(p => p.id);
        const { data: tasksData, error: tasksError } = await supabase
          .from('action_tasks')
          .select('*')
          .in('plan_id', planIds)
          .order('order_index', { ascending: true });

        if (tasksError) throw tasksError;

        // Csoportosítjuk a feladatokat plan_id szerint
        const tasksMap: Record<string, ActionTask[]> = {};
        planIds.forEach(id => {
          tasksMap[id] = [];
        });
        
        if (tasksData) {
          tasksData.forEach((task: ActionTask) => {
            if (tasksMap[task.plan_id]) {
              tasksMap[task.plan_id].push(task);
            }
          });
        }
        setTasks(tasksMap);
      } else {
        setPlans([]);
        setTasks({});
      }
    } catch (err: any) {
      setError(err.message || 'Hiba történt az akciótervek betöltése során.');
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
    } catch (err: any) {
      setError(err.message || 'Nem sikerült frissíteni a feladat állapotát.');
      throw err;
    }
  };

  useEffect(() => {
    fetchPlansAndTasks();
  }, [fetchPlansAndTasks]);

  const generatePlanForMatch = async (businessProfileId: string, matchId: string) => {
    setLoading(true);
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
    } catch (err: any) {
      setError(err.message || 'Nem sikerült legenerálni az akciótervet.');
      throw err;
    } finally {
      setLoading(false);
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
