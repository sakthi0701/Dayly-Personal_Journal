import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const [tasksResult, timeBlocksResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('status, estimated_pomodoros, elapsed_pomodoros')
        .is('parent_task_id', null), // top-level tasks only

      // Phase 8 table — may not exist yet, handled gracefully
      supabase
        .from('time_blocks')
        .select('duration, completed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const tasks = tasksResult.data ?? [];
    const blocks = timeBlocksResult.data ?? [];

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in-progress').length;

    const totalEstimatedPomodoros = tasks.reduce((s, t) => s + (t.estimated_pomodoros ?? 0), 0);
    const estimatedMinutes = totalEstimatedPomodoros * 25;

    // Phase 8 data (0 until time_blocks table is created)
    const elapsedSeconds = blocks
      .filter((b) => b.completed)
      .reduce((s, b) => s + (b.duration ?? 0), 0);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    return NextResponse.json({
      totalTasks,
      doneTasks,
      inProgressTasks,
      todoTasks: totalTasks - doneTasks - inProgressTasks,
      estimatedMinutes,
      elapsedMinutes,
      totalEstimatedPomodoros,
    });
  } catch (err) {
    console.error('[GET /api/stats/dashboard]', err);
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 });
  }
}
