'use client';

import { useTimer } from '@/components/timer/TimerProvider';
import { Pause, Play, Square, PlusCircle, Coffee, RotateCcw, ExternalLink } from 'lucide-react';
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
  const remaining = useTimer(state => state.remaining);
  const status = useTimer(state => state.status);
  const mode = useTimer(state => state.mode);
  const duration = useTimer(state => state.duration);
  const task = useTimer(state => state.task);
  const strictMode = useTimer(state => state.strictMode);
  const isBreak = useTimer(state => state.isBreak);
  const pauseTimer = useTimer(state => state.pauseTimer);
  const resumeTimer = useTimer(state => state.resumeTimer);
  const abandonTimer = useTimer(state => state.abandonTimer);
  const startTimer = useTimer(state => state.startTimer);
  const completeTimer = useTimer(state => state.completeTimer);
  const extendTimer = useTimer(state => state.extendTimer);
  const setDuration = useTimer(state => state.setDuration);
  const state = { status, mode, duration, task, strictMode, isBreak };

  const isPaused = state.status === 'paused';
  const isCompleted = state.status === 'completed' && state.mode === 'pomodoro';

  const progress = state.mode === 'pomodoro' && state.duration > 0
    ? Math.max(0, Math.min(1, 1 - remaining / state.duration))
    : 0;

  // ── Break handlers (same logic as GlobalTimerUI) ──────────────────────────
  const handleBreakExtend = useCallback(() => {
    extendTimer(1);
    // Keep PiP open — the reducer transitions status to 'running' atomically
  }, [extendTimer]);

  // ── Completed / Break Prompt ──────────────────────────────────────────────
  if (isCompleted) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white select-none px-4 text-center"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      >
        {state.isBreak ? (
          <>
            <div className="text-4xl mb-2">☕</div>
            <p className="text-base font-bold text-white">Break Over!</p>
            <p className="text-xs text-zinc-400 mt-0.5 mb-4">Time to get back into deep work.</p>

            <div className="flex flex-col gap-2 w-full max-w-[220px]">
              <button
                onClick={() => {
                  setDuration(25);
                  startTimer(state.task, state.strictMode, [], false);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow"
              >
                Start Focus (25m)
              </button>
              <button
                onClick={handleBreakExtend}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-xl transition-all"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Extend +1 min
              </button>
              <button
                onClick={() => { abandonTimer(); onClose(); }}
                className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-all"
              >
                Dismiss
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-4xl mb-2">🍅</div>
            <p className="text-base font-bold text-white">Session Complete!</p>
            <p className="text-xs text-zinc-400 mt-0.5 mb-4">Review session in main tab to claim XP.</p>

            <div className="flex flex-col gap-2 w-full max-w-[220px]">
              <button
                onClick={() => {
                  if (window.opener) {
                    window.opener.focus();
                    window.opener.location.href = '/focus';
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Review
              </button>
              <button
                onClick={handleBreakExtend}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-xl transition-all"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Extend +1 min
              </button>
            </div>
          </>
        )}
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
          className={`h-full transition-all duration-700 ${isPaused ? 'bg-amber-500' : state.isBreak ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Timer display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-5">
        {/* Mode emoji + countdown */}
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">
            {state.mode === 'pomodoro' ? (state.isBreak ? '☕' : '🍅') : '⏱'}
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
            : state.isBreak
            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
            : 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-400' : state.isBreak ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400 animate-pulse'}`} />
          {isPaused ? 'Paused' : state.isBreak ? 'On Break' : 'Running'}
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

