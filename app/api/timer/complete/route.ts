import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addXP } from '@/lib/gamification';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { blockId, duration, task_id } = body;

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
    }

    // Check idempotency: If already completed, do nothing
    const { data: existingBlock } = await supabase
      .from('time_blocks')
      .select('completed')
      .eq('id', blockId)
      .single();

    if (existingBlock?.completed) {
      return NextResponse.json({ success: true, message: 'Already completed' });
    }

    const end_time = new Date().toISOString();

    // Mark the block as completed
    const { error: blockError } = await supabase
      .from('time_blocks')
      .update({ end_time, duration, completed: true })
      .eq('id', blockId);

    if (blockError) throw blockError;

    // Increment elapsed_pomodoros on the linked task if mode was pomodoro
    if (task_id) {
      const { data: task } = await supabase
        .from('tasks')
        .select('elapsed_pomodoros')
        .eq('id', task_id)
        .single();

      if (task) {
        await supabase
          .from('tasks')
          .update({ elapsed_pomodoros: (task.elapsed_pomodoros ?? 0) + 1 })
          .eq('id', task_id);
      }
    }

    // Grant XP for completing a focus session — fire-and-forget
    await addXP(30);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/timer/complete]', err);
    return NextResponse.json({ error: 'Failed to complete timer session' }, { status: 500 });
  }
}
