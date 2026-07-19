import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { blockId, duration, total_duration, violation_count = 0, failed_reason = 'manual_abandon' } = body;

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
    }

    // BUG-5 guard: don't corrupt an already-completed block.
    // This happens when localStorage restores a stale blockId that was already
    // completed (e.g., via another tab/device) and the store calls abandonTimer().
    const { data: existing } = await supabase
      .from('time_blocks')
      .select('completed')
      .eq('id', blockId)
      .single();

    if (existing?.completed === true) {
      console.warn(`[timer/abandon] block ${blockId} already completed — skipping abandon`);
      return NextResponse.json({ success: true, skipped: true, reason: 'already_completed' });
    }

    // Delete the block if duration is falsy or less than 20% of the total timer
    const threshold = total_duration ? total_duration * 0.2 : 60; // 60s minimum for stopwatch
    if (duration == null || duration < threshold) {
      const { error } = await supabase
        .from('time_blocks')
        .delete()
        .eq('id', blockId);
      
      if (error) throw error;
      return NextResponse.json({ success: true, deleted: true });
    }

    const end_time = new Date().toISOString();

    const { error } = await supabase
      .from('time_blocks')
      .update({
        end_time,
        duration,
        completed: false,
        violation_count,
        failed_reason,
      })
      .eq('id', blockId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/timer/abandon]', err);
    return NextResponse.json({ error: 'Failed to abandon timer session' }, { status: 500 });
  }
}

