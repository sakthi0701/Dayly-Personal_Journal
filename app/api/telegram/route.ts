import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mem0 } from '@/lib/ai/memory';
import { generateEmbedding } from '@/lib/embeddings';
import { sendTelegramMessage } from '@/lib/telegram';
import { generateGoDeeperQuestion, generateTelegramResponse } from '@/lib/ai/groq';
import { updateUserStatsOnEntry, getUserStats, calculateLevel } from '@/lib/gamification';
import { stripHtml } from '@/lib/utils/text';
import { toRelativeDate } from '@/lib/utils/date';


export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

function isAuthorized(chatId: number): boolean {
  const allowedId = process.env.TELEGRAM_CHAT_ID;
  return allowedId ? String(chatId) === String(allowedId) : false;
}

// ─── IST helpers ─────────────────────────────────────────────────────────────

function getTodayISTWindow(): { start: string; end: string } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const midnightIST = new Date(nowIST);
  midnightIST.setUTCHours(0, 0, 0, 0);
  const start = new Date(midnightIST.getTime() - IST_OFFSET_MS).toISOString();
  const end = new Date(midnightIST.getTime() + 24 * 60 * 60 * 1000 - IST_OFFSET_MS).toISOString();
  return { start, end };
}

function getTimeIST(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

// ─── Command handlers ─────────────────────────────────────────────────────────

/**
 * /journal <text>  — save a journal entry (appends to today's, runs AI)
 * Free text (no command) also triggers this.
 */
async function handleJournal(text: string, chatId: number): Promise<string> {
  const cleanMessage = text.trim();
  if (!cleanMessage) return '❌ Please provide journal content after /journal';

  const { start, end } = getTodayISTWindow();
  const timeIST = getTimeIST();

  // Find or create today's plain-text entry
  const { data: todayEntries } = await supabase
    .from('entries')
    .select('id, content')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  const existingEntry = (todayEntries ?? []).find(
    (e) => e.content && !e.content.trimStart().startsWith('<')
  ) ?? null;

  let entryId: string;
  let fullContent: string;

  if (existingEntry) {
    fullContent = `${existingEntry.content}\n\n${timeIST} · ${cleanMessage}`;
    const { error } = await supabase
      .from('entries')
      .update({ content: fullContent })
      .eq('id', existingEntry.id);
    if (error) throw new Error(`DB update failed: ${error.message}`);
    entryId = existingEntry.id;
  } else {
    fullContent = `${timeIST} · ${cleanMessage}`;
    const { data: newEntry, error } = await supabase
      .from('entries')
      .insert({ content: fullContent, created_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) throw new Error(`DB insert failed: ${error.message}`);
    entryId = newEntry.id;
    try { await updateUserStatsOnEntry(); } catch (e) {
      console.error('[Telegram] Stats update failed:', e);
    }
  }

  // Background: embed + Mem0
  (async () => {
    try {
      const embedding = await generateEmbedding(fullContent);
      await supabase.from('entries').update({ embedding }).eq('id', entryId);
    } catch (e) { console.error('[Telegram] Embedding failed:', e); }
    try {
      await mem0.add(cleanMessage, { userId: 'default_user', metadata: { entry_id: entryId } });
    } catch (e) { console.error('[Telegram] Mem0 add failed:', e); }
  })();

  // Build dated context for Sensei question
  let datedContext: { content: string; date: string }[] = [];
  try {
    const searchResults = await mem0.search(cleanMessage, { userId: 'default_user', limit: 15 });
    if (searchResults?.results?.length > 0) {
      datedContext = searchResults.results.map((res: { memory: string; createdAt?: string }) => ({
        content: res.memory,
        date: toRelativeDate(res.createdAt ?? new Date().toISOString()),
      }));
    }
  } catch (e) {
    console.error('[Telegram] mem0 search failed, falling back:', e);
  }

  if (datedContext.length === 0) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentEntries } = await supabase
      .from('entries')
      .select('content, created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20);
    datedContext = (recentEntries ?? [])
      .map((e) => ({
        content: e.content?.trimStart().startsWith('<')
          ? stripHtml(e.content)
          : (e.content ?? ''),
        date: toRelativeDate(e.created_at),
      }))
      .filter((e) => e.content.trim().length > 10)
      .slice(0, 15);
  }

  const question = await generateGoDeeperQuestion(fullContent, datedContext);
  return `✅ *Journal saved!*\n\n🧠 *Sensei asks:*\n\n${question}`;
}

/**
 * /habits  — list today's habits with completion status
 */
async function handleHabits(): Promise<string> {
  const { start, end } = getTodayISTWindow();

  const { data: habits, error } = await supabase
    .from('habits')
    .select('id, name, icon, frequency, habit_type')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!habits || habits.length === 0) return '📋 No habits found. Add some in the app!';

  // Fetch today's logs
  const { data: todayLogs } = await supabase
    .from('habit_logs')
    .select('habit_id, status')
    .gte('logged_at', start)
    .lt('logged_at', end);

  const loggedToday = new Set((todayLogs ?? []).filter(l => l.status === 'success').map(l => l.habit_id));

  const lines = habits.map((h) => {
    const done = loggedToday.has(h.id);
    const badge = done ? '✅' : '⬜';
    return `${badge} ${h.icon ?? '✨'} ${h.name}`;
  });

  const doneCount = loggedToday.size;
  return `*📋 Today's Habits* (${doneCount}/${habits.length} done)\n\n${lines.join('\n')}\n\n_Use /loghabit <name> to mark done_`;
}

