import Link from 'next/link';
import { ArrowRight, Sparkles, CheckSquare, BookOpen, BarChart2, Flame, Target } from 'lucide-react';

export const metadata = {
  title: 'Dayly — Command Center',
  description: 'Your daily active memory journal and productivity OS.',
};

export default function CommandCenter() {
  return (
    <main className="flex-1 flex flex-col min-h-screen bg-zinc-950 text-white">
      {/* Hero */}
      <div className="relative px-8 pt-12 pb-8">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-indigo-400 mb-3">
            Command Center
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            What are you<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
              building today?
            </span>
          </h1>
          <p className="mt-3 text-zinc-500 text-sm max-w-md">
            Your active memory journal. Plan deep work, write what matters, review what&apos;s true.
          </p>
        </div>
      </div>

      {/* Main grid */}
      <div className="px-8 pb-12 flex-1">
        <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* === Focus Room (primary card) === */}
          <Link
            href="/tasks"
            className="lg:col-span-2 group relative flex flex-col gap-4 p-6 bg-gradient-to-br from-indigo-950/40 to-zinc-900/60 border border-indigo-500/20 rounded-2xl transition-all duration-300 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 overflow-hidden"
          >
            {/* Accent glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center mb-4">
                <CheckSquare className="w-5 h-5 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Focus Room</h2>
              <p className="text-sm text-zinc-400 leading-relaxed mb-4 max-w-xs">
                Plan your tasks with Pomodoro estimates. Track subtasks and stay in deep work mode.
              </p>
              <span className="inline-flex items-center gap-1.5 text-indigo-400 text-sm font-medium group-hover:gap-2.5 transition-all">
                Open Focus Room <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>

          {/* === The Sensei === */}
          <Link
            href="/dashboard"
            className="group relative flex flex-col gap-4 p-6 bg-gradient-to-br from-violet-950/30 to-zinc-900/60 border border-violet-500/15 rounded-2xl transition-all duration-300 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5 overflow-hidden"
          >
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">The Compass</h2>
              <p className="text-sm text-zinc-500 leading-relaxed mb-4">
                AI insights from your journal entries and patterns.
              </p>
              <span className="inline-flex items-center gap-1.5 text-violet-400 text-sm font-medium group-hover:gap-2.5 transition-all">
                Get insights <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>

          {/* === Journal === */}
          <Link
            href="/entries/new"
            className="group relative flex flex-col p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-800/50"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4">
              <BookOpen className="w-5 h-5 text-zinc-400" />
            </div>
            <h2 className="text-base font-bold text-white mb-1">Journal</h2>
            <p className="text-xs text-zinc-500 leading-relaxed flex-1 mb-4">
              Write, record voice entries, go deeper with AI.
            </p>
            <span className="inline-flex items-center gap-1.5 text-zinc-500 text-xs font-medium group-hover:text-zinc-300 group-hover:gap-2.5 transition-all">
              New Entry <ArrowRight className="w-3 h-3" />
            </span>
          </Link>

          {/* === Analytics === */}
          <Link
            href="/analytics"
            className="group relative flex flex-col p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-800/50"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-800/20 border border-emerald-700/20 flex items-center justify-center mb-4">
              <BarChart2 className="w-5 h-5 text-emerald-500" />
            </div>
            <h2 className="text-base font-bold text-white mb-1">Analytics</h2>
            <p className="text-xs text-zinc-500 leading-relaxed flex-1 mb-4">
              Focus time, contribution heatmap, and Pomodoro records.
            </p>
            <span className="inline-flex items-center gap-1.5 text-zinc-500 text-xs font-medium group-hover:text-zinc-300 group-hover:gap-2.5 transition-all">
              View Mirror <ArrowRight className="w-3 h-3" />
            </span>
          </Link>

          {/* === Quick Habits stub === */}
          <div className="group relative flex flex-col p-6 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl border-dashed">
            <div className="w-10 h-10 rounded-xl bg-orange-800/20 border border-orange-700/20 flex items-center justify-center mb-4">
              <Flame className="w-5 h-5 text-orange-500/70" />
            </div>
            <h2 className="text-base font-bold text-zinc-500 mb-1">Habit Streaks</h2>
            <p className="text-xs text-zinc-700 leading-relaxed flex-1 mb-4">
              Daily habit tracking with fractional progress bars. Coming in Phase 9.
            </p>
            <span className="inline-flex items-center gap-1.5 text-zinc-700 text-xs font-medium">
              <Target className="w-3 h-3" /> Phase 9
            </span>
          </div>

        </div>
      </div>
    </main>
  );
}
