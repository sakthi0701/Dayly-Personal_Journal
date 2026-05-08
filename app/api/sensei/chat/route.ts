import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mem0 } from '@/lib/ai/memory';
import { generateAdvice } from '@/lib/ai/groq';
import { getUserStats } from '@/lib/gamification';
import type { ExecutionSummary } from '@/lib/ai/groq';

/**
 * POST /api/sensei/chat
 *
 * Body: { threadId?: string, message: string, mode?: string }
 *
 * Layered context strategy:
 *   1. User's current message
 *   2. Last 10 messages from current thread
 *   3. Mem0 journal memory retrieval (semantic)
 *   4. 7-day execution data (tasks, habits, time_blocks, goals)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, mode = 'Sensei' } = body;
    let { threadId } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // ── 1. Resolve or create thread ───────────────────────────────────────────
    if (!threadId) {
      const titlePreview = message.trim().slice(0, 60);
      const { data: newThread, error: threadErr } = await supabase
        .from('sensei_threads')
        .insert({ title: titlePreview })
        .select()
        .single();
      if (threadErr) throw threadErr;
      threadId = newThread.id;
    } else {
      // Update thread timestamp
      await supabase
        .from('sensei_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);
    }

    // ── 2. Persist user message ────────────────────────────────────────────────
    await supabase.from('sensei_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: message.trim(),
      metadata: { mode },
    });

    // ── 3. Fetch recent thread context (last 10 messages) ─────────────────────
    const { data: recentMessages } = await supabase
      .from('sensei_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(10);

    const threadContext = (recentMessages ?? [])
      .reverse()
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    // ── 4. Parallel: journal memories + execution data ────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [
      memResults,
      stats,
      taskStatsRes,
      focusStatsRes,
      strictStatsRes,
      activeGoalsRes,
      habitLogsRes,
    ] = await Promise.all([
      mem0.search(message, { userId: 'default_user', limit: 6 }).catch(() => null),
      getUserStats(),

      supabase
        .from('tasks')
        .select('status, estimated_pomodoros, elapsed_pomodoros, title, goal_id, updated_at')
        .gte('updated_at', sevenDaysAgo),

      supabase
        .from('time_blocks')
        .select('duration, completed, mode')
        .gte('created_at', sevenDaysAgo),

      supabase
        .from('time_blocks')
        .select('violation_count, failed_reason, task_id')
        .eq('strict_mode', true)
        .gte('created_at', sevenDaysAgo),

      supabase
        .from('goals')
        .select('id, title, deadline, status, created_at')
        .eq('status', 'active'),

      supabase
        .from('habit_logs')
        .select('habit_id, logged_at, status, habits(name)')
        .gte('logged_at', thirtyDaysAgo),
    ]);

    // ── 5. Build execution summary ────────────────────────────────────────────
    const tasks = taskStatsRes.data ?? [];
    const strictBlocks = strictStatsRes.data ?? [];
    const activeGoals = activeGoalsRes.data ?? [];
    const habitLogs = habitLogsRes.data ?? [];

    const totalPlanned = tasks.reduce((s, t) => s + (t.estimated_pomodoros ?? 0), 0);
    const totalCompleted = tasks.reduce((s, t) => s + (t.elapsed_pomodoros ?? 0), 0);
    const strictFailed = strictBlocks.filter((b) => b.failed_reason).length;
    const tasksWithGoal = tasks.filter((t) => t.goal_id).length;
    const alignmentPercentage = tasks.length > 0 ? Math.round((tasksWithGoal / tasks.length) * 100) : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const goalDeadlinesSummary = activeGoals.length === 0
      ? 'No active goals.'
      : activeGoals.map((g) => {
          if (!g.deadline) return `"${g.title}" — no deadline`;
          const daysLeft = Math.ceil((new Date(g.deadline).getTime() - today.getTime()) / 86400000);
          return `"${g.title}" — ${daysLeft < 0 ? '⚠ OVERDUE' : `${daysLeft}d left`}`;
        }).join('; ');

    // Habit decay
    const habitMap = new Map<string, { name: string; failCount: number }>();
    habitLogs.forEach((log) => {
      const name = (log.habits as unknown as { name: string } | null)?.name ?? 'Unknown';
      if (!habitMap.has(log.habit_id)) habitMap.set(log.habit_id, { name, failCount: 0 });
      if (log.status === 'failed' || log.status === 'skipped') {
        habitMap.get(log.habit_id)!.failCount++;
      }
    });
    const decayedHabits = [...habitMap.values()].filter((h) => h.failCount >= 3);
    const failedHabitsSummary = decayedHabits.length > 0
      ? decayedHabits.map((h) => `"${h.name}" failed ${h.failCount} of last 7 days`).join('; ')
      : 'No habit decay detected.';

    const executionData: ExecutionSummary = {
      totalPlanned, totalCompleted, strictFailed,
      alignmentPercentage, goalDeadlinesSummary, failedHabitsSummary,
    };

    // ── 6. Build augmented question with thread context ───────────────────────
    const augmentedQuestion = threadContext
      ? `[Recent conversation context]\n${threadContext}\n\n[New question]\n${message}`
      : message;

    // ── 7. Journal memories ────────────────────────────────────────────────────
    const safeEntries = memResults?.results?.length
      ? memResults.results.map((r) => ({ content: r.memory }))
      : [];

    // ── 8. Generate response ───────────────────────────────────────────────────
    const advice = await generateAdvice(
      safeEntries,
      mode,
      augmentedQuestion,
      stats ?? undefined,
      executionData,
    );

    // ── 9. Persist assistant message ───────────────────────────────────────────
    await supabase.from('sensei_messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: advice,
      metadata: { mode, executionSummary: executionData },
    });

    // Update thread last_message_at
    await supabase
      .from('sensei_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);

    return NextResponse.json({ advice, threadId, executionData });
  } catch (err) {
    console.error('[POST /api/sensei/chat]', err);
    return NextResponse.json({ error: 'Failed to generate Sensei response' }, { status: 500 });
  }
}
