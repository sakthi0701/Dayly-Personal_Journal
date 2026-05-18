import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserStats, calculateLevel } from '@/lib/gamification';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const stats = await getUserStats();
        if (!stats) {
            return NextResponse.json({ error: 'Stats not found', level: { level: 1, title: 'Novice', currentTierXp: 0, nextLevelXp: 300, progressPercent: 0 } }, { status: 404 });
        }

        const levelData = calculateLevel(stats.xp);

        // Fetch recent entry dates for Activity Heatmap
        const { data: entries } = await supabase
            .from('entries')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(365);

        const recent_activity_dates = entries ? entries.map(e => e.created_at) : [];

        return NextResponse.json({
            stats,
            level: levelData,
            recent_activity_dates
        });
    } catch (error) {
        console.error("Error fetching user stats:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
