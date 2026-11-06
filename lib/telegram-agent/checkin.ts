/**
 * lib/telegram-agent/checkin.ts
 *
 * Proactive accountability check-ins, triggered by /api/cron/tick.
 *
 * Builds a full picture of the day (pressure tasks, tasks, goals, habits, focus
 * sessions, recent chat) and asks gpt-oss-120b to write the message an
 * accountability partner would send. The message is saved to telegram_messages
 * so when the user replies, the normal agent pipeline knows what was asked.
 */

import Groq from 'groq-sdk';
import { supabase } from '@/lib/supabase';
import { getISTDateString, getTodayISTWindow } from './executor';
import { loadHistory } from './pipeline';
import { localHour, partOfDay } from '@/lib/utils/day';
import { searchMemories } from '@/lib/ai/memory';
import { EVIDENCE_MIN_SCORE, formatSourceDate, recentMemorySources, toMemorySources } from '@/lib/ai/memorySources';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TZ = 'Asia/Kolkata';

export type CheckInKind = 'morning' | 'checkin' | 'evening';

// ── Formatting helpers ─────────────────────────────────────────────────────────

const istDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const istTime = (d: Date) => d.toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const istDay = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' });

function hoursBetween(a: number, b: number): string {
  const h = Math.abs(b - a) / 3_600_000;
  return h < 1 ? `${Math.round(h * 60)}m` : `${Math.round(h)}h`;
}

