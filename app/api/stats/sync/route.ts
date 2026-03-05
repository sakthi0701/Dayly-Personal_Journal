import { NextResponse } from 'next/server';
import { updateUserStatsOnEntry } from '@/lib/gamification';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const timezone = body.timezone || 'UTC';

        const result = await updateUserStatsOnEntry(timezone);

        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error("Error syncing stats:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
