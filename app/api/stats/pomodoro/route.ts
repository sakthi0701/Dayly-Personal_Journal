import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getDateStr(dateObj: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dateObj);
  } catch {
    return dateObj.toISOString().slice(0, 10);
  }
}

function getWeekday(dateObj: Date, timeZone: string): number {
  try {
    const wdStr = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(dateObj);
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdStr);
    return idx >= 0 ? idx : dateObj.getDay();
  } catch {
    return dateObj.getDay();
  }
}

function getHour(dateObj: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(dateObj);
    const parsed = parseInt(parts, 10);
    return !isNaN(parsed) ? (parsed === 24 ? 0 : parsed) : dateObj.getHours();
  } catch {
    return dateObj.getHours();
  }
}

/**
 * GET /api/stats/pomodoro?range=7|14|30|90&tz=UTC|IST
 *
 * Returns focus analytics for the requested day range and timezone.
 * Defaults to 7 days and UTC if params are absent or invalid.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rangeParam = parseInt(searchParams.get('range') ?? '7', 10);
    const rangeDays = [7, 14, 30, 90].includes(rangeParam) ? rangeParam : 7;
    
    const tzParam = searchParams.get('tz') ?? 'UTC';
    const timeZone = tzParam === 'IST' ? 'Asia/Kolkata' : 'UTC';

    const now = new Date();
    const todayStr = getDateStr(now, timeZone);
    const yesterdayStr = getDateStr(new Date(Date.now() - 86400000), timeZone);

    const rangeStart = new Date(Date.now() - rangeDays * 86400000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

    const [blocksResult, strictResult] = await Promise.all([
      supabase
        .from('time_blocks')
        .select('duration, completed, mode, created_at, strict_mode, violation_count, failed_reason, task_id')
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: true }),
      supabase
        .from('time_blocks')
        .select('violation_count, failed_reason, task_id, completed, created_at')
        .eq('strict_mode', true)
        .gte('created_at', sevenDaysAgo),
    ]);

    const blocks = blocksResult.data ?? [];
    const strictBlocks = strictResult.data ?? [];

    // Total focus minutes (include all valid focus blocks with duration > 0, since <20% sessions are deleted)
    const validFocusBlocks = blocks.filter((b) => (b.duration ?? 0) > 0);
    const rangeBlocks = validFocusBlocks.filter((b) => b.created_at >= rangeStart);
    const totalFocusMinutes = Math.round(
      rangeBlocks.reduce((acc, b) => acc + (b.duration ?? 0), 0) / 60
    );

    // Yesterday's total for delta calculation (using target timezone)
    const yesterdayBlocks = validFocusBlocks.filter((b) => getDateStr(new Date(b.created_at), timeZone) === yesterdayStr);
    const yesterdayFocusMinutes = Math.round(
      yesterdayBlocks.reduce((acc, b) => acc + (b.duration ?? 0), 0) / 60
    );

    // Last-week average (7-day avg, for delta vs today)
    const lastWeekBlocks = validFocusBlocks.filter((b) => b.created_at >= sevenDaysAgo);
    const lastWeekMinutes = Math.round(
      lastWeekBlocks.reduce((acc, b) => acc + (b.duration ?? 0), 0) / 60
    );
    const lastWeekAvgPerDay = Math.round(lastWeekMinutes / 7);

    // Range breakdown: one entry per day for the selected range in target timezone
    const rangeMap = new Map<string, number>();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      rangeMap.set(getDateStr(d, timeZone), 0);
    }
    for (const b of validFocusBlocks) {
      const day = getDateStr(new Date(b.created_at), timeZone);
      if (rangeMap.has(day)) {
        rangeMap.set(day, (rangeMap.get(day) ?? 0) + Math.round((b.duration ?? 0) / 60));
      }
    }
    const weeklyBreakdown = Array.from(rangeMap.entries()).map(([date, minutes]) => ({ date, minutes }));

    // Weekday pattern: 0=Sun … 6=Sat, avg minutes per weekday across the range in target timezone
    const weekdayTotals = Array(7).fill(0);
    const weekdayCounts = Array(7).fill(0);
    for (const b of rangeBlocks) {
      const wd = getWeekday(new Date(b.created_at), timeZone);
      weekdayTotals[wd] += Math.round((b.duration ?? 0) / 60);
      weekdayCounts[wd]++;
    }
    const weekdayPattern = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, i) => ({
      name,
      avgMinutes: weekdayCounts[i] > 0 ? Math.round(weekdayTotals[i] / weekdayCounts[i]) : 0,
    }));

    // Daily timeline: by hour of day (0–23) in target timezone
    const hourMap = new Map<number, number>();
    for (let h = 0; h < 24; h++) hourMap.set(h, 0);
    const recentForTimeline = validFocusBlocks.filter((b) => b.created_at >= sevenDaysAgo);
    for (const b of recentForTimeline) {
      const hour = getHour(new Date(b.created_at), timeZone);
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

    // Today's focus — filter by target timezone date string
    const todayBlocks = validFocusBlocks.filter((b) => getDateStr(new Date(b.created_at), timeZone) === todayStr);
    const todayFocusMinutes = Math.round(todayBlocks.reduce((acc, b) => acc + (b.duration ?? 0), 0) / 60);
    const todayPomodoros = todayBlocks.filter((b) => b.mode === 'pomodoro').length;


    return NextResponse.json({
      totalFocusMinutes,
      todayFocusMinutes,
      todayPomodoros,
      yesterdayFocusMinutes,
      lastWeekAvgPerDay,
      weeklyBreakdown,
      weekdayPattern,
      dailyTimeline,
      strictMode: { total: strictTotal, passed: strictPassed, failed: strictFailed },
      failedSessions,
      rangeDays,
    });
  } catch (err) {
    console.error('[GET /api/stats/pomodoro]', err);
    return NextResponse.json({ error: 'Failed to fetch pomodoro stats' }, { status: 500 });
  }
}

