import { NextResponse } from 'next/server';
import { abandonTimeBlock } from '@/lib/remoteTimer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { blockId, duration, total_duration, violation_count = 0, failed_reason = 'manual_abandon' } = body;

    if (!blockId) {
      return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
    }

    // Shared with the Telegram "stop timer" tool. Deletes the block under 20% of the
    // planned time; skips blocks already completed (BUG-5: stale blockId from another tab/device).
    const result = await abandonTimeBlock({
      blockId,
      duration,
      totalDuration: total_duration,
      failedReason: failed_reason,
      violationCount: violation_count,
    });
    if (result.skipped) {
      console.warn(`[timer/abandon] block ${blockId} already completed — skipping abandon`);
      return NextResponse.json({ success: true, skipped: true, reason: 'already_completed' });
    }
    return NextResponse.json({ success: true, ...(result.deleted ? { deleted: true } : {}) });
  } catch (err) {
    console.error('[POST /api/timer/abandon]', err);
    return NextResponse.json({ error: 'Failed to abandon timer session' }, { status: 500 });
  }
}
