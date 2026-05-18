"use client";

import { useState, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';

export default function TimezoneSettings() {
    const [timezone, setTimezone] = useState<string>('UTC');
    const [showSaved, setShowSaved] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('dayly_timezone') ?? 'UTC';
        setTimezone(stored);
    }, []);

    const handleSelect = (tz: string) => {
        setTimezone(tz);
        localStorage.setItem('dayly_timezone', tz);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('dayly-refresh-tasks'));
        }
    };

    return (
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:p-8 mt-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <Globe className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Timezone Preferences</h2>
                        <p className="text-sm text-zinc-400">Choose how day boundaries are calculated for your focus analytics</p>
                    </div>
                </div>

                {showSaved && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium rounded-lg animate-in fade-in">
                    <Check className="w-3.5 h-3.5" /> Saved
                  </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <button
                    onClick={() => handleSelect('UTC')}
                    className={`flex flex-col items-start p-4 rounded-xl border transition-all ${
                        timezone === 'UTC'
                            ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-sm'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                >
                    <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-semibold text-sm">UTC (Default)</span>
                        {timezone === 'UTC' && <Check className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <span className="text-xs opacity-70 text-left">Coordinated Universal Time (Server time)</span>
                </button>

                <button
                    onClick={() => handleSelect('IST')}
                    className={`flex flex-col items-start p-4 rounded-xl border transition-all ${
                        timezone === 'IST'
                            ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-sm'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                >
                    <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-semibold text-sm">IST (India)</span>
                        {timezone === 'IST' && <Check className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <span className="text-xs opacity-70 text-left">Indian Standard Time (UTC+05:30)</span>
                </button>
            </div>
        </section>
    );
}
