/**
 * app/api/cron/reminders/route.ts
 *
 * Delivers due telegram_reminders: the agent's set_reminder tool and the
 * "break over" pings from the Focus page.
 *
 * Called by pg_cron every minute, but ONLY when a reminder is due — the SQL job
 * checks telegram_reminders first (see supabase/cron_tick.sql), so idle minutes
 * cost no Vercel invocation.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { saveHistory } from '@/lib/telegram-agent/pipeline';

export const dynamic = 'force-dynamic';

/** Reminders missed by more than this (e.g. cron was down) are not sent late */
const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const { data, error } = await supabase
    .from('telegram_reminders')
    .select('id, label, message, remind_at, is_recurring, recur_every_minutes')
    .eq('is_active', true)
    .lte('remind_at', new Date(now).toISOString());
  if (error) {
    console.error('[Reminders] Query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const r of data ?? []) {
    const at = new Date(r.remind_at).getTime();
    const missed = now - at > REMINDER_GRACE_MS;

    // Advance/deactivate BEFORE sending so an overlapping run can't send it twice
    const interval = (r.recur_every_minutes ?? 0) * 60_000;
    let update: Record<string, unknown>;
    if (r.is_recurring && interval > 0) {
      // Step forward past now so a long outage doesn't leave it permanently in the past
      let next = at + interval;
      while (next <= now) next += interval;
      update = { remind_at: new Date(next).toISOString() };
    } else {
      update = { is_active: false };
    }
    if (!missed) update.last_sent_at = new Date(now).toISOString();

    const { error: upErr } = await supabase.from('telegram_reminders').update(update).eq('id', r.id);
    if (upErr) {
      console.error(`[Reminders] Failed to update ${r.id} — not sending:`, upErr.message);
      continue;
    }
    if (missed) continue;

    const text = `🔔 *${r.label}*\n\n${r.message}`;
    if (await sendTelegramMessage(text)) {
      sent++;
      // Saved as assistant history so a reply ("ok starting now") has context
      await saveHistory('assistant', text);
    }
  }

  console.log(`[Reminders] due=${data?.length ?? 0} sent=${sent}`);
  return NextResponse.json({ ok: true, due: data?.length ?? 0, sent });
}
