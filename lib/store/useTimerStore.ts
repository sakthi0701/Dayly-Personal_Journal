import { create } from 'zustand';
import { syncTimerToWidget } from '../cache';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimerMode = 'pomodoro' | 'stopwatch';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface TimerTask {
  id: string;
  title: string;
  estimated_pomodoros: number;
  elapsed_pomodoros: number;
}

export interface NotToDoItem {
  label: string;
  emoji: string;
}

export interface TimerState {
  status: TimerStatus;
  mode: TimerMode;
  elapsed: number;        // seconds elapsed
  duration: number;       // total seconds for pomodoro (default 25×60)
  blockId: string | null; // current time_blocks row id
  task: TimerTask | null;
  strictMode: boolean;
  lastTick: number;       // timestamp of the last computed tick
  notToDoItems: NotToDoItem[];
  isBreak: boolean;
}

export interface TimerStore extends TimerState {
  remaining: number;
  isLoaded: boolean;

  // Actions
  init: () => void;
  startTimer: (task: TimerTask | null, strictMode?: boolean, notToDoItems?: NotToDoItem[], isBreak?: boolean) => Promise<void>;
  pauseTimer: () => void;
  resumeTimer: () => void;
  completeTimer: (reviewData?: { triggeredDistractions: NotToDoItem[]; completionNote?: string }) => Promise<{ xpEarned: number; xpDeducted: number; cleanSession: boolean } | null>;
  abandonTimer: (failedReason?: string) => Promise<void>;
  setMode: (mode: TimerMode) => void;
  setDuration: (minutes: number) => void;
  extendTimer: (minutes: number) => void;
  setTask: (task: TimerTask | null) => void;
  setNotToDoItems: (items: NotToDoItem[]) => void;
  dismissTimer: () => void;
  tick: () => void;
}

const POMODORO_DURATION = 25 * 60;
const LS_KEY = 'dayly_timer_v1';

