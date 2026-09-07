import { useMemo } from 'react';
import { ActionPlan, ActionTask } from '../types/database';

export function usePlanStats(visiblePlans: ActionPlan[], tasks: Record<string, ActionTask[]>) {
  return useMemo(() => {
    const stats: Record<
      string,
      { totalTasks: number; completedTasks: number; progress: number; percentage: number }
    > = {};
    for (let i = 0; i < visiblePlans.length; i++) {
      const plan = visiblePlans[i];
      const planTasks = tasks[plan.id];
      let totalTasks = 0;
      let completedTasks = 0;

      if (planTasks) {
        totalTasks = planTasks.length;
        for (let j = 0; j < totalTasks; j++) {
          if (planTasks[j].status === 'done') {
            completedTasks++;
          }
        }
      }

      const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;
      const percentage = Math.round(progress * 100);

      stats[plan.id] = { totalTasks, completedTasks, progress, percentage };
    }
    return stats;
  }, [visiblePlans, tasks]);
}
