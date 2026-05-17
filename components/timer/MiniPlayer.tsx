'use client';

import { useTimer } from './TimerProvider';
import { Pause, Play, Square, PictureInPicture2, X } from 'lucide-react';
import { usePiP } from './usePiP';
import { copyStylesToWindow } from './pipUtils';
import { useCallback } from 'react';
import Link from 'next/link';

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function MiniPlayer({ collapsed }: { collapsed: boolean }) {
  const remaining = useTimer(state => state.remaining);
  const status = useTimer(state => state.status);
  const mode = useTimer(state => state.mode);
  const duration = useTimer(state => state.duration);
  const task = useTimer(state => state.task);
  const pauseTimer = useTimer(state => state.pauseTimer);
  const resumeTimer = useTimer(state => state.resumeTimer);
  const abandonTimer = useTimer(state => state.abandonTimer);
  const extendTimer = useTimer(state => state.extendTimer);
  const state = { status, mode, duration, task };
  const { isPiPOpen, closePiP, setPiPWindow, isSupported } = usePiP();

  const openPiP = useCallback(async () => {
    if (!('documentPictureInPicture' in window) || !window.documentPictureInPicture) {
      alert('Document PiP is not supported in this browser. Try Chrome/Edge.');
      return;
    }
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: 240 });
      copyStylesToWindow(pip);
      setPiPWindow(pip);
    } catch (err) {
      console.error('[PiP] Failed:', err);
    }
  }, [setPiPWindow]);

  if (state.status === 'idle' || state.status === 'completed') return null;

  const progress = state.mode === 'pomodoro' && state.duration > 0
    ? Math.max(0, Math.min(1, 1 - remaining / state.duration))
    : 0;

  const isPaused = state.status === 'paused';
  const modeIcon = state.mode === 'pomodoro' ? '🍅' : '⏱';

  if (collapsed) {
    // Compact pill for collapsed sidebar
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-3 border-t border-zinc-800/60">
        <Link href="/focus" title="Open Focus">
          <div className="relative w-10 h-10 flex items-center justify-center">
            <svg className="absolute inset-0 rotate-[-90deg]" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="17" fill="none" stroke="#27272a" strokeWidth="3" />
              <circle
                cx="20" cy="20" r="17"
                fill="none"
                stroke={isPaused ? '#f59e0b' : '#818cf8'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 17}
                strokeDashoffset={(1 - progress) * 2 * Math.PI * 17}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
            </svg>
            <span className="text-sm z-10">{modeIcon}</span>
          </div>
        </Link>
        <span className="text-[10px] font-mono text-zinc-400">{fmt(remaining)}</span>
        <div className="flex flex-col gap-1">
          <button
            onClick={isPaused ? resumeTimer : pauseTimer}
            className="p-1 text-zinc-500 hover:text-white transition-colors"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          {isSupported && (
            <button
              onClick={isPiPOpen ? closePiP : openPiP}
              className={`p-1 transition-colors ${isPiPOpen ? 'text-indigo-400 hover:text-indigo-300' : 'text-zinc-500 hover:text-white'}`}
              title={isPiPOpen ? 'Close PiP' : 'Pop out PiP'}
            >
              {isPiPOpen ? <X className="w-3.5 h-3.5" /> : <PictureInPicture2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Full miniplayer for expanded sidebar
  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/80 shadow-lg shadow-black/30">
      {/* Thin progress bar at top */}
      {state.mode === 'pomodoro' && (
        <div className="h-0.5 bg-zinc-800">
          <div
            className={`h-full transition-all duration-700 ${isPaused ? 'bg-amber-500' : 'bg-indigo-500'}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      <div className="px-3 py-2.5">
        {/* Top row: mode + time */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Link href="/focus" className="flex items-center gap-1.5 group">
              <span className="text-sm">{modeIcon}</span>
              <span className="text-xs font-mono font-bold text-white group-hover:text-indigo-300 transition-colors">
                {fmt(remaining)}
              </span>
            </Link>
            {isPiPOpen && (
              <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-tighter bg-indigo-500/10 px-1 rounded border border-indigo-500/20">PiP</span>
            )}
            {isPaused && (
              <span className="text-[10px] text-amber-500 font-medium">PAUSED</span>
            )}
          </div>
          <button
            onClick={() => abandonTimer()}
            className="p-0.5 text-zinc-700 hover:text-red-400 transition-colors"
            title="Stop session"
          >
            <Square className="w-3 h-3" />
          </button>
        </div>

        {/* Task name */}
        {state.task && (
          <p className="text-[11px] text-zinc-500 truncate mb-2">{state.task.title}</p>
        )}

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={isPaused ? resumeTimer : pauseTimer}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isPaused
                ? 'bg-indigo-600/80 hover:bg-indigo-500 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>

          {state.mode === 'pomodoro' && (
            <button
              onClick={() => extendTimer(1)}
              className="px-2 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-indigo-300 transition-all border border-transparent hover:border-indigo-500/20"
              title="Extend by 1 minute"
            >
              +1m
            </button>
          )}

          {isSupported && (
            <button
              onClick={isPiPOpen ? closePiP : openPiP}
              className={`px-2 py-1.5 rounded-lg transition-all border ${
                isPiPOpen 
                  ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400' 
                  : 'bg-zinc-800 border-transparent text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
              title={isPiPOpen ? 'Close PiP' : 'Pop out PiP'}
            >
              {isPiPOpen ? <X className="w-3.5 h-3.5" /> : <PictureInPicture2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

