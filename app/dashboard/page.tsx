'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Repeat2, Zap, Loader2, Eye } from 'lucide-react';
import SunWarrior from '@/components/gamification/SunWarrior';
import AnalyticsContainer from '@/components/gamification/AnalyticsContainer';

type InsightMode = 'Pattern' | 'Momentum' | 'General';

export default function Dashboard() {
    const [advice, setAdvice] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeMode, setActiveMode] = useState<InsightMode>('General');
    const [customQuestion, setCustomQuestion] = useState('');

    const getAdvice = async (mode: InsightMode = activeMode) => {
        setLoading(true);
        setAdvice(null);
        try {
            const res = await fetch('/api/advice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    question: customQuestion.trim() !== '' ? customQuestion : undefined
                })
            });
            const data = await res.json();
            setAdvice(data.advice || "Not enough journal data to generate insights yet.");
        } catch (err) {
            console.error(err);
            setAdvice("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleCustomSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        getAdvice();
    };

    const modes = [
        {
            id: 'Pattern' as InsightMode,
            label: 'Pattern',
            icon: Repeat2,
            description: "What you keep repeating",
            color: 'text-rose-400',
            bg: 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/30'
        },
        {
            id: 'Momentum' as InsightMode,
            label: 'Momentum',
            icon: Zap,
            description: "What's actually working",
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30'
        }
    ];

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-200 p-8 font-sans">
            <header className="mb-12 flex items-center gap-4">
                <Link href="/" className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6 text-zinc-400 hover:text-white" />
                </Link>
                <h1 className="text-3xl font-bold tracking-tight text-white">The Compass</h1>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto items-start">
                {/* Gamification / Stats */}
                <SunWarrior />

                {/* The Elder — Insights Panel */}
                <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-950 p-6 rounded-2xl border border-zinc-700/40 shadow-xl relative overflow-hidden">
                    {/* Subtle ambient glow */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-700/5 rounded-full blur-3xl pointer-events-none" />

                    {/* Header */}
                    <div className="flex items-center gap-3 mb-2 relative z-10">
                        <Eye className="w-5 h-5 text-zinc-400" />
                        <h2 className="text-xl font-bold text-white tracking-tight">
                            The Elder
                        </h2>
                    </div>
                    <p className="text-zinc-500 text-sm mb-6 relative z-10">
                        It has read everything you've written. It will tell you what it sees.
                    </p>

                    <div className="space-y-5 relative z-10">

                        {/* Mode Selection */}
                        <div className="space-y-3">
                            <p className="text-zinc-500 text-xs uppercase tracking-widest font-medium">What do you want to know?</p>
                            <div className="flex gap-2">
                                {modes.map(m => {
                                    const Icon = m.icon;
                                    const isActive = activeMode === m.id;
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => {
                                                setActiveMode(m.id);
                                                if (advice || customQuestion) getAdvice(m.id);
                                            }}
                                            className={`flex-1 flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-300 
                                                ${isActive
                                                    ? `${m.bg} shadow-inner`
                                                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800/80 hover:border-zinc-700'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icon className={`w-4 h-4 ${isActive ? m.color : 'text-zinc-600'}`} />
                                                <span className={isActive ? 'text-white' : 'text-zinc-400'}>{m.label}</span>
                                            </div>
                                            <span className="text-xs text-zinc-500 font-normal">{m.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Custom Question */}
                        <form onSubmit={handleCustomSubmit} className="relative">
                            <input
                                type="text"
                                value={customQuestion}
                                onChange={(e) => setCustomQuestion(e.target.value)}
                                placeholder="Or ask it something directly..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-4 pr-12 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/50 transition-all"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>

                        {/* CTA — initial state */}
                        {!advice && !loading && !customQuestion && (
                            <div className="text-center py-6">
                                <button
                                    onClick={() => getAdvice()}
                                    className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full font-semibold tracking-wide transition-all border border-zinc-700 hover:border-zinc-500 active:scale-95"
                                >
                                    Ask The Elder
                                </button>
                            </div>
                        )}

                        {/* Loading State */}
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-10 space-y-3">
                                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                                <p className="text-sm text-zinc-600 tracking-wide">Reading your story...</p>
                            </div>
                        )}

                        {/* Insight Output */}
                        {advice && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-4">
                                <div className="p-5 bg-zinc-950/80 rounded-xl border border-zinc-800 shadow-inner">
                                    <div className="whitespace-pre-wrap font-serif text-base leading-relaxed text-zinc-300">
                                        {advice}
                                    </div>

                                    {/* Nudge to write if no data */}
                                    {advice.includes('Not enough journal data') && (
                                        <div className="mt-6 pt-4 border-t border-zinc-800">
                                            <Link
                                                href="/entries/new"
                                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-medium transition-all active:scale-95 text-sm"
                                            >
                                                Write an entry now <Send className="w-3.5 h-3.5" />
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="mt-3 flex justify-between items-center px-1">
                                    <span className="text-xs text-zinc-600 uppercase tracking-widest font-medium flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> The Elder
                                    </span>
                                    <button
                                        onClick={() => setAdvice(null)}
                                        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-widest font-medium"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Analytics */}
            <AnalyticsContainer />
        </div>
    );
}