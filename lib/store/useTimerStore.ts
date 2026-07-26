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
        const savedAt = saved._savedAt ?? 0;
        const plannedDuration = saved.duration ?? POMODORO_DURATION;

        if (saved.status === 'running' && savedAt) {
          const secondsPassed = Math.floor((Date.now() - savedAt) / 1000);

          // ── BUG-3: Stale session guard ──────────────────────────────────────
          // If we've been away for more than 3× the planned duration, the session
          // spans midnight or the user walked away. Abandon the block silently
          // rather than saving a corrupt cross-day session to the DB.
          const MAX_STALE_SECONDS = plannedDuration > 0 ? plannedDuration * 3 : 3 * 60 * 60;
          if (secondsPassed > MAX_STALE_SECONDS && saved.blockId) {
            console.warn('[timer/init] stale session detected — auto-abandoning block', saved.blockId);
            // Fire-and-forget: abandon API call. We still load as idle.
            fetch('/api/timer/abandon', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                blockId: saved.blockId,
                duration: restoredElapsed,
                total_duration: plannedDuration,
                failed_reason: 'stale_session_auto_abandon',
              }),
            }).catch((e) => console.error('[timer/init] abandon fetch failed', e));

            localStorage.removeItem(LS_KEY);
            set({ isLoaded: true });
            // Setup tick interval below and return
            setInterval(() => {
              const state = get();
              if (state.status === 'running') state.tick();
            }, 500);
            return;
          }
          // ─────────────────────────────────────────────────────────────────────

          restoredElapsed = plannedDuration > 0
            ? Math.min((saved.elapsed ?? 0) + secondsPassed, plannedDuration)
            : (saved.elapsed ?? 0) + secondsPassed;
        }

        const remaining = (saved.mode ?? 'pomodoro') === 'pomodoro'
          ? Math.max(0, plannedDuration - restoredElapsed)
          : restoredElapsed;

        // ── BUG-5: Completed + no blockId guard ──────────────────────────────
        // If state was saved as 'completed' but blockId is null (offline start or
        // cross-midnight page reload after completeTimer cleared blockId), there is
        // no DB record to update. Showing the review sheet in this case causes an
        // infinite spinner. Reset to idle instead.
        const restoredStatus =
          saved.status === 'completed' && !saved.blockId ? 'idle' : (saved.status ?? 'idle');
        if (restoredStatus === 'idle' && saved.status === 'completed' && !saved.blockId) {
          console.warn('[timer/init] completed session has no blockId — resetting to idle');
          localStorage.removeItem(LS_KEY);
        }
        // ─────────────────────────────────────────────────────────────────────

        set({
          status: restoredStatus,
          mode: saved.mode ?? 'pomodoro',
          elapsed: restoredStatus === 'idle' ? 0 : restoredElapsed,
          duration: plannedDuration,
          blockId: saved.blockId ?? null,
          task: restoredStatus === 'idle' ? null : (saved.task ?? null),
          strictMode: saved.strictMode ?? false,
          lastTick: restoredStatus === 'running' ? Date.now() : (saved.lastTick ?? 0),
          notToDoItems: restoredStatus === 'idle' ? [] : (saved.notToDoItems ?? []),
          isBreak: saved.isBreak ?? false,
          remaining: restoredStatus === 'idle' ? plannedDuration : remaining,
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
      if (!res.ok) throw new Error(data.error ?? 'Server error');

      const duration = get().duration;
      const remaining = get().mode === 'pomodoro' ? duration : 0;

      set({
        status: 'running',
        elapsed: 0,
        blockId: data.blockId,  // null if server failed — BUG-2: session runs client-only
        task,
        strictMode,
        lastTick: Date.now(),
        notToDoItems,
        isBreak,
        remaining,
      });
    } catch (err) {
      // BUG-2: Network offline at start — timer runs but blockId stays null.
      // Session will not be persisted to DB. We still allow the timer to run
      // so the user's focus session isn't blocked by a network hiccup.
      console.error('[timer/start] Failed — session will run offline (no DB save):', err);
    }
  },

  pauseTimer: () => {
    set({ status: 'paused' });
  },

  resumeTimer: () => {
    set({ status: 'running', lastTick: Date.now() });
  },

  completeTimer: async (reviewData) => {
    // BUG-4: Capture all values before set() so the API call uses pre-mutation state.
    const { blockId, elapsed, task, notToDoItems, mode, duration } = get();

    const updatedTask = task ? { ...task, elapsed_pomodoros: task.elapsed_pomodoros + (mode === 'pomodoro' ? 1 : 0) } : null;

    // Clear blockId immediately to prevent double-saves if Mark Done is clicked twice.
    set({
      status: 'completed',
      task: updatedTask,
      blockId: null,
    });

    if (!blockId) return null;
    try {
      const res = await fetch('/api/timer/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId,
          duration: elapsed,
          total_duration: duration,  // BUG-4 fix: captured before set()
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

