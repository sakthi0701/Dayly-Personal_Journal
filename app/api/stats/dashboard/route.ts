import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { summarizeTasks } from '@/lib/stats/tasks';
import { localDateStr, normalizeTimeZone } from '@/lib/utils/day';

export const dynamic = 'force-dynamic';

/** GET /api/stats/dashboard?tz=<IANA zone> — task counts are computed for the user's local day. */
export async function GET(request: Request) {
  try {
    const timeZone = normalizeTimeZone(new URL(request.url).searchParams.get('tz'));

    const [tasksResult, timeBlocksResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('status, due_date, parent_task_id, estimated_pomodoros, elapsed_pomodoros')
        .is('parent_task_id', null), // top-level tasks only

      supabase
        .from('time_blocks')
        .select('duration, completed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const tasks = tasksResult.data ?? [];
    const blocks = timeBlocksResult.data ?? [];

    const summary = summarizeTasks(tasks, localDateStr(new Date(), timeZone));
    const inProgressTasks = tasks.filter((t) => t.status === 'in-progress').length;

    const totalEstimatedPomodoros = tasks.reduce((s, t) => s + (t.estimated_pomodoros ?? 0), 0);
    const estimatedMinutes = totalEstimatedPomodoros * 25;

    const elapsedSeconds = blocks
      .filter((b) => b.completed)
      .reduce((s, b) => s + (b.duration ?? 0), 0);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    return NextResponse.json({
      totalTasks: summary.total,
      doneTasks: summary.done,
      inProgressTasks,
      todoTasks: summary.open - inProgressTasks,
      summary,
      estimatedMinutes,
      elapsedMinutes,
      totalEstimatedPomodoros,
    });
  } catch (err) {
    console.error('[GET /api/stats/dashboard]', err);
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 });
  }
}