/**
 * /loghabit <habit name or partial>  — mark a habit as done today
 */
async function handleLogHabit(query: string): Promise<string> {
  if (!query.trim()) return '❌ Usage: /loghabit <habit name>';

  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, icon')
    .ilike('name', `%${query.trim()}%`)
    .limit(1);

  if (!habits || habits.length === 0) {
    return `❌ No habit matching "${query}". Check /habits for the full list.`;
  }

  const habit = habits[0];
  const { start, end } = getTodayISTWindow();

  // Check if already logged
  const { data: existing } = await supabase
    .from('habit_logs')
    .select('id')
    .eq('habit_id', habit.id)
    .gte('logged_at', start)
    .lt('logged_at', end)
    .limit(1);

  if (existing && existing.length > 0) {
    return `ℹ️ *${habit.icon} ${habit.name}* already logged today!`;
  }

  const { error } = await supabase
    .from('habit_logs')
    .insert({ habit_id: habit.id, status: 'success', logged_at: new Date().toISOString() });

  if (error) throw new Error(error.message);

  return `✅ *${habit.icon} ${habit.name}* marked as done! 🔥`;
}

/**
 * /tasks  — list today's active tasks
 */
async function handleTasks(): Promise<string> {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, status, priority, estimated_pomodoros, elapsed_pomodoros')
    .in('status', ['todo', 'in-progress'])
    .is('parent_task_id', null)
    .order('priority', { ascending: true })
    .limit(15);

  if (error) throw new Error(error.message);
  if (!tasks || tasks.length === 0) return '🎉 No active tasks! You\'re all caught up.';

  const lines = tasks.map((t) => {
    const statusIcon = t.status === 'in-progress' ? '🔄' : '⬜';
    const pomo = t.estimated_pomodoros
      ? ` _(${t.elapsed_pomodoros ?? 0}/${t.estimated_pomodoros} 🍅)_`
      : '';
    return `${statusIcon} ${t.title}${pomo}`;
  });

  return `*📌 Active Tasks* (${tasks.length})\n\n${lines.join('\n')}`;
}

/**
 * /addtask <title>  — create a new task
 */
async function handleAddTask(title: string): Promise<string> {
  if (!title.trim()) return '❌ Usage: /addtask <task title>';

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({ title: title.trim(), status: 'todo' })
    .select('id, title')
    .single();

  if (error) throw new Error(error.message);

  return `✅ Task created: *${task.title}*`;
}

