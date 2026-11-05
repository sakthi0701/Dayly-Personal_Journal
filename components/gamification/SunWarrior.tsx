'use client';

import { useEffect, useState } from 'react';
import { Zap, Timer, Trophy, Coins } from 'lucide-react';
import { UserStats } from '@/lib/gamification';

/**
 * Display-only mapping from DB avatar_state enum to user-facing labels.
 * DB values ('sun', 'ice', 'dormant') remain unchanged.
 */
function getStateDisplay(state: string) {
    if (state === 'sun') {
        return { label: 'Momentum', icon: Zap, color: 'text-orange-400', bgAccent: 'bg-orange-500/10 border-orange-500/20', iconFill: 'text-orange-400' };
    }
    // ice or dormant
    return { label: 'Rebuilding', icon: Timer, color: 'text-blue-400', bgAccent: 'bg-blue-500/10 border-blue-500/20', iconFill: 'text-blue-400' };
}

export default function SunWarrior() {
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch('/api/stats/user');
                if (res.ok) {
                    const data = await res.json();
                    setStats(data.stats);
                }
            } catch (err) {
                console.error("Failed to load Gamification data:", err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col p-8 bg-zinc-900/50 rounded-2xl border border-zinc-800 backdrop-blur-sm shadow-xl animate-pulse">
                <div className="h-6 w-32 bg-zinc-800 rounded mb-4" />
                <div className="h-4 w-48 bg-zinc-800 rounded mb-8" />
                <div className="grid grid-cols-2 gap-4">
                    <div className="h-28 bg-zinc-800/50 rounded-xl" />
                    <div className="h-28 bg-zinc-800/50 rounded-xl" />
                </div>
            </div>
        );
    }

    const state = stats?.current_avatar_state || 'dormant';
    const streak = stats?.streak_days || 0;
    const display = getStateDisplay(state);
    const StateIcon = display.icon;

    return (
        <div className="flex flex-col p-8 bg-zinc-900/50 rounded-2xl border border-zinc-800 backdrop-blur-sm shadow-xl relative overflow-hidden">
            {/* Background accent */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />

            {/* Header */}
            <div className="mb-6 flex justify-between items-start z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <StateIcon className={`w-5 h-5 ${display.iconFill}`} />
                        <h2 className="text-2xl font-bold text-white">
                            {display.label}
                        </h2>
                    </div>
                </div>
                {streak > 0 && (
                    <div className={`flex items-center gap-2 ${display.bgAccent} border px-3 py-1.5 rounded-full`}>
                        <span className={`${display.color} font-bold text-lg`}>{streak}</span>
                        <span className={`${display.color} opacity-80 text-xs font-semibold uppercase tracking-wider`}>Day Streak</span>
                    </div>
                )}
            </div>

            {/* Stats Grid — replaces the old large avatar block */}
            <div className="grid grid-cols-2 gap-4 z-10">
                {/* Coins Card */}
                <div className="bg-zinc-950/50 p-4 rounded-xl flex flex-col justify-between">
                    <div className="text-zinc-500 text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5" />
                        Coins
                    </div>
                    <span className={`text-2xl font-bold mt-2 ${(stats?.coins ?? 0) < 0 ? 'text-rose-400' : 'text-amber-300'}`}>
                        {stats?.coins ?? 0}
                    </span>
                    <div className="text-[10px] text-zinc-500 tracking-wide uppercase mt-1">
                        +50 per entry &bull; Streak bonuses apply
                    </div>
                </div>

                {/* Milestones Card */}
                <div className="bg-zinc-950/50 p-4 rounded-xl flex flex-col justify-between">
                    <div className="text-zinc-500 text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5" />
                        Milestones
                    </div>
                    <div>
                        <div className="text-sm text-zinc-300 font-medium mt-2">
                            Longest Streak: <span className="text-orange-400">{stats?.longest_streak || 0}</span>
                        </div>
                        <div className="text-sm text-zinc-300 font-medium">
                            Entries: <span className="text-indigo-400">{stats?.total_entries || 0}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
