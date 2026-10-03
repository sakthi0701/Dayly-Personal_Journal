'use client';

import { useTimer } from '@/components/timer/TimerProvider';
import { Pause, Play, PlusCircle, Coffee, RotateCcw, ExternalLink, Zap, X } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

interface PiPTimerContentProps {
  /** Called when the user wants to close the PiP window from within it */
  onClose: () => void;
}

const DEFAULT_DISTRACTIONS = [
  { label: 'Social Media', emoji: '📱' },
  { label: 'Web Browsing', emoji: '🌐' },
  { label: 'Chat / Interruption', emoji: '💬' },
  { label: 'Mind Wandering', emoji: '💭' },
  { label: 'Snack / Break', emoji: '☕' },
];

/**
 * Compact timer UI rendered inside the Document PiP window via React Portal.
 * Because createPortal keeps it in the React tree, useTimer() context works normally.
 * Handles running/paused state, distraction logging with refocus prompt, AND post-session break prompt.
 */
export default function PiPTimerContent({ onClose }: PiPTimerContentProps) {
  const remaining = useTimer(state => state.remaining);
  const status = useTimer(state => state.status);
  const mode = useTimer(state => state.mode);
  const duration = useTimer(state => state.duration);
  const task = useTimer(state => state.task);
  const strictMode = useTimer(state => state.strictMode);
  const isBreak = useTimer(state => state.isBreak);
  const notToDoItems = useTimer(state => state.notToDoItems);
  const pauseTimer = useTimer(state => state.pauseTimer);
  const resumeTimer = useTimer(state => state.resumeTimer);
  const abandonTimer = useTimer(state => state.abandonTimer);
  const startTimer = useTimer(state => state.startTimer);
  const completeTimer = useTimer(state => state.completeTimer);
  const extendTimer = useTimer(state => state.extendTimer);
  const setDuration = useTimer(state => state.setDuration);
  const logDistraction = useTimer(state => state.logDistraction);

  const [showDistractionPicker, setShowDistractionPicker] = useState(false);
  const [refocusPrompt, setRefocusPrompt] = useState<string | null>(null);
  const refocusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const state = { status, mode, duration, task, strictMode, isBreak };

  const isPaused = state.status === 'paused';
  const isCompleted = state.status === 'completed' && state.mode === 'pomodoro';

  const progress = state.mode === 'pomodoro' && state.duration > 0
    ? Math.max(0, Math.min(1, 1 - remaining / state.duration))
    : 0;

  useEffect(() => {
    return () => {
      if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    };
  }, []);

  const handleSelectDistraction = (item: { label: string; emoji: string }) => {
    logDistraction(item);
    setShowDistractionPicker(false);
    setRefocusPrompt('Take a breath. Back to focus 🎯');

    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    refocusTimerRef.current = setTimeout(() => {
      setRefocusPrompt(null);
    }, 3000);
  };

  // ── Break handlers (same logic as GlobalTimerUI) ──────────────────────────
  const handleBreakExtend = useCallback(() => {
    extendTimer(1);
  }, [extendTimer]);

  // ── Refocus Encouragement Screen (3-second duration) ──────────────────────
  if (refocusPrompt) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white select-none px-4 text-center cursor-pointer transition-all"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
        onClick={() => {
          if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
          setRefocusPrompt(null);
        }}
        title="Click anywhere to return to timer"
      >
        <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl mb-2.5 shadow-lg shadow-amber-500/10 animate-bounce">
          🎯
        </div>
        <p className="text-sm font-semibold text-white">Distraction Logged</p>
        <p className="text-xs text-amber-300 font-medium mt-1 mb-2">
          {refocusPrompt}
        </p>
        <p className="text-[10px] text-zinc-500">Tap anywhere to resume timer</p>
      </div>
    );
  }

  // ── Quick-tap Distraction Picker Screen ───────────────────────────────────
  if (showDistractionPicker) {
    // Session not-to-dos first, supplemented by defaults
    const combinedPresets = [
      ...(notToDoItems ?? []),
      ...DEFAULT_DISTRACTIONS.filter(
        (d) => !(notToDoItems ?? []).some((n) => n.label.toLowerCase() === d.label.toLowerCase())
      ),
    ];

    return (
      <div
        className="flex flex-col h-screen bg-zinc-950 text-white select-none p-3 justify-between"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      >
        <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-zinc-200">What pulled you away?</span>
          </div>
          <button
            onClick={() => setShowDistractionPicker(false)}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick-tap preset chips */}
        <div className="grid grid-cols-2 gap-1.5 my-auto overflow-y-auto max-h-[115px] py-1 scrollbar-none">
          {combinedPresets.slice(0, 6).map((item) => (
            <button
              key={item.label}
              onClick={() => handleSelectDistraction(item)}
              className="flex items-center gap-1.5 px-2.5 py-2 bg-zinc-900 hover:bg-amber-500/15 border border-zinc-800 hover:border-amber-500/40 text-zinc-300 hover:text-amber-200 rounded-xl text-xs font-medium transition-all text-left truncate active:scale-95 shadow-sm"
            >
              <span className="text-sm shrink-0">{item.emoji}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="pt-1 flex items-center justify-between text-[10px] text-zinc-500">
          <span>1-tap to log & refocus</span>
          <button
            onClick={() => setShowDistractionPicker(false)}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

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

        {/* Distracted button replacing abandon button */}
        <button
          onClick={() => setShowDistractionPicker(true)}
          title="I got distracted (Log & Refocus)"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-amber-500/15 text-zinc-300 hover:text-amber-300 border border-zinc-700/50 hover:border-amber-500/30 transition-all active:scale-95"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Distracted</span>
        </button>
      </div>
    </div>
  );
}