/**
 * /pressure  — list active pressure plan tasks
 */
async function handlePressure(): Promise<string> {
  const { data: tasks, error } = await supabase
    .from('pressure_tasks')
    .select('id, title, priority, deadline, status, estimated_minutes')
    .in('status', ['todo', 'snoozed'])
    .order('priority', { ascending: true })
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(15);

  if (error) throw new Error(error.message);
  if (!tasks || tasks.length === 0) return '🎉 No active pressure tasks!';

  const now = new Date();
  const lines = tasks.map((t) => {
    const urgency = t.priority <= 1 ? '🔴' : t.priority <= 2 ? '🟠' : '🟡';
    const deadline = t.deadline
      ? ` · 📅 ${new Date(t.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`
      : '';
    const overdue = t.deadline && new Date(t.deadline) < now ? ' ⚠️' : '';
    const mins = t.estimated_minutes ? ` _(~${t.estimated_minutes}m)_` : '';
    return `${urgency} ${t.title}${mins}${deadline}${overdue}`;
  });

  return `*⚡ Pressure Plan Tasks* (${tasks.length})\n\n${lines.join('\n')}`;
}

/**
 * /addpressure <title>  — create a new pressure task
 */
async function handleAddPressure(title: string): Promise<string> {
  if (!title.trim()) return '❌ Usage: /addpressure <task title>';

  const { data: task, error } = await supabase
    .from('pressure_tasks')
    .insert({ title: title.trim(), priority: 1, status: 'todo' })
    .select('id, title')
    .single();

  if (error) throw new Error(error.message);

  return `⚡ Pressure task created: *${task.title}*`;
}

/**
 * /stats  — show Sensei page stats (XP, level, focus time)
 */
async function handleStats(): Promise<string> {
  // User stats + level
  const stats = await getUserStats();
  if (!stats) return '❌ Could not fetch stats.';

  const levelData = calculateLevel(stats.xp);

  // Focus time today
  const { start, end } = getTodayISTWindow();
  const { data: todayBlocks } = await supabase
    .from('time_blocks')
    .select('duration, completed')
    .gte('created_at', start)
    .lt('created_at', end);

  const todaySeconds = (todayBlocks ?? [])
    .filter(b => b.completed && b.duration > 0)
    .reduce((s, b) => s + b.duration, 0);
  const todayMins = Math.round(todaySeconds / 60);

  // 7-day focus
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: weekBlocks } = await supabase
    .from('time_blocks')
    .select('duration, completed')
    .gte('created_at', sevenDaysAgo);

  const weekSeconds = (weekBlocks ?? [])
    .filter(b => b.completed && b.duration > 0)
    .reduce((s, b) => s + b.duration, 0);
  const weekMins = Math.round(weekSeconds / 60);

  // Habit streak data
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, icon')
    .order('created_at', { ascending: false })
    .limit(5);

  const habitLines = (habits ?? []).map(h => `  • ${h.icon ?? '✨'} ${h.name}`).join('\n');

  return (
    `*📊 Dayly Stats — Sensei Dashboard*\n\n` +
    `🏆 *Level ${levelData.level}* — ${levelData.title}\n` +
    `⚡ XP: ${stats.xp} _(${levelData.progressPercent}% to next)_\n` +
    `🔥 Streak: ${stats.streak_days ?? 0} days\n\n` +
    `⏱ *Focus Today:* ${todayMins} min\n` +
    `📅 *Focus This Week:* ${weekMins} min\n\n` +
    (habits && habits.length > 0
      ? `🌱 *Recent Habits:*\n${habitLines}\n\n`
      : '') +
    `_Open the Sensei page for full insights._`
  );
}

/**
 * /help  — show all available commands
 */
