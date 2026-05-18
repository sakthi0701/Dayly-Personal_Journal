import { NextResponse } from 'next/server';
import { mem0 } from '@/lib/ai/memory';
import { generateAdvice } from '@/lib/ai/groq';
import { getUserStats } from '@/lib/gamification';
import { supabase } from '@/lib/supabase';
import type { ExecutionSummary } from '@/lib/ai/groq';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'General';
    const question = body.question;

    // --- Determine Mem0 embedding query based on mode ---
    let query = 'life progress habits goals struggles';
    if (question && question.trim() !== '') {
      query = question;
    } else if (mode === 'Pattern') {
      query = 'repeated behavior habits loop stuck same situation';
    } else if (mode === 'Momentum') {
      query = 'progress working improving growth discipline success';
    } else if (mode === 'Sensei') {
      query = 'avoidance procrastination goals discipline execution failure';
    } else if (mode === 'Task-Audit') {
      query = 'task avoidance ignore delay incomplete important work';
    }

    console.log(`[Advice Engine] Mode: ${mode}, Query: "${query}"`);

    // --- Calculate 7-day window ---
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // --- Run ALL queries in parallel: Mem0 + Stats + Execution Data ---
    const [
      memResults,
      stats,
      taskStatsRes,
      focusStatsRes,
      strictStatsRes,
      activeGoalsRes,
      habitLogsRes,
    ] = await Promise.all([
      mem0.search(query, { userId: 'default_user', limit: 10 }),
      getUserStats(),

      // Pomodoro planned vs completed (tasks updated in last 7 days)
      supabase
        .from('tasks')
        .select('status, estimated_pomodoros, elapsed_pomodoros, title, goal_id, updated_at')
        .gte('updated_at', sevenDaysAgo),

      // Focus session durations
      supabase
        .from('time_blocks')
        .select('duration, completed, mode')
        .gte('created_at', sevenDaysAgo),

      // Strict mode violations
      supabase
        .from('time_blocks')
        .select('violation_count, failed_reason, task_id')
        .eq('strict_mode', true)
        .gte('created_at', sevenDaysAgo),

      // Active goals with deadlines
      supabase
        .from('goals')
        .select('id, title, deadline, status, created_at')
        .eq('status', 'active'),

      // Habit logs for the last 30 days (for streak calculation)
      supabase
        .from('habit_logs')
        .select('habit_id, logged_at, status, habits(name, color)')
        .gte('logged_at', thirtyDaysAgo),
    ]);

    // --- Aggregate Execution Data ---
    const tasks = taskStatsRes.data ?? [];
    const focusBlocks = focusStatsRes.data ?? [];
    const strictBlocks = strictStatsRes.data ?? [];
    const activeGoals = activeGoalsRes.data ?? [];
    const habitLogs = habitLogsRes.data ?? [];

    // Pomodoro stats
    const totalPlanned = tasks.reduce((s, t) => s + (t.estimated_pomodoros ?? 0), 0);
    const totalCompleted = tasks.reduce((s, t) => s + (t.elapsed_pomodoros ?? 0), 0);

    // Strict mode failures
    const strictFailed = strictBlocks.filter(
      (b) => b.failed_reason && b.failed_reason !== null
    ).length;

    // Goal alignment: what % of tasks have a goal_id
    const tasksWithGoal = tasks.filter((t) => t.goal_id).length;
    const alignmentPercentage =
      tasks.length > 0 ? Math.round((tasksWithGoal / tasks.length) * 100) : 0;

    // Goal countdowns summary
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const goalDeadlinesSummary =
      activeGoals.length === 0
        ? 'No active goals set.'
        : activeGoals
            .map((g) => {
              if (!g.deadline) return `"${g.title}" — no deadline set`;
              const deadline = new Date(g.deadline);
              const daysLeft = Math.ceil(
                (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
              );
              const urgency = daysLeft < 0 ? '⚠ OVERDUE' : `${daysLeft} days left`;
              return `"${g.title}" — ${urgency}`;
            })
            .join('; ');

    // Habit decay: find habits with 2+ consecutive missed/failed days in last 7 days
    const habitMap = new Map<string, { name: string; recentStatuses: string[] }>();
    habitLogs.forEach((log) => {
      const name =
        (log.habits as unknown as { name: string } | null)?.name ?? 'Unknown habit';
      if (!habitMap.has(log.habit_id)) {
        habitMap.set(log.habit_id, { name, recentStatuses: [] });
      }
      habitMap.get(log.habit_id)!.recentStatuses.push(log.status ?? 'success');
    });

    // Also check which habits had no log at all recently (implicit failure)
    const decayedHabits: string[] = [];
    const sevenDaysAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    habitMap.forEach((habit) => {
      const recentLogs = habitLogs
        .filter(
          (l) =>
            l.habit_id ===
            [...habitMap.entries()].find(([, v]) => v.name === habit.name)?.[0]
        )
        .filter((l) => new Date(l.logged_at) >= sevenDaysAgoDate);

      const failCount = recentLogs.filter(
        (l) => l.status === 'failed' || l.status === 'skipped'
      ).length;

      // Check consecutive failures
      let consecutiveFails = 0;
      let maxConsecutive = 0;
      recentLogs
        .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime())
        .forEach((l) => {
          if (l.status === 'failed' || l.status === 'skipped') {
            consecutiveFails++;
            maxConsecutive = Math.max(maxConsecutive, consecutiveFails);
          } else {
            consecutiveFails = 0;
          }
        });

      if (maxConsecutive >= 2 || failCount >= 3) {
        decayedHabits.push(`"${habit.name}" failed ${failCount} of last 7 days`);
      }
    });

    const failedHabitsSummary =
      decayedHabits.length > 0 ? decayedHabits.join('; ') : 'No habit decay detected.';

    const executionData: ExecutionSummary = {
      totalPlanned,
      totalCompleted,
      strictFailed,
      alignmentPercentage,
      goalDeadlinesSummary,
      failedHabitsSummary,
    };

    // --- Journal memories from Mem0 ---
    const safeEntries =
      memResults?.results && memResults.results.length > 0
        ? memResults.results.map((res) => ({ content: res.memory }))
        : [];

    if (safeEntries.length === 0 && !question && mode === 'General') {
      return NextResponse.json({
        advice:
          'Not enough journal data yet. Write a few more entries so I can find meaningful patterns and give you useful insights.',
      });
    }

    console.log(
      `[Advice Engine] Found ${safeEntries.length} journal memories. Execution data assembled. Connecting to LLM...`
    );

    const advice = await generateAdvice(safeEntries, question, stats ?? undefined, executionData);

    return NextResponse.json({ advice, executionData });
  } catch (error) {
    console.error('Advice API Error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
