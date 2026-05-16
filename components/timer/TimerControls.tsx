'use client';

import { useTimer } from './TimerProvider';
import { Play, Pause, Square, CheckCircle, Maximize2 } from 'lucide-react';

interface TimerControlsProps {
  onFlipClock: () => void;
  onComplete?: () => void;
  /** Override the start action (for not-to-do guard in Focus page) */
  onStart?: () => void;
}

export default function TimerControls({ onFlipClock, onComplete, onStart }: TimerControlsProps) {
  const { state, startTimer, pauseTimer, resumeTimer, completeTimer, abandonTimer } = useTimer();
  const { status } = state;

  const handleComplete = async () => {
    // completeTimer with no args still saves session; review sheet handles XP breakdown
    await completeTimer();
    onComplete?.();
  };

  return (
    <div className="flex items-center gap-3">
      {/* Fullscreen flip-clock */}
      <button
        onClick={onFlipClock}
        title="Fullscreen flip-clock"
        className="p-2.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-xl transition-all"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {status === 'idle' && (
        <button
          id="timer-start-btn"
          onClick={onStart ?? (() => startTimer(state.task))}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20"
        >
          <Play className="w-4 h-4 fill-current" /> Start Session
        </button>
      )}

      {status === 'running' && (
        <>
          <button
            id="timer-pause-btn"
            onClick={pauseTimer}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-all"
          >
            <Pause className="w-4 h-4 fill-current" /> Pause
          </button>
          <button
            id="timer-abandon-btn"
            onClick={() => abandonTimer()}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 text-sm font-medium rounded-xl transition-all"
          >
            <Square className="w-4 h-4" /> Abandon
          </button>
        </>
      )}

      {status === 'paused' && (
        <>
          <button
            id="timer-resume-btn"
            onClick={resumeTimer}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all"
          >
            <Play className="w-4 h-4 fill-current" /> Resume
          </button>
          <button
            onClick={() => abandonTimer()}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 text-sm font-medium rounded-xl transition-all"
          >
            <Square className="w-4 h-4" /> Abandon
          </button>
        </>
      )}

      {status === 'completed' && (
        <button
          id="timer-done-btn"
          onClick={handleComplete}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/20"
        >
          <CheckCircle className="w-4 h-4" /> Mark Done
        </button>
      )}
    </div>
  );
}
