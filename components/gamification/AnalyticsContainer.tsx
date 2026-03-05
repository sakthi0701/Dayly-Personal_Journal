'use client';

import { useEffect, useState } from 'react';
import ActivityHeatmap from './ActivityHeatmap';
import ActivityChart from './ActivityChart';

export default function AnalyticsContainer() {
    const [dates, setDates] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch('/api/stats/user');
                if (res.ok) {
                    const data = await res.json();
                    if (data.recent_activity_dates) {
                        setDates(data.recent_activity_dates);
                    }
                }
            } catch (err) {
                console.error("Failed to load analytics data:", err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="mt-8 animate-pulse grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="h-64 bg-zinc-900/50 rounded-2xl border border-zinc-800"></div>
                <div className="h-64 bg-zinc-900/50 rounded-2xl border border-zinc-800"></div>
            </div>
        );
    }

    return (
        <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-8 max-w-5xl mx-auto w-full items-stretch">
            <div className="flex w-full">
                <ActivityHeatmap dates={dates} />
            </div>
            <div className="flex w-full">
                <ActivityChart dates={dates} />
            </div>
        </div>
    );
}
