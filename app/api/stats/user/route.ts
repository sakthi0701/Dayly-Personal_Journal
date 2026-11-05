import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserStats } from '@/lib/gamification';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const stats = await getUserStats();
        if (!stats) {
            return NextResponse.json({ error: 'Stats not found' }, { status: 404 });
        }

        // Fetch recent entry dates for Activity Heatmap
        const { data: entries } = await supabase
            .from('entries')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(365);

        const recent_activity_dates = entries ? entries.map(e => e.created_at) : [];

        return NextResponse.json({
            stats,
            recent_activity_dates
        });
    } catch (error) {
        console.error("Error fetching user stats:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
