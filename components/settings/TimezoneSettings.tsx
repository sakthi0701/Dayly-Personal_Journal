"use client";

import { useState, useSyncExternalStore } from 'react';
import { Globe, Check } from 'lucide-react';
import {
    TIMEZONE_AUTO, TIMEZONE_STORAGE_KEY, detectDeviceTimeZone, getTimeZoneSetting, getUserTimeZone,
} from '@/lib/utils/userTimeZone';

const UTC_ZONE = 'Etc/UTC';
const CHANGE_EVENT = 'dayly-timezone-change';

// The setting lives in localStorage: read it as an external store (null during SSR/prerender).
function subscribe(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange); // other tabs
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

function describeZone(tz: string): string {
    try {
        const offset = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
            .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
        const time = new Date().toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' });
        return `${tz} · ${offset.replace('GMT', 'UTC')} · now ${time}`;
    } catch {
        return tz;
    }
}

export default function TimezoneSettings() {
    const setting = useSyncExternalStore(subscribe, getTimeZoneSetting, () => null);
    const detected = useSyncExternalStore(subscribe, detectDeviceTimeZone, () => '');
    const [showSaved, setShowSaved] = useState(false);

    const handleSelect = (value: string) => {
        try { localStorage.setItem(TIMEZONE_STORAGE_KEY, value); } catch { /* blocked storage */ }
        window.dispatchEvent(new Event(CHANGE_EVENT));
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
        window.dispatchEvent(new Event('dayly-refresh-tasks'));
    };

    const options = [
        { value: TIMEZONE_AUTO, title: 'Auto-detect (recommended)', detail: detected ? `This device: ${describeZone(detected)}` : 'Uses this device’s time zone' },
        { value: UTC_ZONE, title: 'UTC', detail: 'Coordinated Universal Time — only if you want UTC day boundaries' },
    ];
    // A fixed zone saved earlier (e.g. legacy "IST" → Asia/Kolkata) stays visible and selected.
    if (setting && setting !== TIMEZONE_AUTO && setting !== UTC_ZONE) {
        options.push({ value: setting, title: 'Fixed zone', detail: describeZone(setting) });
    }

    return (
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 lg:p-8 mt-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <Globe className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Time Zone</h2>
                        <p className="text-sm text-zinc-400">Sets when your day starts: &ldquo;due today&rdquo;, streaks, focus charts and greetings</p>
                    </div>
                </div>

                {showSaved && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium rounded-lg animate-in fade-in">
                    <Check className="w-3.5 h-3.5" /> Saved
                  </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl" role="radiogroup" aria-label="Time zone">
                {options.map(({ value, title, detail }) => {
                    const selected = setting === value;
                    return (
                        <button
                            key={value}
                            role="radio"
                            aria-checked={selected}
                            onClick={() => handleSelect(value)}
                            className={`flex flex-col items-start p-4 rounded-xl border transition-all ${
                                selected
                                    ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-sm'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                            }`}
                        >
                            <div className="flex items-center justify-between w-full mb-1">
                                <span className="font-semibold text-sm">{title}</span>
                                {selected && <Check className="w-4 h-4 text-indigo-400" />}
                            </div>
                            <span className="text-xs text-zinc-400 text-left">{detail}</span>
                        </button>
                    );
                })}
            </div>

            {setting && (
                <p className="mt-4 text-sm text-zinc-300">
                    In use: <span className="font-medium text-white">{describeZone(getUserTimeZone())}</span>
                </p>
            )}
        </section>
    );
}
