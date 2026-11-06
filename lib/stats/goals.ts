/**
 * Shared goal progress + countdown. Used by /api/goals (goal cards, Overview) AND the Sensei
 * execution summary, so "80% complete, 80 days overdue" is the same number everywhere.
 */
import { toLocalDateStr } from '@/lib/utils/day';
import { daysUntil } from './tasks';

export interface GoalRow {
  deadline: string | null;
  total_task_count?: number | null;
  completed_task_count?: number | null;
}

export function enrichGoal<G extends GoalRow>(g: G, todayStr: string, tz: string) {
  // Stored counters: incremented on task create/done, never decremented on delete,
  // so progress survives task cleanup.
  const total = g.total_task_count ?? 0;
  const completed = g.completed_task_count ?? 0;
  const progress_pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const days_remaining = g.deadline ? daysUntil(toLocalDateStr(g.deadline, tz), todayStr) : null;
  return { ...g, progress_pct, days_remaining };
}
