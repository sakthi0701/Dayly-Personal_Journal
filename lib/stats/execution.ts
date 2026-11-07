/**
 * The execution data Jarvis reasons over (chat + advice). One builder so both routes — and the
 * screens they get compared against — use the same definitions:
 *   tasks.*            → summarizeTasks, same as the Action header and Overview
 *   goals              → enrichGoal, same % and countdown as the goal cards
 *   pomodoros          → focus blocks, explicitly NOT tasks (Jarvis used to call "6 of 13
 *                        pomodoros" "6 of 13 tasks")
 * Each claim-worthy number carries its denominator so the model can cite evidence.
 */
import { supabase } from '@/lib/supabase';
import { localDateStr } from '@/lib/utils/day';
import { summarizeTasks, type TaskSummary } from './tasks';
import { enrichGoal } from './goals';

export interface ExecutionSummary {
  today: string;                 // user's local YYYY-MM-DD
  tasks: TaskSummary;
  pomodorosEstimated7d: number;  // on tasks touched in the last 7 days
  pomodorosCompleted7d: number;
  tasksTouched7d: number;
  goalLinkedTasks7d: number;     // of tasksTouched7d, how many are linked to a goal
  strictFailed: number;
  strictTotal: number;
  goalsSummary: string;
  failedHabitsSummary: string;
  distractionsSummary: string;
}

export async function buildExecutionSummary(timeZone: string): Promise<ExecutionSummary> {
  const now = new Date();
  const today = localDateStr(now, timeZone);
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const sevenDaysAgoDate = localDateStr(new Date(now.getTime() - 7 * 86_400_000), timeZone);

  const [allTasksRes, recentTasksRes, strictRes, goalsRes, habitLogsRes, reviewsRes] = await Promise.all([
    supabase.from('tasks').select('status, due_date, parent_task_id'),
    supabase.from('tasks').select('estimated_pomodoros, elapsed_pomodoros, goal_id').gte('updated_at', sevenDaysAgoIso),
    supabase.from('time_blocks').select('failed_reason').eq('strict_mode', true).gte('created_at', sevenDaysAgoIso),
    supabase.from('goals').select('title, deadline, total_task_count, completed_task_count').eq('status', 'active'),
    // logged_at is a local calendar date (YYYY-MM-DD)
    supabase.from('habit_logs').select('habit_id, logged_at, status, habits(name)').gte('logged_at', sevenDaysAgoDate),
    supabase.from('session_reviews').select('triggered_distractions').gte('created_at', sevenDaysAgoIso),
  ]);

  const recent = recentTasksRes.data ?? [];
  const strict = strictRes.data ?? [];

  // Goals — same numbers as the goal cards
  const goals = (goalsRes.data ?? []).map((g) => enrichGoal(g, today, timeZone));
  const goalsSummary = goals.length === 0
    ? 'No active goals.'
    : goals.map((g) => {
        const when = g.days_remaining === null ? 'no deadline'
          : g.days_remaining < 0 ? `${-g.days_remaining} days OVERDUE`
          : g.days_remaining === 0 ? 'due today'
          : `${g.days_remaining} days left`;
        return `"${g.title}" — ${g.progress_pct}% of its tasks done, ${when}`;
      }).join('; ');

  // Habits: only claim decay with the count it rests on
  const byHabit = new Map<string, { name: string; logs: { date: string; failed: boolean }[] }>();
  for (const log of habitLogsRes.data ?? []) {
    const name = (log.habits as unknown as { name: string } | null)?.name ?? 'Unknown habit';
    const h = byHabit.get(log.habit_id) ?? { name, logs: [] };
    h.logs.push({ date: String(log.logged_at).slice(0, 10), failed: log.status === 'failed' || log.status === 'skipped' });
    byHabit.set(log.habit_id, h);
  }
  const decayed: string[] = [];
  for (const h of byHabit.values()) {
    const sorted = h.logs.sort((a, b) => a.date.localeCompare(b.date));
    const fails = sorted.filter((l) => l.failed).length;
    let run = 0, maxRun = 0;
    for (const l of sorted) { run = l.failed ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
    if (maxRun >= 2 || fails >= 3) decayed.push(`"${h.name}" failed ${fails} of ${sorted.length} logged days in the last 7 days`);
  }

  // Distraction triggers
  const counts = new Map<string, number>();
  for (const r of reviewsRes.data ?? []) {
    const list = Array.isArray(r.triggered_distractions) ? r.triggered_distractions : [];
    for (const d of list as { label?: string }[]) if (d?.label) counts.set(d.label, (counts.get(d.label) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, c]) => `${l} (${c}×)`).join(', ');

  return {
    today,
    tasks: summarizeTasks(allTasksRes.data ?? [], today),
    pomodorosEstimated7d: recent.reduce((s, t) => s + (t.estimated_pomodoros ?? 0), 0),
    pomodorosCompleted7d: recent.reduce((s, t) => s + (t.elapsed_pomodoros ?? 0), 0),
    tasksTouched7d: recent.length,
    goalLinkedTasks7d: recent.filter((t) => t.goal_id).length,
    strictFailed: strict.filter((b) => b.failed_reason).length,
    strictTotal: strict.length,
    goalsSummary,
    failedHabitsSummary: decayed.length ? decayed.join('; ') : 'No habit decay detected.',
    distractionsSummary: top ? `Frequent distraction triggers (last 7 days): ${top}` : 'No distraction triggers recorded.',
  };
}
