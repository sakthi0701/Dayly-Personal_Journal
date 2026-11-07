/**
 * Shared task counts. Every screen that says "N due today" / "N overdue" / "X of Y done"
 * (Overview, Action header, Jarvis chat + advice) must derive it from summarizeTasks with the
 * user's local date — previously each screen counted differently and they disagreed.
 */
import { daysBetween } from '@/lib/utils/day';

export interface TaskLike {
  status: string;
  due_date: string | null;
  parent_task_id?: string | null;
}

export interface TaskSummary {
  total: number;     // top-level tasks
  done: number;
  open: number;
  dueToday: number;  // open, due on the user's local today
  overdue: number;   // open, due before the user's local today
}

/** Days until a task/goal date relative to the user's local today (negative = overdue). */
export function daysUntil(dateStr: string, todayStr: string): number {
  return daysBetween(todayStr, dateStr);
}

export function summarizeTasks(tasks: TaskLike[], todayStr: string): TaskSummary {
  const top = tasks.filter((t) => !t.parent_task_id);
  const open = top.filter((t) => t.status !== 'done');
  const due = (t: TaskLike) => (t.due_date ? daysUntil(t.due_date, todayStr) : null);
  return {
    total: top.length,
    done: top.length - open.length,
    open: open.length,
    dueToday: open.filter((t) => due(t) === 0).length,
    overdue: open.filter((t) => { const d = due(t); return d !== null && d < 0; }).length,
  };
}
