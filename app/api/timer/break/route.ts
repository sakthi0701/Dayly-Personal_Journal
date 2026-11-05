/**
 * app/api/timer/break/route.ts
 *
 * Schedules the Telegram "break over" ping as a one-off telegram_reminders row.
 * Delivered by /api/cron/reminders (pg_cron, every minute).
 *
 *   POST  { endsAt, taskTitle }      → create, returns { id }
 *   PATCH { id, endsAt | null }      → reschedule (pause/resume/extend) or cancel (null)
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { breakOverMessage } from '@/lib/remoteTimer';

export async function POST(request: Request) {
  try {
    const { endsAt, taskTitle = null } = await request.json();
    if (!endsAt) return NextResponse.json({ error: 'endsAt is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('telegram_reminders')
      .insert({ label: '☕ Break over', message: breakOverMessage(taskTitle), remind_at: endsAt, is_recurring: false, is_active: true })
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/timer/break]', err);
    return NextResponse.json({ error: 'Failed to schedule break alert' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, endsAt } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const update = endsAt ? { remind_at: endsAt, is_active: true } : { is_active: false };
    const { error } = await supabase.from('telegram_reminders').update(update).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ id });
  } catch (err) {
    console.error('[PATCH /api/timer/break]', err);
    return NextResponse.json({ error: 'Failed to update break alert' }, { status: 500 });
  }
}
