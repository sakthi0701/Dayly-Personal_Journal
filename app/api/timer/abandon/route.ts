import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { blockId, duration, total_duration, violation_count = 0, failed_reason = 'manual_abandon' } = body;

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
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
