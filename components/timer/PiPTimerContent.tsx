'use client';

import { useTimer } from '@/components/timer/TimerProvider';
import { Pause, Play, Square, PlusCircle, Coffee, RotateCcw } from 'lucide-react';
import { useCallback } from 'react';

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

interface PiPTimerContentProps {
  /** Called when the user wants to close the PiP window from within it */
  onClose: () => void;
}

/**
 * Compact timer UI rendered inside the Document PiP window via React Portal.
 * Because createPortal keeps it in the React tree, useTimer() context works normally.
 * Handles both the running/paused state AND the post-session break prompt.
 */
export default function PiPTimerContent({ onClose }: PiPTimerContentProps) {
  const {
    state, remaining,
    pauseTimer, resumeTimer, abandonTimer,
    startTimer, completeTimer, extendTimer,
  } = useTimer();

  const isPaused = state.status === 'paused';
  const isCompleted = state.status === 'completed' && state.mode === 'pomodoro';

  const progress = state.mode === 'pomodoro' && state.duration > 0
    ? Math.max(0, Math.min(1, 1 - remaining / state.duration))
    : 0;

  // ── Break handlers (same logic as GlobalTimerUI) ──────────────────────────
  const handleBreakStart = useCallback(async () => {
    await completeTimer();
    onClose(); // Close PiP after taking a break — return focus to the app
  }, [completeTimer, onClose]);

  const handleBreakSkip = useCallback(async () => {
    await completeTimer();
    startTimer(state.task, state.strictMode);
    // Keep PiP open for the next session
  }, [completeTimer, startTimer, state.task, state.strictMode]);

  const handleBreakExtend = useCallback(async () => {
    const task = state.task;
    const strict = state.strictMode;
    await completeTimer();
    setTimeout(() => {
      startTimer(task, strict);
      setTimeout(() => extendTimer(1), 50);
    }, 50);
  }, [completeTimer, startTimer, extendTimer, state.task, state.strictMode]);

  // ── Completed / Break Prompt ──────────────────────────────────────────────
  if (isCompleted) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white select-none"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      >
        {/* Header */}
        <div className="text-4xl mb-2">🍅</div>
        <p className="text-base font-bold text-white">Session Complete!</p>
        <p className="text-xs text-indigo-400 font-medium mt-0.5 mb-4">+30 XP earned</p>

        {/* Break actions */}
        <div className="flex flex-col gap-2 w-full px-4">
          <button
            onClick={handleBreakExtend}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600/25 hover:bg-indigo-600/45 border border-indigo-500/35 text-indigo-300 text-sm font-semibold rounded-xl transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Extend +1 min
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleBreakStart}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all"
            >
              <Coffee className="w-3.5 h-3.5" />
              Break
            </button>
            <button
              onClick={handleBreakSkip}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs font-medium rounded-xl transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Running / Paused ─────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-screen bg-zinc-950 text-white select-none"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
    >
      {/* Progress bar */}
      <div className="h-1 bg-zinc-800/80 flex-shrink-0">
        <div
          className={`h-full transition-all duration-700 ${isPaused ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Timer display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-5">
        {/* Mode emoji + countdown */}
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">
            {state.mode === 'pomodoro' ? '🍅' : '⏱'}
          </span>
          <span className="font-mono text-[52px] font-bold tabular-nums text-white tracking-tight leading-none">
            {fmt(remaining)}
          </span>
        </div>

        {/* Task name */}
        {state.task && (
          <p className="text-xs text-zinc-500 truncate max-w-[260px] text-center">
            {state.task.title}
          </p>
        )}

        {/* Status pill */}
        <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full ${
          isPaused
            ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
            : 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-indigo-400 animate-pulse'}`} />
          {isPaused ? 'Paused' : 'Running'}
        </div>
      </div>

      {/* Control bar */}
      <div className="flex items-center gap-2 px-4 pb-4 flex-shrink-0">
        {/* Pause / Resume */}
        <button
          onClick={isPaused ? resumeTimer : pauseTimer}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            isPaused
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
          }`}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {isPaused ? 'Resume' : 'Pause'}
        </button>

        {/* +1 min extend (Pomodoro only) */}
        {state.mode === 'pomodoro' && (
          <button
            onClick={() => extendTimer(1)}
            title="Extend by 1 minute"
            className="px-3 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 hover:bg-indigo-600/25 text-zinc-400 hover:text-indigo-300 border border-zinc-700/50 hover:border-indigo-500/30 transition-all"
          >
            +1m
          </button>
        )}

        {/* Stop */}
        <button
          onClick={() => { abandonTimer(); onClose(); }}
          title="Stop session and close"
          className="p-2.5 rounded-xl bg-zinc-800 hover:bg-red-500/15 text-zinc-600 hover:text-red-400 border border-zinc-700/50 hover:border-red-500/20 transition-all"
        >
          <Square className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
