'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, CheckSquare, Flame, Leaf, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'dayly_last_checkin';
const TIMER_STATUS_KEY = 'dayly_timer_v1'; // localStorage key used by useTimerStore
const INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const POLL_MS = 60 * 1000;           // check every 60 seconds

function isTimerRunning(): boolean {
  try {
    const raw = localStorage.getItem(TIMER_STATUS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // useTimerStore persists state with a `state` wrapper from zustand persist
    const status = parsed?.state?.status ?? parsed?.status;
    return status === 'running';
  } catch {
    return false;
  }
}

export default function CheckInDialog() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  const checkAndTrigger = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (isTimerRunning()) return; // never interrupt deep work

    const lastAsked = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
    const elapsed = Date.now() - lastAsked;

    if (elapsed >= INTERVAL_MS) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    // Small initial delay so the app can hydrate before the first check
    const initTimer = setTimeout(checkAndTrigger, 3000);
    const interval = setInterval(checkAndTrigger, POLL_MS);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [checkAndTrigger]);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setOpen(false);
    setDismissed(false);
  }, []);

  const handleAction = useCallback((tab: string) => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setOpen(false);
    router.push(`/action?tab=${tab}`);
  }, [router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
    >
      {/* Card — slide up on mobile, scale-in on desktop */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
        style={{
          background: 'linear-gradient(135deg, rgba(24,24,30,0.97) 0%, rgba(18,18,26,0.97) 100%)',
          border: '1px solid rgba(99,102,241,0.25)',
          animation: 'checkin-slide-up 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        {/* Top gradient strip */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">⏰</span>
                <h2 className="text-base font-bold text-white">Hourly Check-in</h2>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Quick pulse — have you made progress in the last hour?
              </p>
            </div>
            <button
              id="checkin-dismiss"
              onClick={dismiss}
              className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all -mt-1 -mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5">
            <button
              id="checkin-task"
              onClick={() => handleAction('tasks')}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-indigo-500/25 bg-indigo-500/8 hover:bg-indigo-500/15 hover:border-indigo-500/40 text-left transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <CheckSquare className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Completed a Task</p>
                <p className="text-[11px] text-zinc-500">Mark progress on your task list</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
            </button>

            <button
              id="checkin-pressure"
              onClick={() => handleAction('pressure')}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-orange-500/25 bg-orange-500/8 hover:bg-orange-500/15 hover:border-orange-500/40 text-left transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Crushed a Pressure Task</p>
                <p className="text-[11px] text-zinc-500">Log high-stakes execution</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all" />
            </button>

            <button
              id="checkin-habit"
              onClick={() => handleAction('goals-habits')}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/8 hover:bg-emerald-500/15 hover:border-emerald-500/40 text-left transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Leaf className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Logged a Habit</p>
                <p className="text-[11px] text-zinc-500">Keep your weekly streak alive</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>

          {/* Skip footer */}
          <div className="mt-4 pt-4 border-t border-zinc-800/60">
            <button
              id="checkin-skip"
              onClick={dismiss}
              className="w-full py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Nothing yet — remind me in an hour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
