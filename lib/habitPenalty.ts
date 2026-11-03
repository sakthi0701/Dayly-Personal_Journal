/**
 * lib/habitPenalty.ts
 *
 * Weekly habit settlement: charges coins for each check-in short of a good
 * habit's weekly goal and for each failed day of a bad habit, over the last
 * completed Mon–Sun week in IST.
 *
 * Idempotent: each habit-week is one coin_transactions row keyed
 * (source 'habit_week', ref `${habitId}:${weekStart}`), so repeated cron ticks
 * cannot charge twice. Weeks with no miss write no row, which is also how the
 * consecutive-miss multiplier resets.
 */

import { supabase } from '@/lib/supabase';
import { applyCoinTx, COIN_RULES } from '@/lib/gamification';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface HabitRow {
  id: string;
  name: string;
  icon: string | null;
  habit_type: 'good' | 'bad' | null;
  frequency: { weekly_goal?: number } | null;
  created_at: string;
}

export interface HabitPenalty {
  habitId: string;
  name: string;
  amount: number;      // coins charged (negative), before any shield
  missed: number;
  missStreak: number;
  shielded: boolean;
  reason: string;
}

const istDate = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

/** UTC ms of Monday 00:00 IST for the week containing `now` */
export function istWeekStart(now = Date.now()): number {
  const ist = new Date(now + IST_OFFSET_MS);
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7;
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMonday) - IST_OFFSET_MS;
}

export async function settleLastHabitWeek(dryRun = false): Promise<HabitPenalty[]> {
  const weekEnd = istWeekStart();
  const weekStart = weekEnd - 7 * DAY_MS;
  const weekKey = istDate(weekStart);
  const prevWeekKey = istDate(weekStart - 7 * DAY_MS);

  const { data: habitData, error: habitErr } = await supabase
    .from('habits')
    .select('id, name, icon, habit_type, frequency, created_at');
  if (habitErr) throw habitErr;

  // Only full weeks: a habit created mid-week is not judged on that week
  const habits = ((habitData ?? []) as HabitRow[]).filter((h) => Date.parse(h.created_at) <= weekStart);
  if (habits.length === 0) return [];

  const refs = habits.flatMap((h) => [`${h.id}:${weekKey}`, `${h.id}:${prevWeekKey}`]);
  const [ledgerRes, logsRes] = await Promise.all([
    supabase.from('coin_transactions').select('ref_id, meta').eq('source', 'habit_week').in('ref_id', refs),
    // logged_at is a DATE column holding the IST day: filter by IST date strings.
    // Passing UTC timestamps here truncates them and silently drops Sunday's logs.
    supabase.from('habit_logs').select('habit_id, status, logged_at')
      .gte('logged_at', weekKey)
      .lt('logged_at', istDate(weekEnd)),
  ]);
  if (ledgerRes.error) throw ledgerRes.error;
  if (logsRes.error) throw logsRes.error;

  const ledger = new Map((ledgerRes.data ?? []).map((r) => [r.ref_id as string, r.meta as { missStreak?: number }]));
  const logs = logsRes.data ?? [];

  const results: HabitPenalty[] = [];

  for (const habit of habits) {
    const refId = `${habit.id}:${weekKey}`;
    if (ledger.has(refId)) continue; // already settled

    // Distinct IST days per status (web and Telegram can both log the same day)
    const days = (status: string) => new Set(
      logs.filter((l) => l.habit_id === habit.id && l.status === status)
        .map((l) => String(l.logged_at).slice(0, 10))
    );

    let missed: number;
    let label: string;
    let perMiss: number;

    if (habit.habit_type === 'bad') {
      missed = days('failed').size;
      perMiss = COIN_RULES.failPenalty;
      label = `${habit.name} slipped ${missed}×`;
    } else {
      // Default of 3 matches HabitTracker's display default
      const goal = habit.frequency?.weekly_goal ?? 3;
      const success = days('success');
      const skips = [...days('skipped')].filter((d) => !success.has(d)).length;
      const required = Math.max(0, goal - Math.min(skips, COIN_RULES.maxExcusedSkips));
      missed = Math.max(0, required - success.size);
      perMiss = COIN_RULES.missPenalty;
      label = `Missed ${habit.name}: ${success.size}/${goal}`;
    }

    if (missed === 0) continue;

    const missStreak = (ledger.get(`${habit.id}:${prevWeekKey}`)?.missStreak ?? 0) + 1;
    const multipliers = COIN_RULES.missStreakMultiplier;
    const multiplier = multipliers[Math.min(missStreak, multipliers.length) - 1];
    const amount = -Math.round(missed * perMiss * multiplier);
    const reason = multiplier > 1 ? `${label} (×${multiplier}, ${missStreak} weeks running)` : label;

    let shielded = false;
    if (!dryRun) {
      const res = await applyCoinTx({
        amount,
        source: 'habit_week',
        refId,
        reason,
        meta: { habitId: habit.id, weekStart: weekKey, missed, missStreak, multiplier },
        shieldable: true,
      });
      if (!res.ok) continue; // duplicate from a concurrent tick
      shielded = !!res.shielded;
    }

    results.push({ habitId: habit.id, name: habit.name, amount, missed, missStreak, shielded, reason });
  }

  return results;
}
