'use client';

import { useTimer } from '@/components/timer/TimerProvider';
import { Pause, Play, Square, PlusCircle, Coffee, RotateCcw, PictureInPicture2, X } from 'lucide-react';
import PiPTimerContent from '@/components/timer/PiPTimerContent';
import { usePiP } from '@/components/timer/usePiP';
import { copyStylesToWindow } from '@/components/timer/pipUtils';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// ── TypeScript declaration for the Document PiP API ─────────────────────────
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
      window: Window | null;
    };
  }
}

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function GlobalTimerUI() {
  const {
    state, remaining,
    pauseTimer, resumeTimer, abandonTimer,
    startTimer, completeTimer, extendTimer,
  } = useTimer();
  const pathname = usePathname();
  const { pipWindow, isPiPOpen, closePiP, setPiPWindow, isSupported } = usePiP();

  const [showBreak, setShowBreak] = useState(false);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Silent audio ────────────────────────────────────────────────────────
  useEffect(() => {
    const isActive = state.status === 'running' || state.status === 'paused';
    if (isActive) {
      if (!silentAudioRef.current) {
        const audio = new Audio(
          'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6urq6urq6urq6urq6urq6urq6urq6urq6v////////////////////////////////8AAAAATGF2YzU4LjUzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFN//MUZAMAAAGkAAAAAAAAA0gAAAAARSMx//MUZAYAAAGkAAAAAAAAA0gAAAAAOTku//MUZAkAAAGkAAAAAAAAA0gAAAAANVVV'
        );
        audio.loop = true;
        audio.volume = 0;
        silentAudioRef.current = audio;
      }
      silentAudioRef.current.play().catch(() => null);
    } else {
      silentAudioRef.current?.pause();
    }
  }, [state.status]);

  // ── Completion ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status === 'completed' && state.mode === 'pomodoro') {
      setShowBreak(true);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🍅 Pomodoro Complete! +30 XP', {
          body: isPiPOpen ? 'Check the floating window.' : 'Great work focus session.',
          icon: '/favicon.ico',
        });
      }

      if (Capacitor.isNativePlatform()) {
        LocalNotifications.schedule({
          notifications: [
            {
              title: '🍅 Pomodoro Complete!',
              body: 'Great work focus session. +30 XP. Take a break!',
              id: Math.floor(Date.now() / 1000) % 100000,
              schedule: { at: new Date(Date.now() + 1000) }, // Schedule 1 second from now
            }
          ]
        }).catch(err => console.error('[Capacitor] Notification failed', err));
      }

    } else {
      setShowBreak(false);
    }
  }, [state.status, state.mode, isPiPOpen]);

  // ── Auto-close PiP ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status === 'idle' && isPiPOpen) {
      closePiP();
    }
  }, [state.status, isPiPOpen, closePiP]);

  // ── Media Session ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const isActive = state.status === 'running' || state.status === 'paused';
    if (!isActive) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${fmt(remaining)} remaining`,
      artist: state.task?.title ?? 'Free Focus',
      album: state.mode === 'pomodoro' ? '🍅 Pomodoro' : '⏱ Stopwatch',
    });
    navigator.mediaSession.playbackState = state.status === 'paused' ? 'paused' : 'playing';
    navigator.mediaSession.setActionHandler('play', () => resumeTimer());
    navigator.mediaSession.setActionHandler('pause', () => pauseTimer());
    navigator.mediaSession.setActionHandler('stop', () => abandonTimer());
  }, [state.status, state.mode, state.task, remaining, pauseTimer, resumeTimer, abandonTimer]);

  // ── PiP Opener ──────────────────────────────────────────────────────────
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

  // ── Derived ─────────────────────────────────────────────────────────────
  const isOnFocusPage = pathname === '/focus';
  const isActive = state.status === 'running' || state.status === 'paused';
  const progress = state.mode === 'pomodoro' && state.duration > 0
    ? Math.max(0, Math.min(1, 1 - remaining / state.duration))
    : 0;

  return (
    <>
      {isPiPOpen && pipWindow && createPortal(
        <PiPTimerContent onClose={closePiP} />,
        pipWindow.document.body
      )}

      {showBreak && !isPiPOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
           <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 text-center shadow-2xl">
              <div className="text-4xl mb-4">🍅</div>
              <h2 className="text-2xl font-bold mb-2">Session Complete!</h2>
              <div className="flex flex-col gap-2 mt-6">
                <button onClick={() => { completeTimer(); setTimeout(() => { startTimer(state.task, state.strictMode); setTimeout(() => extendTimer(1), 50); }, 50); }} className="px-6 py-3 bg-indigo-600 rounded-xl font-bold">Extend +1 min</button>
                <button onClick={() => completeTimer()} className="px-6 py-3 bg-emerald-600 rounded-xl font-bold">Take Break</button>
                <button onClick={() => { completeTimer(); startTimer(state.task, state.strictMode); }} className="px-6 py-3 bg-zinc-800 rounded-xl">Skip Break</button>
              </div>
           </div>
        </div>
      )}

      {isActive && !isOnFocusPage && (
        <div className="fixed bottom-6 right-6 z-[100] w-72 rounded-2xl overflow-hidden shadow-2xl border border-zinc-700/60 bg-zinc-900/95 backdrop-blur-md p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-mono font-bold tabular-nums">{fmt(remaining)}</span>
              {isPiPOpen && <span className="text-[10px] text-indigo-400 font-bold flex items-center gap-1"><PictureInPicture2 className="w-2.5 h-2.5"/> PiP</span>}
            </div>
            <button onClick={() => abandonTimer()} className="p-1.5 text-zinc-700 hover:text-red-400"><Square className="w-3.5 h-3.5"/></button>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={state.status === 'paused' ? resumeTimer : pauseTimer} className="flex-1 py-2 bg-zinc-800 rounded-xl text-sm font-medium">
              {state.status === 'paused' ? <Play className="w-3.5 h-3.5 mx-auto" /> : <Pause className="w-3.5 h-3.5 mx-auto" />}
            </button>
            <button onClick={() => extendTimer(1)} className="px-3 py-2 bg-zinc-800 rounded-xl text-sm">+1m</button>
            
            {isSupported && (
              <button onClick={isPiPOpen ? closePiP : openPiP} className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                {isPiPOpen ? <X className="w-3.5 h-3.5" /> : <PictureInPicture2 className="w-3.5 h-3.5" />}
              </button>
            )}
            
            <Link href="/focus" className="p-2 bg-zinc-800 rounded-xl">↗</Link>
          </div>
        </div>
      )}
    </>
  );
}