/** Human description of a deadline relative to now. Handles "YYYY-MM-DD" and full timestamps. */
function describeDeadline(raw: string | null, today: string, now: Date): string {
  if (!raw) return 'no deadline';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (raw === today) return 'due TODAY';
    if (raw < today) return `OVERDUE since ${istDay(new Date(`${raw}T00:00:00+05:30`))}`;
    return `due ${istDay(new Date(`${raw}T00:00:00+05:30`))}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return `due ${raw}`;
  if (d.getTime() < now.getTime()) return `OVERDUE by ${hoursBetween(d.getTime(), now.getTime())} (was ${istDay(d)} ${istTime(d)})`;
  if (istDate(d) === today) return `due TODAY at ${istTime(d)} (in ${hoursBetween(now.getTime(), d.getTime())})`;
  return `due ${istDay(d)} ${istTime(d)}`;
}

// ── Context ────────────────────────────────────────────────────────────────────

export interface AccountabilityContext {
  text: string;
  /** A pomodoro is in progress — check-ins should not interrupt it */
  focusInProgress: boolean;
}

export async function buildAccountabilityContext(): Promise<AccountabilityContext> {
  const now = new Date();
  const today = getISTDateString();
  const { start, end } = getTodayISTWindow();
  const threeHoursAgo = new Date(now.getTime() - 3 * 3_600_000).toISOString();

  const [pressureRes, pressureDoneRes, tasksRes, tasksDoneRes, goalsRes, habitsRes, logsRes, blocksRes, activeRes, reviewsRes] =
    await Promise.all([
      supabase.from('pressure_tasks').select('title, priority, deadline, estimated_minutes, status')
        .in('status', ['todo', 'snoozed']).order('priority', { ascending: true }).limit(10),
      supabase.from('pressure_tasks').select('title').eq('status', 'done').gte('completed_at', start).lt('completed_at', end),
      supabase.from('tasks').select('title, priority, due_date, status, estimated_pomodoros, elapsed_pomodoros')
        .in('status', ['todo', 'in-progress']).is('parent_task_id', null).limit(25),
      supabase.from('tasks').select('title').eq('status', 'done').is('parent_task_id', null).gte('updated_at', start).lt('updated_at', end),
      supabase.from('goals').select('title, deadline, total_task_count, completed_task_count').neq('status', 'completed').limit(5),
      supabase.from('habits').select('id, name, icon, habit_type').limit(20),
      supabase.from('habit_logs').select('habit_id, status').gte('logged_at', start).lt('logged_at', end),
      supabase.from('time_blocks').select('duration').eq('completed', true).gte('created_at', start).lt('created_at', end),
      // Open block started recently = timer running (older open blocks are stale/abandoned tabs)
      supabase.from('time_blocks').select('id').is('end_time', null).gte('start_time', threeHoursAgo).limit(1),
      supabase.from('session_reviews').select('task_title, created_at').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }),
    ]);

  const lines: string[] = [];
  lines.push(`NOW: ${now.toLocaleString('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })} IST`);
  // Same bucket as the Overview greeting (lib/utils/day.ts) — the model mis-greeted 2:30 am as "evening".
  lines.push(`PART OF DAY: ${partOfDay(localHour(now, TZ))}`);

  // Pressure tasks — highest stakes first
  const pressure = pressureRes.data ?? [];
  lines.push('', 'PRESSURE TASKS (open, high-stakes):');
  if (pressure.length === 0) lines.push('- none');
  for (const t of pressure) {
    const est = t.estimated_minutes ? `, ~${t.estimated_minutes}m` : '';
    lines.push(`- "${t.title}" — ${describeDeadline(t.deadline, today, now)}, priority ${t.priority}${est}${t.status === 'snoozed' ? ', SNOOZED' : ''}`);
  }

  // Tasks — only what is due/overdue, plus a few undated ones
  const tasks = tasksRes.data ?? [];
  const dated = tasks.filter((t) => t.due_date && t.due_date <= today).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const undated = tasks.filter((t) => !t.due_date || t.due_date > today).slice(0, 5);
  lines.push('', 'TASKS DUE TODAY / OVERDUE:');
  if (dated.length === 0) lines.push('- none');
  for (const t of dated) {
    const pomo = t.estimated_pomodoros ? `, ${t.elapsed_pomodoros ?? 0}/${t.estimated_pomodoros} pomodoros` : '';
    lines.push(`- "${t.title}" — ${describeDeadline(t.due_date, today, now)}, ${t.status}${pomo}`);
  }
  if (undated.length) {
    lines.push('', 'OTHER OPEN TASKS:');
    for (const t of undated) lines.push(`- "${t.title}" (${t.due_date ? describeDeadline(t.due_date, today, now) : 'no date'})`);
  }

  // Goals
  const goals = goalsRes.data ?? [];
  if (goals.length) {
    lines.push('', 'ACTIVE GOALS:');
    for (const g of goals) {
      lines.push(`- "${g.title}" — ${g.completed_task_count ?? 0}/${g.total_task_count ?? 0} tasks done, ${describeDeadline(g.deadline, today, now)}`);
    }
  }

  // Habits
  const logByHabit = new Map((logsRes.data ?? []).map((l) => [l.habit_id, l.status]));
  const habits = habitsRes.data ?? [];
  lines.push('', 'HABITS TODAY:');
  for (const h of habits) {
    const kind = h.habit_type === 'bad' ? 'BAD habit to avoid' : 'good habit';
    lines.push(`- ${h.icon ?? ''} ${h.name} (${kind}): ${logByHabit.get(h.id) ?? 'not logged yet'}`);
  }

  // Execution so far today
  const blocks = blocksRes.data ?? [];
  const focusMins = Math.round(blocks.reduce((sum, b) => sum + (b.duration ?? 0), 0) / 60);
  const reviews = reviewsRes.data ?? [];
  const lastSession = reviews[0];
  lines.push('', 'EXECUTION TODAY:');
  lines.push(`- Focus sessions: ${blocks.length} (${focusMins} min total)`);
  if (lastSession) lines.push(`- Last session: "${lastSession.task_title ?? 'untitled'}" ended ${istTime(new Date(lastSession.created_at))}`);
  else lines.push('- No focus session yet today');
  const doneToday = [...(pressureDoneRes.data ?? []), ...(tasksDoneRes.data ?? [])].map((t) => `"${t.title}"`);
  lines.push(`- Completed today: ${doneToday.length ? doneToday.join(', ') : 'nothing yet'}`);

  // Journal memory — what they recently wrote + what they wrote about today's open items
  const focusTitles = [...pressure.slice(0, 3), ...dated.slice(0, 3), ...goals.slice(0, 2)].map((t) => t.title);
  lines.push(...(await journalSection(focusTitles)));

  return { text: lines.join('\n'), focusInProgress: (activeRes.data?.length ?? 0) > 0 };
}

async function journalSection(focusTitles: string[]): Promise<string[]> {
  try {
    const [recent, related] = await Promise.all([
      recentMemorySources(3, TZ, 5),
      focusTitles.length
        ? searchMemories(`What has the user written about: ${focusTitles.join('; ')}`, 8)
            .then((r) => toMemorySources(r.results, TZ))
            .then((all) => all.filter((m) => m.score >= EVIDENCE_MIN_SCORE))
        : Promise.resolve([]),
    ]);
    const seen = new Set(recent.map((m) => m.fact));
    const relatedOnly = related.filter((m) => !seen.has(m.fact)).slice(0, 4);
    if (!recent.length && !relatedOnly.length) return [];
    const fmt = (m: { date: string; fact: string }) => `- [${formatSourceDate(m.date)}] ${m.fact}`;
    return [
      '', 'FROM THEIR JOURNAL (their own words, dated; cite the date if you bring one up):',
      ...(recent.length ? ['Written in the last 3 days:', ...recent.map(fmt)] : []),
      ...(relatedOnly.length ? ["Related to today's open items:", ...relatedOnly.map(fmt)] : []),
    ];
  } catch (e) {
    // Memory is context, not a dependency: the check-in still runs on task data without it.
    console.error('[checkin] journal memory unavailable:', e);
    return [];
  }
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const KIND_BRIEF: Record<CheckInKind, string> = {
  morning:
    'MORNING KICKOFF. Pick the 2–3 things that genuinely matter today (pressure deadlines first). ' +
    'Ask them to commit: what do they start first, and by what time.',
  checkin:
    'MID-DAY CHECK-IN (sent every ~2 hours). Compare what they committed to / what is due against what actually got done. ' +
    'If they made a promise in the recent chat, follow up on THAT specifically. ' +
    'If nothing moved since the last check-in, say so plainly. Ask what they are doing right now and what they will finish next.',
  evening:
    'EVENING REVIEW. Name what got done and what slipped. For anything still open that was due today, ' +
    'make them decide: finish tonight, or reschedule to a specific time tomorrow. Ask one reflection question.',
};

function buildCheckInPrompt(kind: CheckInKind, context: string): string {
  return `You are the user's accountability partner, texting them on Telegram. You know their real data (below).
You are direct, warm, and specific — like a friend who actually checks if you did what you said. Never preachy, never generic.

${KIND_BRIEF[kind]}

THEIR DATA:
${context}

WRITING RULES:
- THEIR DATA is the live database and the only source of truth for what is open, done or due.
  Use the chat history only for what they said/promised — never list a task that is not in THEIR DATA.
- Reference real items by their exact name. Deadlines within the next few hours and OVERDUE items come first.
- Layout (Telegram, read on a phone):
  line 1: one short sentence — the honest read on where they stand.
  blank line
  2–4 bullet lines starting with "- ", one item each, with the key fact (deadline / time left / progress).
  blank line
  last line: ONE pointed question they can answer in a single reply.
- Use *bold* only for item names. No headers, no tables, no emoji spam (max 2).
- Under 90 words. No "Great job", no filler, no lecture.
- If BAD habits are listed, never ask whether they did them unless they already logged one.`;
}

// ── Generate ───────────────────────────────────────────────────────────────────

/** Plain template used when the LLM is unavailable — check-ins must still arrive. */
function fallbackMessage(kind: CheckInKind): string {
  if (kind === 'morning') return '☀️ Morning. What are the 2–3 things you must finish today, and which one starts first?';
  if (kind === 'evening') return '🌙 End of day. What got done, and what is moving to tomorrow — at what time?';
  return '⏱ Check-in: what have you been working on for the last two hours, and what do you finish next?';
}

export async function generateCheckIn(kind: CheckInKind, context: string): Promise<string> {
  const history = await loadHistory(6);

  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: buildCheckInPrompt(kind, context) },
        ...history.map((m) => ({ role: m.role, content: m.content }) as Groq.Chat.ChatCompletionMessageParam),
        { role: 'user', content: '[Scheduled check-in — write the message to send me now.]' },
      ],
      temperature: 0.6,
      max_tokens: 1200, // gpt-oss reasons before answering; a low cap can leave content empty
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
    console.warn('[CheckIn] LLM returned empty content — using fallback');
  } catch (err) {
    console.error('[CheckIn] LLM call failed — using fallback:', err);
  }
  return fallbackMessage(kind);
}