function handleHelp(): string {
  return (
    `*🤖 Dayly Bot — Commands*\n\n` +
    `*📝 Journal*\n` +
    `/journal <text> — Save a journal entry & get Sensei question\n` +
    `_(or just send any text without a command)_\n\n` +
    `*🌱 Habits*\n` +
    `/habits — View today's habits\n` +
    `/loghabit <name> — Mark a habit as done today\n\n` +
    `*📌 Tasks*\n` +
    `/tasks — View active tasks\n` +
    `/addtask <title> — Create a new task\n\n` +
    `*⚡ Pressure Plan*\n` +
    `/pressure — View active pressure tasks\n` +
    `/addpressure <title> — Create a new pressure task\n\n` +
    `*📊 Stats*\n` +
    `/stats — View Sensei dashboard stats\n\n` +
    `/help — Show this message`
  );
}

// ─── Main POST handler (Telegram webhook) ────────────────────────────────────

export async function POST(request: Request) {
  try {
    const update: TelegramUpdate = await request.json();
    const msg = update.message;

    // Ignore non-text updates (photos, stickers, etc.)
    if (!msg?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = msg.chat.id;
    const rawText = msg.text.trim();

    // ── Security: only respond to the owner's chat ───────────────────────────
    if (!isAuthorized(chatId)) {
      console.warn(`[Telegram] Unauthorized message from chat ${chatId}`);
      return NextResponse.json({ ok: true }); // Silently ignore
    }

    console.log(`[Telegram] Received from ${chatId}: "${rawText.substring(0, 60)}"`);

    // ── Route commands ────────────────────────────────────────────────────────
    let replyText: string;

    try {
      if (rawText.startsWith('/start') || rawText.startsWith('/help')) {
        replyText = handleHelp();

      } else if (rawText.startsWith('/journal ') || rawText.startsWith('/journal@')) {
        const text = rawText.replace(/^\/journal(@\S+)?\s*/, '');
        replyText = await handleJournal(text, chatId);

      } else if (rawText.startsWith('/habits')) {
        replyText = await handleHabits();
        replyText = await generateTelegramResponse(replyText, rawText, 'habits');

      } else if (rawText.startsWith('/loghabit')) {
        const query = rawText.replace(/^\/loghabit(@\S+)?\s*/, '');
        replyText = await handleLogHabit(query);
        replyText = await generateTelegramResponse(replyText, rawText, 'loghabit');

      } else if (rawText.startsWith('/tasks')) {
        replyText = await handleTasks();
        replyText = await generateTelegramResponse(replyText, rawText, 'tasks');

      } else if (rawText.startsWith('/addtask ') || rawText.startsWith('/addtask@')) {
        const title = rawText.replace(/^\/addtask(@\S+)?\s*/, '');
        replyText = await handleAddTask(title);

      } else if (rawText.startsWith('/pressure')) {
        replyText = await handlePressure();
        replyText = await generateTelegramResponse(replyText, rawText, 'pressure');

      } else if (rawText.startsWith('/addpressure ') || rawText.startsWith('/addpressure@')) {
        const title = rawText.replace(/^\/addpressure(@\S+)?\s*/, '');
        replyText = await handleAddPressure(title);

      } else if (rawText.startsWith('/stats')) {
        replyText = await handleStats();
        replyText = await generateTelegramResponse(replyText, rawText, 'stats');

      } else if (rawText.startsWith('/')) {
        replyText = `❓ Unknown command. Use /help to see all commands.`;

      } else {
        // Free text → treat as journal entry
        replyText = await handleJournal(rawText, chatId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Telegram] Command handler error:', err);
      replyText = `❌ Something went wrong: ${msg}`;
    }

    // ── Send reply ────────────────────────────────────────────────────────────
    await sendTelegramMessage(replyText, { chatId: String(chatId) });

    return NextResponse.json({ ok: true });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Telegram] Unhandled error:', error);
    return NextResponse.json({ error: `Internal Server Error: ${msg}` }, { status: 500 });
  }
}

// ─── GET handler — used by the polling bot to verify the route is live ────────
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'Dayly Telegram Bot Webhook',
    commands: ['/journal', '/habits', '/loghabit', '/tasks', '/addtask', '/pressure', '/addpressure', '/stats', '/help'],
  });
}
