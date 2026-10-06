/**
 * lib/telegram-agent/executor.ts
 *
 * Executes tool calls from the Tier 1 router against Supabase.
 * Uses 70%+ fuzzy matching for habit/task name resolution.
 * All DB writes include IST-aware timestamps.
 */

import { supabase } from '@/lib/supabase';
import { updateUserStatsOnEntry } from '@/lib/gamification';
import { getUserStats, calculateLevel } from '@/lib/gamification';
import type { ToolName } from './tools';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  function: {
    name: ToolName;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  tool_name: ToolName;
  success: boolean;
  data: Record<string, unknown>;
  /** Human-readable summary for the Tier 2 responder */
  summary: string;
}

// ── IST timestamp helper ───────────────────────────────────────────────────────

/** Returns the current IST date string for day-boundary queries */
function getISTDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

/** Converts a user-provided IST datetime string to a UTC ISO string for storage */
function istToUtc(istString: string): string {
  // istString is like "2026-10-05T14:00:00" — treat as IST (UTC+5:30)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const localDate = new Date(istString);
  const utcDate = new Date(localDate.getTime() - istOffsetMs);
  return utcDate.toISOString();
}

/** IST window for "today" — returns UTC ISO strings for Supabase range queries */
function getTodayISTWindow(): { start: string; end: string } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const midnightIST = new Date(nowIST);
  midnightIST.setUTCHours(0, 0, 0, 0);
  const start = new Date(midnightIST.getTime() - IST_OFFSET_MS).toISOString();
  const end = new Date(midnightIST.getTime() + 24 * 60 * 60 * 1000 - IST_OFFSET_MS).toISOString();
  return { start, end };
}

// ── Fuzzy matching ─────────────────────────────────────────────────────────────

/**
 * Dice coefficient similarity using character bigrams.
 * Returns 0.0–1.0. Threshold for auto-match: 0.70
 */
function similarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const bigrams = (s: string): Set<string> => {
    const bg = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
    return bg;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  const intersection = [...ba].filter((x) => bb.has(x)).length;
  const union = ba.size + bb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function bestMatch<T extends { name?: string; title?: string; label?: string }>(
  query: string,
  items: T[],
  threshold = 0.70
): T | null {
  let best: T | null = null;
  let bestScore = threshold - 0.001;
  for (const item of items) {
    const name = item.name ?? item.title ?? item.label ?? '';
    const score = similarity(query, name);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

// ── Tool implementations ───────────────────────────────────────────────────────

async function execLogHabit(args: { habit_name: string; status: 'success' | 'failed' | 'skipped' }): Promise<ToolResult['data'] & { summary: string }> {
  const { start, end } = getTodayISTWindow();

  // Fetch all habits for fuzzy matching
  const { data: habits } = await supabase.from('habits').select('id, name, icon');
  if (!habits?.length) return { matched: false, summary: 'No habits found in the app.' };

  const match = bestMatch(args.habit_name, habits);
  if (!match) {
    return {
      matched: false,
      queried: args.habit_name,
      summary: `Could not find a habit matching "${args.habit_name}" with 70%+ confidence.`,
    };
  }

  // Check if already logged today
  const { data: existing } = await supabase
    .from('habit_logs')
    .select('id, status')
    .eq('habit_id', match.id)
    .gte('logged_at', start)
    .lt('logged_at', end)
    .limit(1);

  if (existing?.length) {
    return {
      matched: true,
      habit_name: match.name,
      status: args.status,
      already_logged: true,
      previous_status: existing[0].status,
      summary: `"${match.icon} ${match.name}" was already logged today as ${existing[0].status}.`,
    };
  }

  const { error } = await supabase.from('habit_logs').insert({
    habit_id: match.id,
    status: args.status,
    logged_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  return {
    matched: true,
    habit_name: match.name,
    habit_icon: match.icon,
    status: args.status,
    summary: `Logged "${match.icon ?? '✨'} ${match.name}" as ${args.status} today.`,
  };
}

async function execCompleteTask(args: { task_name: string }): Promise<ToolResult['data'] & { summary: string }> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, elapsed_pomodoros, estimated_pomodoros')
    .in('status', ['todo', 'in-progress'])
    .is('parent_task_id', null);

  const match = bestMatch(args.task_name, tasks ?? []);
  if (!match) {
    return {
      matched: false,
      summary: `Could not find a task matching "${args.task_name}".`,
    };
  }

  await supabase.from('tasks').update({ status: 'done' }).eq('id', match.id);

  return {
    matched: true,
    task_title: match.title,
    pomodoros: `${match.elapsed_pomodoros ?? 0}/${match.estimated_pomodoros ?? '?'}`,
    summary: `Task "${match.title}" marked as done (${match.elapsed_pomodoros ?? 0}/${match.estimated_pomodoros ?? '?'} 🍅).`,
  };
}

async function execCompletePressureTask(args: { task_name: string }): Promise<ToolResult['data'] & { summary: string }> {
  const { data: tasks } = await supabase
    .from('pressure_tasks')
    .select('id, title, priority')
    .in('status', ['todo', 'snoozed']);

  const match = bestMatch(args.task_name, tasks ?? []);
  if (!match) {
    // Fallback: try regular tasks
    return execCompleteTask(args);
  }

  await supabase.from('pressure_tasks').update({ status: 'done' }).eq('id', match.id);

  return {
    matched: true,
    task_title: match.title,
    summary: `Pressure task "${match.title}" marked as done! ✅`,
  };
}

async function execAddTask(args: { title: string; due_date?: string; priority?: string }): Promise<ToolResult['data'] & { summary: string }> {
  const { data: lastTask } = await supabase
    .from('tasks')
    .select('position')
    .is('parent_task_id', null)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = (lastTask?.position ?? -1) + 1;

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title: args.title.trim(),
      priority: args.priority ?? 'none',
      due_date: args.due_date ?? null,
      position,
    })
    .select('id, title')
    .single();

  if (error) throw new Error(error.message);

  return {
    task_title: task.title,
    due_date: args.due_date ?? null,
    priority: args.priority ?? 'none',
    summary: `Task "${task.title}" added${args.due_date ? ` (due ${args.due_date})` : ''}.`,
  };
}

async function execAddPressureTask(args: { title: string; deadline?: string; priority?: number }): Promise<ToolResult['data'] & { summary: string }> {
  const { data: task, error } = await supabase
    .from('pressure_tasks')
    .insert({
      title: args.title.trim(),
      priority: args.priority ?? 2,
      deadline: args.deadline ?? null,
      status: 'todo',
    })
    .select('id, title')
    .single();

  if (error) throw new Error(error.message);

  return {
    task_title: task.title,
    deadline: args.deadline ?? null,
    summary: `Pressure task "${task.title}" added${args.deadline ? ` (deadline: ${args.deadline})` : ''}.`,
  };
}

async function execLogHabits(args: { habits: Array<{ habit_name: string; status: 'success' | 'failed' | 'skipped' }> }) {
  const summaries: string[] = [];
  const results = [];
  for (const h of args.habits) {
    const res = await execLogHabit(h);
    summaries.push(res.summary);
    results.push(res);
  }
  return { results, summary: summaries.join(' | ') };
}

async function execCompleteTasks(args: { tasks: Array<{ task_name: string }> }) {
  const summaries: string[] = [];
  const results = [];
  for (const t of args.tasks) {
    const res = await execCompleteTask(t);
    summaries.push(res.summary);
    results.push(res);
  }
  return { results, summary: summaries.join(' | ') };
}

async function execCompletePressureTasks(args: { tasks: Array<{ task_name: string }> }) {
  const summaries: string[] = [];
  const results = [];
  for (const t of args.tasks) {
    const res = await execCompletePressureTask(t);
    summaries.push(res.summary);
    results.push(res);
  }
  return { results, summary: summaries.join(' | ') };
}

async function execAddTasks(args: { tasks: Array<{ title: string; due_date?: string; priority?: string }> }) {
  const summaries: string[] = [];
  const results = [];
  for (const t of args.tasks) {
    const res = await execAddTask(t);
    summaries.push(res.summary);
    results.push(res);
  }
  return { results, summary: summaries.join(' | ') };
}

async function execAddPressureTasks(args: { tasks: Array<{ title: string; deadline?: string; priority?: number }> }) {
  const summaries: string[] = [];
  const results = [];
  for (const t of args.tasks) {
    const res = await execAddPressureTask(t);
    summaries.push(res.summary);
    results.push(res);
  }
  return { results, summary: summaries.join(' | ') };
}

async function execGetStats(): Promise<ToolResult['data'] & { summary: string }> {
  const stats = await getUserStats();
  if (!stats) return { summary: 'Could not fetch stats.' };

  const levelData = calculateLevel(stats.xp);
  const { start, end } = getTodayISTWindow();

  const { data: todayBlocks } = await supabase
    .from('time_blocks')
    .select('duration, completed')
    .gte('created_at', start)
    .lt('created_at', end);

  const todayMins = Math.round(
    (todayBlocks ?? []).filter((b) => b.completed && b.duration > 0).reduce((s, b) => s + b.duration, 0) / 60
  );

  return {
    level: levelData.level,
    level_title: levelData.title,
    xp: stats.xp,
    progress_percent: levelData.progressPercent,
    streak_days: stats.streak_days ?? 0,
    focus_today_mins: todayMins,
    summary: `Level ${levelData.level} (${levelData.title}) | ${stats.xp} XP | ${stats.streak_days ?? 0}-day streak | ${todayMins}min focus today.`,
  };
}

async function execSetReminder(args: {
  label: string;
  message: string;
  remind_at_ist: string;
  is_recurring?: boolean;
  recur_every_minutes?: number;
}): Promise<ToolResult['data'] & { summary: string }> {
  const remindAtUtc = istToUtc(args.remind_at_ist);

  const { data, error } = await supabase
    .from('telegram_reminders')
    .insert({
      label: args.label,
      message: args.message,
      remind_at: remindAtUtc,
      is_recurring: args.is_recurring ?? false,
      recur_every_minutes: args.recur_every_minutes ?? null,
    })
    .select('id, label, remind_at')
    .single();

  if (error) throw new Error(error.message);

  const recurrenceStr = args.is_recurring && args.recur_every_minutes
    ? ` (repeating every ${args.recur_every_minutes === 1440 ? 'day' : args.recur_every_minutes === 10080 ? 'week' : `${args.recur_every_minutes} min`})`
    : '';

  return {
    id: data.id,
    label: data.label,
    remind_at_ist: args.remind_at_ist,
    is_recurring: args.is_recurring ?? false,
    summary: `Reminder "${args.label}" set for ${args.remind_at_ist} IST${recurrenceStr}.`,
  };
}

async function execListReminders(): Promise<ToolResult['data'] & { summary: string }> {
  const { data: reminders } = await supabase
    .from('telegram_reminders')
    .select('id, label, message, remind_at, is_recurring, recur_every_minutes')
    .eq('is_active', true)
    .order('remind_at', { ascending: true })
    .limit(10);

  if (!reminders?.length) return { count: 0, summary: 'No active reminders.' };

  const list = reminders.map((r) => {
    const istDate = new Date(r.remind_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });
    const recur = r.is_recurring && r.recur_every_minutes
      ? ` (every ${r.recur_every_minutes === 1440 ? 'day' : r.recur_every_minutes === 10080 ? 'week' : `${r.recur_every_minutes}m`})`
      : '';
    return { label: r.label, message: r.message, fire_at: istDate + recur };
  });

  return {
    count: list.length,
    reminders: list,
    summary: `${list.length} active reminder(s): ${list.map((r) => `"${r.label}" at ${r.fire_at}`).join('; ')}.`,
  };
}

async function execDeleteReminder(args: { label: string }): Promise<ToolResult['data'] & { summary: string }> {
  const { data: reminders } = await supabase
    .from('telegram_reminders')
    .select('id, label')
    .eq('is_active', true);

  const match = bestMatch(args.label, reminders ?? []);
  if (!match) {
    return { matched: false, summary: `No active reminder matching "${args.label}".` };
  }

  await supabase.from('telegram_reminders').update({ is_active: false }).eq('id', match.id);

  return {
    matched: true,
    label: match.label,
    summary: `Reminder "${match.label}" deleted.`,
  };
}

// ── Main executor ──────────────────────────────────────────────────────────────

export async function executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const call of toolCalls) {
    const name = call.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      results.push({
        tool_call_id: call.id,
        tool_name: name,
        success: false,
        data: {},
        summary: `Failed to parse arguments for ${name}.`,
      });
      continue;
    }

    try {
      let data: ToolResult['data'] & { summary: string };

      switch (name) {
        case 'log_habits':
          data = await execLogHabits(args as Parameters<typeof execLogHabits>[0]);
          break;
        case 'complete_tasks':
          data = await execCompleteTasks(args as Parameters<typeof execCompleteTasks>[0]);
          break;
        case 'complete_pressure_tasks':
          data = await execCompletePressureTasks(args as Parameters<typeof execCompletePressureTasks>[0]);
          break;
        case 'add_tasks':
          data = await execAddTasks(args as Parameters<typeof execAddTasks>[0]);
          break;
        case 'add_pressure_tasks':
          data = await execAddPressureTasks(args as Parameters<typeof execAddPressureTasks>[0]);
          break;
        case 'log_journal':
          // Journal content is returned to pipeline.ts which handles the Mem0 + embedding flow
          data = { content: args.content, summary: `Journal logged: "${String(args.content).slice(0, 60)}..."` };
          break;
        case 'get_stats':
          data = await execGetStats();
          break;
        case 'set_reminder':
          data = await execSetReminder(args as Parameters<typeof execSetReminder>[0]);
          break;
        case 'list_reminders':
          data = await execListReminders();
          break;
        case 'delete_reminder':
          data = await execDeleteReminder(args as Parameters<typeof execDeleteReminder>[0]);
          break;
        default:
          data = { summary: `Unknown tool: ${name}` };
      }

      const { summary, ...rest } = data;
      results.push({ tool_call_id: call.id, tool_name: name, success: true, data: rest, summary });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Executor] Tool ${name} failed:`, err);
      results.push({
        tool_call_id: call.id,
        tool_name: name,
        success: false,
        data: {},
        summary: `Tool ${name} failed: ${msg}`,
      });
    }
  }

  return results;
}

// ── Context snapshot (injected into Tier 1 system prompt) ─────────────────────

export interface ActiveSnapshot {
  habitsRemaining: string[];
  habitsCompleted: string[];
  topTasks: string[];
  topPressure: string[];
}

export async function buildActiveSnapshot(): Promise<ActiveSnapshot> {
  const { start, end } = getTodayISTWindow();
  const today = getISTDateString();

  const [habitsRes, logsRes, tasksRes, pressureRes] = await Promise.all([
    supabase.from('habits').select('id, name, icon, habit_type').limit(20),
    supabase.from('habit_logs').select('habit_id, status').gte('logged_at', start).lt('logged_at', end),
    supabase.from('tasks').select('title, priority, status').in('status', ['todo', 'in-progress']).is('parent_task_id', null).order('priority', { ascending: false }).limit(5),
    supabase.from('pressure_tasks').select('title, priority, deadline, status').in('status', ['todo', 'snoozed']).order('priority', { ascending: true }).limit(5),
  ]);

  const doneToday = new Set((logsRes.data ?? []).filter((l) => l.status === 'success').map((l) => l.habit_id));
  const habits = habitsRes.data ?? [];

  const formatHabit = (h: any) => `${h.habit_type === 'bad' ? '[BAD]' : '[GOOD]'} ${h.icon ?? '✨'} ${h.name}`;

  const habitsCompleted = habits.filter((h) => doneToday.has(h.id)).map(formatHabit);
  const habitsRemaining = habits.filter((h) => !doneToday.has(h.id)).map(formatHabit);

  const topTasks = (tasksRes.data ?? []).map((t) => `"${t.title}" (${t.status})`);
  const topPressure = (pressureRes.data ?? []).map((t) => {
    const urgency = t.priority <= 1 ? '🔴' : t.priority <= 2 ? '🟠' : '🟡';
    const deadline = t.deadline ? ` due ${new Date(t.deadline).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}` : '';
    return `${urgency} "${t.title}"${deadline}`;
  });

  return { habitsRemaining, habitsCompleted, topTasks, topPressure };
}
