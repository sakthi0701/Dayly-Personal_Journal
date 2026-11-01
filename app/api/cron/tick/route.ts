/**
 * app/api/cron/tick/route.ts
 *
 * Called every 30 minutes by Supabase pg_cron (see supabase/cron_tick.sql).
 * Replaces the AWS Lambda (telegram-lambda/smart_deadline_cron.py): all logic now
 * lives here so it shares the bot's Supabase client, Groq calls and formatting.
 *
 * Per tick (IST slots :00 / :30):
 *   07:00                         → LLM morning kickoff
 *   09,11,13,15,17,19:00          → LLM accountability check-in (skipped mid-pomodoro)
 *   21:00                         → LLM evening review
 *   every tick                    → pressure tasks due in ~1h, due telegram_reminders
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Testing: POST /api/cron/tick?dry=1&kind=checkin → returns the message, sends nothing.
 */

import { NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { saveHistory } from '@/lib/telegram-agent/pipeline';
import { buildAccountabilityContext, generateCheckIn, type CheckInKind } from '@/lib/telegram-agent/checkin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLOT_MS = 30 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const CHECKIN_HOURS = [9, 11, 13, 15, 17, 19];
/** Reminders missed by more than this (e.g. cron was down) are not sent late */
const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;

function kindForSlot(istHour: number, istMinute: number): CheckInKind | null {
  if (istMinute !== 0) return null;
  if (istHour === 7) return 'morning';
  if (istHour === 21) return 'evening';
  if (CHECKIN_HOURS.includes(istHour)) return 'checkin';
  return null;
}

// ── Pressure deadline heads-up ────────────────────────────────────────────────

async function deadlineAlert(slotStart: number): Promise<string | null> {
  // Warn when a timestamped deadline falls 60–90 min out: one alert per task, with time to act
  const from = new Date(slotStart + 2 * SLOT_MS).toISOString();
  const to = new Date(slotStart + 3 * SLOT_MS).toISOString();

  const { data, error } = await supabase
    .from('pressure_tasks')
    .select('title, deadline, estimated_minutes')
    .in('status', ['todo', 'snoozed'])
    .gte('deadline', from)
    .lt('deadline', to);
  if (error) console.error('[Cron] Deadline query failed:', error.message);

  // Date-only deadlines ("YYYY-MM-DD") are covered by the morning/evening LLM messages
  const due = (data ?? []).filter((t) => t.deadline && t.deadline.length > 10);
  if (due.length === 0) return null;

  const lines = due.map((t) => {
    const time = new Date(t.deadline!).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
    const est = t.estimated_minutes ? ` · needs ~${t.estimated_minutes}m` : '';
    return `- *${t.title}* — due ${time}${est}`;
  });
  return `⏰ *Deadline in about an hour*\n\n${lines.join('\n')}\n\nAre you on it right now?`;
}

// ── Dynamic reminders (created by the agent's set_reminder tool) ─────────────

async function dueReminders(slotEnd: number, now: number): Promise<string[]> {
  const { data, error } = await supabase
    .from('telegram_reminders')
    .select('id, label, message, remind_at, is_recurring, recur_every_minutes')
    .eq('is_active', true)
    .lt('remind_at', new Date(slotEnd).toISOString());
  if (error) console.error('[Cron] Reminder query failed:', error.message);

  const messages: string[] = [];
  for (const r of data ?? []) {
    const at = new Date(r.remind_at).getTime();
    const missed = now - at > REMINDER_GRACE_MS;
    if (!missed) messages.push(`🔔 *${r.label}*\n\n${r.message}`);

    const interval = (r.recur_every_minutes ?? 0) * 60_000;
    let update: Record<string, unknown>;
    if (r.is_recurring && interval > 0) {
      // Step forward past now so a long outage doesn't leave it permanently in the past
      let next = at + interval;
      while (next <= now) next += interval;
      update = { remind_at: new Date(next).toISOString(), last_sent_at: missed ? undefined : new Date(now).toISOString() };
    } else {
      update = { is_active: false, last_sent_at: missed ? undefined : new Date(now).toISOString() };
    }
    const { error: upErr } = await supabase.from('telegram_reminders').update(update).eq('id', r.id);
    if (upErr) console.error(`[Cron] Failed to update reminder ${r.id}:`, upErr.message);
  }
  return messages;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const forcedKind = url.searchParams.get('kind') as CheckInKind | null;

  const now = Date.now();
  const slotStart = Math.floor(now / SLOT_MS) * SLOT_MS; // IST is +5:30, so UTC and IST slots align
  const slotEnd = slotStart + SLOT_MS;
  const ist = new Date(slotStart + IST_OFFSET_MS);
  const kind = forcedKind ?? kindForSlot(ist.getUTCHours(), ist.getUTCMinutes());
  const slotLabel = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')} IST`;

  const run = async () => {
    const outgoing: string[] = [];
    let skipped: string | null = null;

    if (kind) {
      const ctx = await buildAccountabilityContext();
      if (kind === 'checkin' && ctx.focusInProgress && !forcedKind) {
        skipped = 'focus session in progress';
      } else {
        outgoing.push(await generateCheckIn(kind, ctx.text));
      }
    }

    const alert = await deadlineAlert(slotStart);
    if (alert) outgoing.push(alert);
    if (!dryRun) outgoing.push(...(await dueReminders(slotEnd, now)));

    if (!dryRun) {
      for (const text of outgoing) {
        await sendTelegramMessage(text);
        // Saved as assistant history so the agent knows what it asked when the user replies
        await saveHistory('assistant', text);
      }
    }

    console.log(`[Cron] ${slotLabel} kind=${kind ?? '-'} sent=${dryRun ? 0 : outgoing.length}${skipped ? ` skipped=${skipped}` : ''}`);
    return { slot: slotLabel, kind, skipped, dryRun, messages: outgoing };
  };

  if (dryRun) return NextResponse.json(await run());

  // Acknowledge immediately; the LLM call can outlast pg_net's HTTP timeout
  after(async () => {
    try {
      await run();
    } catch (err) {
      console.error('[Cron] Tick failed:', err);
    }
  });
  return NextResponse.json({ ok: true, slot: slotLabel, kind }, { status: 202 });
}
