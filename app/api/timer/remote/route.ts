/**
 * app/api/timer/remote/route.ts
 *
 * Timers started from Telegram (see lib/remoteTimer.ts).
 *
 *   GET                    → { timer: { ...row, elapsed_seconds, task_pomodoros } | null }
 *                            elapsed is computed server-side so device clock skew can't shift it.
 *   POST { session_id }    → the app finished/abandoned an adopted session; mark it ended
 *                            so the bot knows nothing is running.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getRemoteTimer, endRemoteTimer, elapsedSeconds } from '@/lib/remoteTimer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const row = await getRemoteTimer();
    if (!row) return NextResponse.json({ timer: null });

    // Real tasks carry pomodoro counts so the app's break prompt shows "2/4" like normal sessions
    let taskPomodoros: { estimated: number; elapsed: number } | null = null;
    if (row.task_id) {
      const { data } = await supabase.from('tasks').select('estimated_pomodoros, elapsed_pomodoros').eq('id', row.task_id).maybeSingle();
      if (data) taskPomodoros = { estimated: data.estimated_pomodoros ?? 0, elapsed: data.elapsed_pomodoros ?? 0 };
    }

    return NextResponse.json({ timer: { ...row, elapsed_seconds: elapsedSeconds(row), task_pomodoros: taskPomodoros } });
  } catch (err) {
    console.error('[GET /api/timer/remote]', err);
    return NextResponse.json({ error: 'Failed to load remote timer' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { session_id } = await request.json();
    if (!session_id) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    const ended = await endRemoteTimer({ sessionId: session_id, source: 'app' });
    return NextResponse.json({ ended: !!ended });
  } catch (err) {
    console.error('[POST /api/timer/remote]', err);
    return NextResponse.json({ error: 'Failed to end remote timer' }, { status: 500 });
  }
}
