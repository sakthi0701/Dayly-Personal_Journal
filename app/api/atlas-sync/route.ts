import { NextResponse } from 'next/server';
import { syncAtlasToday } from '@/lib/atlas-sync';

export const dynamic = 'force-dynamic';

/** "Sync from Atlas" button on the Action page. The 07:00 IST cron calls syncAtlasToday() directly. */
export async function POST() {
  try {
    return NextResponse.json(await syncAtlasToday());
  } catch (err) {
    console.error('[POST /api/atlas-sync]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Atlas sync failed' }, { status: 502 });
  }
}
