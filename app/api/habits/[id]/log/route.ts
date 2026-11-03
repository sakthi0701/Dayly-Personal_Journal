import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getISTDateString } from '@/lib/telegram-agent/executor';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: habitId } = await params;
    const body = await request.json();
    const { status = 'success' } = body;

    // Validate status
    if (!['success', 'failed', 'skipped'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // IST calendar date, not UTC: a UTC date files logs made before 05:30 IST under
    // the previous day, which the weekly habit penalty would then count as a miss.
    // Do not revert to toISOString().
    const today = getISTDateString();

    // Upsert so re-logging on the same day updates the status rather than erroring
    const { data: log, error } = await supabase
      .from('habit_logs')
      .upsert(
        {
          habit_id: habitId,
          status,
          logged_at: today,
        },
        { onConflict: 'habit_id,logged_at' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ log }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/habits/[id]/log]', err);
    return NextResponse.json({ error: 'Failed to log habit' }, { status: 500 });
  }
}
