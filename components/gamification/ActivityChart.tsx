'use client';

import { useMemo } from 'react';
import { format, subDays, startOfDay } from 'date-fns';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

interface ActivityChartProps {
    dates: string[];
}

export default function ActivityChart({ dates }: ActivityChartProps) {
    const data = useMemo(() => {
        const daysToShow = 14; // Look at last 2 weeks for the detailed chart
        const today = startOfDay(new Date());
        const entryDays = dates.map(d => startOfDay(new Date(d)).getTime());

        const chartData = [];

        // Build array from 13 days ago to today
        for (let i = daysToShow - 1; i >= 0; i--) {
            const date = subDays(today, i);
            const time = date.getTime();
            const count = entryDays.filter(d => d === time).length;

            chartData.push({
                name: format(date, 'MMM d'),
                entries: count,
                fullDate: format(date, 'EEEE, MMMM d, yyyy')
            });
        }
        return chartData;
    }, [dates]);

    return (
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 shadow-xl w-full h-[300px] flex flex-col">
            <h3 className="text-zinc-400 text-sm font-bold uppercase tracking-wider mb-6">
                Frequency Graph (Last 14 Days)
            </h3>

            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 0, right: 0, left: -25, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorEntries" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis
                            dataKey="name"
                            stroke="#52525b"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            stroke="#52525b"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#18181b',
                                border: '1px solid #27272a',
                                borderRadius: '0.75rem',
                                color: '#e4e4e7',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                            }}
                            labelStyle={{ color: '#a1a1aa', fontWeight: 'bold', marginBottom: '4px' }}
                            itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                            cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '4 4' }}
                            labelFormatter={(label, payload) => {
                                if (payload && payload.length > 0) {
                                    return payload[0].payload.fullDate;
                                }
                                return label;
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="entries"
                            stroke="#818cf8"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorEntries)"
                            activeDot={{ r: 6, fill: '#818cf8', stroke: '#18181b', strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
