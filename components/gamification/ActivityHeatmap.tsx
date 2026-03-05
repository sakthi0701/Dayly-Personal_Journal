'use client';

import { useMemo } from 'react';
import { format, subDays, startOfDay, isSameDay } from 'date-fns';

interface ActivityHeatmapProps {
    dates: string[]; // ISO strings of entry created_at times
}

export default function ActivityHeatmap({ dates }: ActivityHeatmapProps) {
    // Generate the last 90 days grid
    const daysToShow = 90;

    // Create an array of day objects representing the grid
    const gridDays = useMemo(() => {
        const today = startOfDay(new Date());
        const days = [];

        // Parse dates to start of day for easy comparison
        const entryDays = dates.map(d => startOfDay(new Date(d)).getTime());

        // Build array from 89 days ago to today
        for (let i = daysToShow - 1; i >= 0; i--) {
            const date = subDays(today, i);
            const time = date.getTime();
            // Count entries on this day
            const count = entryDays.filter(d => d === time).length;

            days.push({
                date,
                count,
            });
        }
        return days;
    }, [dates]);

    // Color mapper based on entry count
    const getColorClass = (count: number) => {
        if (count === 0) return 'bg-zinc-800 border-zinc-900 border';
        if (count === 1) return 'bg-indigo-900/40 border-indigo-500/30 border shadow-[0_0_8px_rgba(99,102,241,0.2)_inset]';
        if (count === 2) return 'bg-indigo-700/60 border-indigo-400/40 border shadow-[0_0_10px_rgba(99,102,241,0.4)_inset]';
        if (count >= 3) return 'bg-indigo-500 border-indigo-400 border shadow-[0_0_12px_rgba(99,102,241,0.6)_inner]';
        return 'bg-zinc-800';
    };

    return (
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 shadow-xl w-full">
            <h3 className="text-zinc-400 text-sm font-bold uppercase tracking-wider mb-4 flex items-center justify-between">
                <span>Contribution Activity</span>
                <span className="text-indigo-400 text-xs font-mono">{dates.length} Total Entries</span>
            </h3>

            <div className="flex flex-col md:flex-row gap-4">
                {/* Scrollable grid container */}
                <div className="flex-1 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    <div className="inline-grid grid-rows-7 grid-flow-col gap-1.5 min-w-max">
                        {gridDays.map((day, i) => (
                            <div
                                key={i}
                                title={`${format(day.date, 'MMM d, yyyy')}: ${day.count} entries`}
                                className={`w-3.5 h-3.5 rounded-[2px] cursor-help transition-all duration-300 hover:scale-125 ${getColorClass(day.count)}`}
                            />
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500 mt-2 font-mono ml-1 mr-4">
                        <span>{format(subDays(new Date(), daysToShow - 1), 'MMM d')}</span>
                        <span>{format(new Date(), 'MMM d')}</span>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-end justify-start md:flex-col md:justify-end gap-2 text-xs text-zinc-500 self-end md:ml-4 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-[2px] bg-zinc-800 border-zinc-900 border"></span>
                        <span>0</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-[2px] bg-indigo-900/40 border-indigo-500/30 border"></span>
                        <span>1</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-[2px] bg-indigo-700/60 border-indigo-400/40 border"></span>
                        <span>2</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-[2px] bg-indigo-500 border-indigo-400 border"></span>
                        <span>3+</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
