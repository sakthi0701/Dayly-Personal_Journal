import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task_id, mode = 'pomodoro', strict_mode = false } = body;

    let validTaskId: string | null = null;
    if (task_id) {
      const { data: task } = await supabase
        .from('tasks')
        .select('id')
        .eq('id', task_id)
        .single();
      if (task) {
        validTaskId = task.id;
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
