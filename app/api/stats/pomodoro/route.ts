import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [blocksResult, strictResult] = await Promise.all([
      supabase
        .from('time_blocks')
        .select('duration, completed, mode, created_at, strict_mode, violation_count, failed_reason, task_id')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: true }),
      supabase
        .from('time_blocks')
        .select('violation_count, failed_reason, task_id, completed, created_at')
        .eq('strict_mode', true)
        .gte('created_at', sevenDaysAgo),
    ]);

    const blocks = blocksResult.data ?? [];
    const strictBlocks = strictResult.data ?? [];

    // Total focus minutes (completed only)
    const completedBlocks = blocks.filter((b) => b.completed);
    const totalFocusMinutes = Math.round(
      completedBlocks.reduce((acc, b) => acc + (b.duration ?? 0), 0) / 60
    );

    // Weekly breakdown: last 7 days, minutes per day
    const weeklyMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const b of completedBlocks) {
      const day = b.created_at.slice(0, 10);
      if (weeklyMap.has(day)) {
        weeklyMap.set(day, (weeklyMap.get(day) ?? 0) + Math.round((b.duration ?? 0) / 60));
      }
    }
    const weeklyBreakdown = Array.from(weeklyMap.entries()).map(([date, minutes]) => ({ date, minutes }));

    // Daily timeline: by hour of day (0–23), how many completed blocks started in that hour
    const hourMap = new Map<number, number>();
    for (let h = 0; h < 24; h++) hourMap.set(h, 0);
    const recentBlocks = blocks.filter((b) => b.completed && b.created_at >= sevenDaysAgo);
    for (const b of recentBlocks) {
      const hour = new Date(b.created_at).getHours();
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
    }
    const dailyTimeline = Array.from(hourMap.entries())
      .map(([hour, blocks]) => ({ hour, blocks }))
      .filter((h) => h.hour >= 6 && h.hour <= 23); // trim dead hours

    // Strict mode stats
    const strictTotal = strictBlocks.length;
    const strictFailed = strictBlocks.filter((b) => !b.completed).length;
    const strictPassed = strictTotal - strictFailed;

    // Failed sessions log
    const failedSessions = strictBlocks
      .filter((b) => !b.completed)
      .map((b) => ({
        task_id: b.task_id,
        violation_count: b.violation_count,
        failed_reason: b.failed_reason,
        created_at: b.created_at,
      }));

    // Today's focus (local date)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBlocks = completedBlocks.filter((b) => new Date(b.created_at) >= todayStart);
    const todayFocusMinutes = Math.round(todayBlocks.reduce((acc, b) => acc + (b.duration ?? 0), 0) / 60);
    const todayPomodoros = todayBlocks.filter((b) => b.mode === 'pomodoro').length;

    return NextResponse.json({
      totalFocusMinutes,
      todayFocusMinutes,
      todayPomodoros,
      weeklyBreakdown,
      dailyTimeline,
      strictMode: { total: strictTotal, passed: strictPassed, failed: strictFailed },
      failedSessions,
    });
  } catch (err) {
    console.error('[GET /api/stats/pomodoro]', err);
    return NextResponse.json({ error: 'Failed to fetch pomodoro stats' }, { status: 500 });
  }
}
