'use client';

import { Coffee, RotateCcw, PlusCircle } from 'lucide-react';
import { useTimer } from './TimerProvider';

interface BreakPromptProps {
  onStartBreak: () => void;
  onSkipBreak: () => void;
  onExtend: () => void;
}

export default function BreakPrompt({ onStartBreak, onSkipBreak, onExtend }: BreakPromptProps) {
  const { state } = useTimer();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-zinc-900 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-500/5 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            🍅
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Session Complete!</h2>
          <p className="text-sm text-zinc-400">
            {state.task
              ? <><span className="text-zinc-200 font-medium">"{state.task.title}"</span> — great work.</>
              : 'Great work on your focus session.'}
          </p>
        </div>

        {/* Stats */}
        <div className="mx-6 mb-5 bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-4 py-3 flex items-center justify-around">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{Math.floor((state.duration) / 60)}</p>
            <p className="text-xs text-zinc-500">Minutes focused</p>
          </div>
          {state.task && (
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400">
                {state.task.elapsed_pomodoros + 1}/{state.task.estimated_pomodoros}
              </p>
              <p className="text-xs text-zinc-500">Pomodoros</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-400">+30</p>
            <p className="text-xs text-zinc-500">XP earned</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-6 pb-6">
          <button
            id="break-extend-btn"
            onClick={onExtend}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 font-semibold rounded-xl transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            Extend +1 min — Keep the flow
          </button>
          <button
            id="break-start-btn"
            onClick={onStartBreak}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all"
          >
            <Coffee className="w-4 h-4" />
            Take a 5-min Break
          </button>
          <button
            id="break-skip-btn"
            onClick={onSkipBreak}
            className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white font-medium rounded-xl transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Skip Break — Start Next Session
          </button>
        </div>
      </div>
    </div>
  );
}