export const useTimerStore = create<TimerStore>((set, get) => ({
  status: 'idle',
  mode: 'pomodoro',
  elapsed: 0,
  duration: POMODORO_DURATION,
  blockId: null,
  task: null,
  strictMode: false,
  lastTick: 0,
  notToDoItems: [],
  isBreak: false,
  remaining: POMODORO_DURATION,
  isLoaded: false,

  init: () => {
    if (get().isLoaded) return;

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as TimerState & { _savedAt?: number };
        let restoredElapsed = saved.elapsed ?? 0;
        
        if (saved.status === 'running' && saved._savedAt) {
          const secondsPassed = Math.floor((Date.now() - saved._savedAt) / 1000);
          restoredElapsed = (saved.duration ?? POMODORO_DURATION) > 0 
            ? Math.min((saved.elapsed ?? 0) + secondsPassed, saved.duration ?? POMODORO_DURATION)
            : (saved.elapsed ?? 0) + secondsPassed;
        }

        const remaining = (saved.mode ?? 'pomodoro') === 'pomodoro'
          ? Math.max(0, (saved.duration ?? POMODORO_DURATION) - restoredElapsed)
          : restoredElapsed;

        set({
          status: saved.status ?? 'idle',
          mode: saved.mode ?? 'pomodoro',
          elapsed: restoredElapsed,
          duration: saved.duration ?? POMODORO_DURATION,
          blockId: saved.blockId ?? null,
          task: saved.task ?? null,
          strictMode: saved.strictMode ?? false,
          lastTick: saved.status === 'running' ? Date.now() : (saved.lastTick ?? 0),
          notToDoItems: saved.notToDoItems ?? [],
          isBreak: saved.isBreak ?? false,
          remaining,
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
    } catch (err) {
      console.error('Failed to restore timer state:', err);
      set({ isLoaded: true });
    }

    // Setup tick interval
    setInterval(() => {
      const state = get();
      if (state.status === 'running') {
        state.tick();
      }
    }, 500);
  },

  tick: () => {
    const state = get();
    if (state.status !== 'running') return;
    const now = Date.now();
    const delta = Math.floor((now - state.lastTick) / 1000);
    if (delta < 1) return; // Wait for full second

    const nextElapsed = state.elapsed + delta;
    if (state.mode === 'pomodoro' && nextElapsed >= state.duration) {
      set({
        elapsed: state.duration,
        status: 'completed',
        lastTick: now,
        remaining: 0,
      });
    } else {
      const remaining = state.mode === 'pomodoro'
        ? Math.max(0, state.duration - nextElapsed)
        : nextElapsed;
      set({
        elapsed: nextElapsed,
        lastTick: state.lastTick + (delta * 1000),
        remaining,
      });
    }
  },

  startTimer: async (task, strictMode = false, notToDoItems = [], isBreak = false) => {
    try {
      const res = await fetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task?.id ?? null,
          mode: get().mode,
          strict_mode: strictMode,
          is_break: isBreak,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const duration = get().duration;
      const remaining = get().mode === 'pomodoro' ? duration : 0;

      set({
        status: 'running',
        elapsed: 0,
        blockId: data.blockId,
        task,
        strictMode,
        lastTick: Date.now(),
        notToDoItems,
        isBreak,
        remaining,
      });
    } catch (err) {
      console.error('Failed to start timer:', err);
    }
  },

  pauseTimer: () => {
    set({ status: 'paused' });
  },

  resumeTimer: () => {
    set({ status: 'running', lastTick: Date.now() });
  },

  completeTimer: async (reviewData) => {
    const { blockId, elapsed, task, notToDoItems, mode } = get();

    const updatedTask = task ? { ...task, elapsed_pomodoros: task.elapsed_pomodoros + (mode === 'pomodoro' ? 1 : 0) } : null;

    set({
      status: 'completed',
      task: updatedTask,
    });

    if (!blockId) return null;
    try {
      const res = await fetch('/api/timer/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId,
          duration: elapsed,
          task_id: task?.id ?? null,
          not_to_do_selected: notToDoItems,
          triggered_distractions: reviewData?.triggeredDistractions ?? [],
          completion_note: reviewData?.completionNote ?? null,
        }),
      });
      const result = await res.json();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('dayly-refresh-tasks'));
      }

      return result as { xpEarned: number; xpDeducted: number; cleanSession: boolean };
    } catch (err) {
      console.error('Failed to complete timer:', err);
      return null;
    }
  },

  abandonTimer: async (failedReason = 'manual_abandon') => {
    const { blockId, elapsed, duration, mode } = get();

    const resetDuration = mode === 'pomodoro' ? POMODORO_DURATION : 0;
    set({
      status: 'idle',
      elapsed: 0,
      duration: resetDuration,
      blockId: null,
      task: null,
      strictMode: false,
      lastTick: 0,
      notToDoItems: [],
      isBreak: false,
      remaining: mode === 'pomodoro' ? resetDuration : 0,
    });

    if (!blockId) return;
    try {
      await fetch('/api/timer/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId, duration: elapsed, total_duration: duration, failed_reason: failedReason }),
      });
    } catch (err) {
      console.error('Failed to abandon timer:', err);
    }
  },

  setMode: (mode) => {
    const duration = mode === 'pomodoro' ? POMODORO_DURATION : 0;
    set({
      status: 'idle',
      mode,
      elapsed: 0,
      duration,
      blockId: null,
      task: null,
      strictMode: false,
      lastTick: 0,
      notToDoItems: [],
      isBreak: false,
      remaining: duration,
    });
  },

  setDuration: (minutes) => {
    const duration = minutes * 60;
    const elapsed = get().elapsed;
    const remaining = get().mode === 'pomodoro' ? Math.max(0, duration - elapsed) : elapsed;
    set({ duration, remaining });
  },

  extendTimer: (minutes) => {
    const { status, duration, elapsed, mode } = get();
    const addSeconds = minutes * 60;
    const newDuration = duration + addSeconds;
    const now = Date.now();

    const remaining = mode === 'pomodoro' ? Math.max(0, newDuration - elapsed) : elapsed;
    set({
      duration: newDuration,
      status: 'running',
      lastTick: now,
      remaining,
    });
  },

  setTask: (task) => {
    set({ task });
  },

  setNotToDoItems: (notToDoItems) => {
    set({ notToDoItems });
  },

  dismissTimer: () => {
    get().abandonTimer();
  },
}));

// ─── LocalStorage Subscription ───────────────────────────────────────────────

if (typeof window !== 'undefined') {
  useTimerStore.subscribe((state) => {
    if (!state.isLoaded) return;
    try {
      const stateToSave = {
        status: state.status,
        mode: state.mode,
        elapsed: state.elapsed,
        duration: state.duration,
        blockId: state.blockId,
        task: state.task,
        strictMode: state.strictMode,
        lastTick: state.lastTick,
        notToDoItems: state.notToDoItems,
        isBreak: state.isBreak,
        _savedAt: Date.now(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(stateToSave));
    } catch {
      // ignore quota exceeded
    }

    // Sync to Android Widget (Capacitor Preferences)
    if (state.status !== 'idle' || state.task) {
      syncTimerToWidget(state.status, state.task?.title ?? null, state.remaining, state.isBreak);
    }
  });
}

