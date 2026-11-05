/**
 * lib/remoteTimer.ts  (server-only)
 *
 * Timers started from Telegram. The app's timer state lives in the browser, so the
 * bot writes the session to the single-row `remote_timer` table (supabase/remote_timer.sql)
 * and every open app adopts it via GET /api/timer/remote (see syncRemoteTimer in
 * lib/store/useTimerStore.ts).
 */

import { supabase } from '@/lib/supabase';

export interface NotToDoChip {
  label: string;
  emoji: string;
}

export interface RemoteTimerRow {
  session_id: string;
  kind: 'focus' | 'break';
  status: 'running' | 'ended';
  started_at: string;
  duration_seconds: number;
  block_id: string | null;
  task_id: string | null;
  task_title: string | null;
  strict_mode: boolean;
  not_to_do: NotToDoChip[];
  end_reminder_id: string | null;
}

/** Not-to-do chips the bot applies to a focus session (the app caps a session at 5). */
const BOT_NOT_TO_DO_LIMIT = 5;

export function breakOverMessage(taskTitle: string | null): string {
  return taskTitle
    ? `Back to *${taskTitle}* — start the next session now.`
    : 'Time to get back into deep work. What are you starting?';
}

export function elapsedSeconds(row: RemoteTimerRow, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(row.started_at).getTime()) / 1000));
}

/** Running and not yet past its end time. */
export function isLive(row: RemoteTimerRow | null): row is RemoteTimerRow {
  return !!row && row.status === 'running' && elapsedSeconds(row) < row.duration_seconds;
}

export async function getRemoteTimer(): Promise<RemoteTimerRow | null> {
  const { data, error } = await supabase.from('remote_timer').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return (data as RemoteTimerRow | null) ?? null;
}

/**
 * Same rule as /api/timer/abandon: under 20% of the planned time the block is deleted
 * so it doesn't pollute stats; otherwise it's kept as an incomplete session.
 */
export async function abandonTimeBlock(params: {
  blockId: string;
  duration: number | null;
  totalDuration: number | null;
  failedReason: string;
  violationCount?: number;
}): Promise<{ skipped?: boolean; deleted?: boolean }> {
  const { blockId, duration, totalDuration, failedReason, violationCount = 0 } = params;

  // Don't corrupt an already-completed block (stale blockId from another tab/device).
  const { data: existing } = await supabase.from('time_blocks').select('completed').eq('id', blockId).single();
  if (existing?.completed === true) return { skipped: true };

  const threshold = totalDuration ? totalDuration * 0.2 : 60; // 60s minimum for stopwatch
  if (duration == null || duration < threshold) {
    const { error } = await supabase.from('time_blocks').delete().eq('id', blockId);
    if (error) throw error;
    return { deleted: true };
  }

  const { error } = await supabase
    .from('time_blocks')
    .update({ end_time: new Date().toISOString(), duration, completed: false, violation_count: violationCount, failed_reason: failedReason })
    .eq('id', blockId);
  if (error) throw error;
  return {};
}

async function scheduleEndReminder(label: string, message: string, endsAt: Date): Promise<string> {
  const { data, error } = await supabase
    .from('telegram_reminders')
    .insert({ label, message, remind_at: endsAt.toISOString(), is_recurring: false, is_active: true })
    .select('id')
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function startRemoteTimer(params: {
  kind: 'focus' | 'break';
  minutes: number;
  /** tasks.id or pressure_tasks.id (the app's TimerTask.id) */
  taskId?: string | null;
  /** time_blocks.task_id FK only points to tasks — pressure sessions store null, like /api/timer/start */
  taskIsPressure?: boolean;
  taskTitle?: string | null;
}): Promise<RemoteTimerRow> {
  const { kind, minutes, taskId = null, taskIsPressure = false, taskTitle = null } = params;
  const durationSeconds = Math.round(minutes * 60);
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  let blockId: string | null = null;
  let notToDo: NotToDoChip[] = [];
  let endReminderId: string;

  if (kind === 'focus') {
    // Bot sessions use the top 5 not-to-dos with strict mode OFF (user's choice, 2026-11-05).
    const [{ data: items }, { data: block, error: blockError }] = await Promise.all([
      supabase.from('not_to_do_items').select('label, emoji').order('sort_order', { ascending: true }).limit(BOT_NOT_TO_DO_LIMIT),
      supabase
        .from('time_blocks')
        .insert({ task_id: taskIsPressure ? null : taskId, mode: 'pomodoro', strict_mode: false, start_time: startedAt.toISOString() })
        .select('id')
        .single(),
    ]);
    if (blockError) throw blockError;
    blockId = String(block.id);
    notToDo = (items ?? []).map((i) => ({ label: i.label, emoji: i.emoji ?? '🚫' }));
    endReminderId = await scheduleEndReminder(
      '🍅 Focus over',
      `${taskTitle ? `*${taskTitle}* — ` : ''}${minutes} min done. Open Dayly to review the session, then take a break.`,
      endsAt,
    );
  } else {
    // The app adopts this as its breakReminderId, so pause/extend/stop keep it in sync.
    endReminderId = await scheduleEndReminder('☕ Break over', breakOverMessage(taskTitle), endsAt);
  }

  const result: RemoteTimerRow = {
    session_id: crypto.randomUUID(),
    kind,
    status: 'running' as const,
    started_at: startedAt.toISOString(),
    duration_seconds: durationSeconds,
    block_id: blockId,
    task_id: taskId,
    task_title: taskTitle,
    strict_mode: false,
    not_to_do: notToDo,
    end_reminder_id: endReminderId,
  };
  const { error } = await supabase
    .from('remote_timer')
    .upsert({ id: 1, ...result, updated_at: startedAt.toISOString() });
  if (error) throw error;
  return result;
}

/**
 * Ends a remote session.
 *   source 'bot' — user said "stop" on Telegram: abandon the focus block like the app's Stop button.
 *   source 'app' — the app finished/abandoned the session itself and already saved the block.
 * Returns the ended row, or null if nothing matching was running.
 */
export async function endRemoteTimer(params: { sessionId?: string; source: 'bot' | 'app' }): Promise<RemoteTimerRow | null> {
  const row = await getRemoteTimer();
  if (!row || row.status !== 'running') return null;
  if (params.sessionId && row.session_id !== params.sessionId) return null;

  const live = isLive(row);

  if (params.source === 'bot') {
    if (row.kind === 'focus' && row.block_id && live) {
      await abandonTimeBlock({
        blockId: row.block_id,
        duration: elapsedSeconds(row),
        totalDuration: row.duration_seconds,
        failedReason: 'stopped_from_telegram',
      });
    }
  }

  // Ended early → the "timer over" ping is no longer true. For breaks adopted by the app
  // this is harmless: the app's own syncBreakAlert has already cancelled/kept it.
  if (live && row.end_reminder_id && (params.source === 'bot' || row.kind === 'focus')) {
    await supabase.from('telegram_reminders').update({ is_active: false }).eq('id', row.end_reminder_id);
  }

  const { error } = await supabase
    .from('remote_timer')
    .update({ status: 'ended', updated_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('session_id', row.session_id);
  if (error) throw error;

  return { ...row, status: 'ended' };
}
