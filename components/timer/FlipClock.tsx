'use client';

import { useEffect, useState } from 'react';
import { useTimer } from './TimerProvider';
import { Minimize2, Play, Pause } from 'lucide-react';

interface FlipDigitProps {
  value: string;
  prevValue: string;
}

function FlipDigit({ value, prevValue }: FlipDigitProps) {
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (value !== prevValue) {
      setFlipping(true);
      const t = setTimeout(() => setFlipping(false), 400);
      return () => clearTimeout(t);
    }
  }, [value, prevValue]);

  return (
    <div className="relative w-32 h-44 md:w-48 md:h-64" style={{ perspective: '600px' }}>
      <style>{`
        @keyframes flipDown {
          from { transform: rotateX(0deg); opacity: 1; }
          to   { transform: rotateX(-90deg); opacity: 0; }
        }
        .flip-animate {
          animation: flipDown 0.4s ease-in-out forwards;
          transform-origin: bottom center;
        }
      `}</style>

      {/* Static bottom half (new value) */}
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 border border-zinc-700/60 rounded-2xl overflow-hidden select-none shadow-2xl">
        <span className="font-mono text-[96px] md:text-[144px] font-bold text-white tabular-nums leading-none">
          {value}
        </span>
      </div>

      {/* Animated flip top half */}
      {flipping && (
        <div
          className="flip-animate absolute inset-0 flex items-center justify-center bg-zinc-800 border border-zinc-600 rounded-2xl overflow-hidden select-none shadow-2xl"
        >
          <span className="font-mono text-[96px] md:text-[144px] font-bold text-zinc-400 tabular-nums leading-none">
            {prevValue}
          </span>
        </div>
      )}
    </div>
  );
}

interface FlipClockProps {
  onExit: () => void;
}

export default function FlipClock({ onExit }: FlipClockProps) {
  const { remaining, state, pauseTimer, resumeTimer, extendTimer } = useTimer();

  const totalSeconds = state.mode === 'pomodoro' ? remaining : remaining;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  const [prev, setPrev] = useState({ h: pad(h), m: pad(m), s: pad(s) });
  const curr = { h: pad(h), m: pad(m), s: pad(s) };

  useEffect(() => {
    setPrev(curr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSeconds]);

  const showHours = h > 0 || state.mode === 'stopwatch';

  return (
    <div className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col items-center justify-center gap-10">
      {/* Exit button */}
      <button
        onClick={onExit}
        className="absolute top-6 right-6 p-4 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-2xl transition-all"
        title="Exit fullscreen"
      >
        <Minimize2 className="w-8 h-8" />
      </button>

      {/* Task name */}
      {state.task && (
        <p className="text-zinc-500 text-lg md:text-xl font-medium tracking-widest uppercase">
          {state.task.title}
        </p>
      )}

      {/* Flip digits */}
      <div className="flex items-center gap-4 md:gap-8">
        {showHours && (
          <>
            <FlipDigit value={curr.h} prevValue={prev.h} />
            <span className="text-zinc-700 text-7xl md:text-9xl font-bold mb-4">:</span>
          </>
        )}
        <FlipDigit value={curr.m} prevValue={prev.m} />
        <span className="text-zinc-700 text-7xl md:text-9xl font-bold mb-4">:</span>
        <FlipDigit value={curr.s} prevValue={prev.s} />
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${
          state.status === 'running' ? 'bg-indigo-400 animate-pulse' :
          state.status === 'paused'  ? 'bg-amber-400' :
          state.status === 'completed' ? 'bg-emerald-400' :
          'bg-zinc-700'
        }`} />
        <span className="text-zinc-500 text-sm md:text-base uppercase tracking-widest">
          {state.mode === 'pomodoro' ? '🍅 Focus Session' : '⏱ Stopwatch'}
        </span>
      </div>

      {/* Controls */}
      {state.status !== 'idle' && state.status !== 'completed' && (
        <div className="flex items-center gap-6 mt-4">
          <button
            onClick={state.status === 'paused' ? resumeTimer : pauseTimer}
            className="w-20 h-20 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shadow-xl"
            title={state.status === 'paused' ? 'Resume' : 'Pause'}
          >
            {state.status === 'paused' ? <Play className="w-10 h-10 ml-2" /> : <Pause className="w-10 h-10" />}
          </button>
          
          {state.mode === 'pomodoro' && (
            <button
              onClick={() => extendTimer(1)}
              className="px-8 py-6 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 font-bold hover:text-indigo-400 hover:border-indigo-500/30 transition-all text-xl shadow-xl"
            >
              +1 min
            </button>
          )}
        </div>
      )}
    </div>
  );
}
