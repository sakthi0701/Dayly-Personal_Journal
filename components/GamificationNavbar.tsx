'use client';

import { useEffect, useState } from 'react';
import { Flame, Snowflake, Settings } from 'lucide-react';
import Link from 'next/link';
import { UserStats } from '@/lib/gamification';

interface GamificationLevelInfo {
    level: number;
    title: string;
    currentTierXp: number;
    nextLevelXp: number;
    progressPercent: number;
}

export default function GamificationNavbar() {
    const [stats, setStats] = useState<UserStats | null>(null);
    const [levelInfo, setLevelInfo] = useState<GamificationLevelInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await fetch('/api/stats/user');
                if (res.ok) {
                    const data = await res.json();
                    setStats(data.stats);
                    setLevelInfo(data.level);
                }
            } catch (err) {
                console.error("Failed to fetch stats", err);
            } finally {
                setLoading(false);
            }
        }

        fetchStats();

        // Simple polling for MVP (every 30s) or we could use custom events
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !stats || !levelInfo) {
        return <div className="h-10 w-32 bg-zinc-900 rounded-full animate-pulse"></div>;
    }

    const isSun = stats.current_avatar_state === 'sun';
    const isIce = stats.current_avatar_state === 'ice' || stats.current_avatar_state === 'dormant';

    return (
        <>
            <div className="flex items-center gap-4 bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-full px-4 py-2">
                {/* Avatar State & Streak */}
                <div className={`flex items-center gap-1.5 font-bold ${isSun ? 'text-orange-500 font-bold' : 'text-blue-300'}`}>
                    {isSun ? <Flame className="w-5 h-5 fill-orange-500" /> : <Snowflake className="w-5 h-5" />}
                    <span>{stats.streak_days}</span>
                </div>

                {/* divider */}
                <div className="w-px h-5 bg-zinc-700 mx-1"></div>

                {/* Level & XP */}
                <div className="flex flex-col gap-1 w-24">
                    <div className="flex justify-between items-center text-[10px] font-medium text-zinc-400 leading-none">
                        <span>Lvl {levelInfo.level}</span>
                        <span>{levelInfo.currentTierXp}/{levelInfo.nextLevelXp}</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${levelInfo.progressPercent}%` }}
                        />
                    </div>
                </div>

                {/* divider */}
                <div className="w-px h-5 bg-zinc-700 mx-1"></div>

                {/* Settings Link */}
                <Link href="/settings" className="text-zinc-500 hover:text-white transition-colors">
                    <Settings className="w-5 h-5" />
                </Link>
            </div>
        </>
    );
}
