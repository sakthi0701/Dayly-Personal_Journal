import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task_id, mode = 'pomodoro', strict_mode = false } = body;

    // Validate task_id against both tasks and pressure_tasks.
    // time_blocks.task_id FK only points to tasks, so pressure task sessions
    // always store task_id = null in the DB (same behaviour as the complete route).
    let validTaskId: string | null = null;
    if (task_id) {
      const { data: task } = await supabase
        .from('tasks')
        .select('id')
        .eq('id', task_id)
        .single();

      if (task) {
        validTaskId = task.id;
      } else {
        // Check pressure_tasks so we at least know the ID is valid.
        // FK constraint means we still store null, matching complete route behaviour.
        const { data: pt } = await supabase
          .from('pressure_tasks')
          .select('id')
          .eq('id', task_id)
          .single();
        if (!pt) {
          console.warn(`[timer/start] task_id ${task_id} not found in tasks or pressure_tasks`);
        }
        // validTaskId stays null — pressure tasks are tracked by title only
      }
    }

    const { data: block, error } = await supabase
      .from('time_blocks')
      .insert({
        task_id: validTaskId,
        mode,
        strict_mode,
        start_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ blockId: block.id, block }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/timer/start]', err);
    return NextResponse.json({ error: 'Failed to start timer session' }, { status: 500 });
  }
}
