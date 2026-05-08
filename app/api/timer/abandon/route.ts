import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { blockId, duration, violation_count = 0, failed_reason = 'manual_abandon' } = body;

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
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
