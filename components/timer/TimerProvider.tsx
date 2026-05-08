'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimerMode = 'pomodoro' | 'stopwatch';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface TimerTask {
  id: string;
  title: string;
  estimated_pomodoros: number;
  elapsed_pomodoros: number;
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
}

type TimerAction =
  | { type: 'START'; blockId: string; task: TimerTask | null; strictMode: boolean; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME'; now: number }
  | { type: 'COMPLETE' }
  | { type: 'ABANDON' }
  | { type: 'SET_MODE'; mode: TimerMode }
  | { type: 'SET_DURATION'; minutes: number }
  | { type: 'EXTEND_DURATION'; seconds: number }
  | { type: 'RESTORE'; state: TimerState };

// ─── Default State ────────────────────────────────────────────────────────────

const POMODORO_DURATION = 25 * 60;

const defaultState: TimerState = {
  status: 'idle',
  mode: 'pomodoro',
  elapsed: 0,
  duration: POMODORO_DURATION,
  blockId: null,
  task: null,
  strictMode: false,
  lastTick: 0,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        status: 'running',
        elapsed: 0,
        blockId: action.blockId,
        task: action.task,
        strictMode: action.strictMode,
        lastTick: action.now,
      };
    case 'TICK': {
      const delta = Math.floor((action.now - state.lastTick) / 1000);
      if (delta < 1) return state; // Wait for full second
      const nextElapsed = state.elapsed + delta;
      if (state.mode === 'pomodoro' && nextElapsed >= state.duration) {
        return { ...state, elapsed: state.duration, status: 'completed', lastTick: action.now };
      }
      return { ...state, elapsed: nextElapsed, lastTick: state.lastTick + (delta * 1000) };
    }
    case 'PAUSE':
      return { ...state, status: 'paused' };
    case 'RESUME':
      return { ...state, status: 'running', lastTick: action.now };
    case 'COMPLETE':
      return { ...state, status: 'completed' };
    case 'ABANDON':
      return { ...defaultState, mode: state.mode, duration: state.duration };
    case 'SET_MODE':
      return { ...defaultState, mode: action.mode, duration: action.mode === 'pomodoro' ? state.duration : 0 };
    case 'SET_DURATION':
      return { ...state, duration: action.minutes * 60 };
    case 'EXTEND_DURATION':
      // Add seconds to duration — effectively extends the current session
      return { ...state, duration: state.duration + action.seconds, status: 'running' };
    case 'RESTORE':
      return action.state;
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface TimerContextValue {
  state: TimerState;
  remaining: number; // seconds left (for pomodoro) or elapsed (for stopwatch)
  startTimer: (task: TimerTask | null, strictMode?: boolean) => Promise<void>;
  pauseTimer: () => void;
  resumeTimer: () => void;
  completeTimer: () => Promise<void>;
  abandonTimer: (failedReason?: string) => Promise<void>;
  setMode: (mode: TimerMode) => void;
  setDuration: (minutes: number) => void;
  extendTimer: (minutes: number) => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within TimerProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

const LS_KEY = 'dayly_timer_v1';

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(timerReducer, defaultState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoaded = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist to localStorage on every state change
  useEffect(() => {
    if (!isLoaded.current) return; // Don't overwrite LS before loading
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...state, _savedAt: Date.now() }));
    } catch {
      // storage quota exceeded — ignore
    }
  }, [state]);

  // Restore from localStorage on mount (account for elapsed real-world time)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as TimerState & { _savedAt: number };
        if (saved.status === 'running') {
          const secondsPassed = Math.floor((Date.now() - saved._savedAt) / 1000);
          // Only cap if duration > 0 (pomodoro mode)
          const restoredElapsed = saved.duration > 0 
            ? Math.min(saved.elapsed + secondsPassed, saved.duration)
            : saved.elapsed + secondsPassed;
            
          dispatch({ type: 'RESTORE', state: { ...saved, elapsed: restoredElapsed } });
        } else if (saved.status === 'paused' || saved.status === 'completed') {
          dispatch({ type: 'RESTORE', state: saved });
        }
      }
    } catch (err) {
      console.error('Failed to restore timer state:', err);
    } finally {
      isLoaded.current = true;
    }
  }, []);

  // Tick interval management
  useEffect(() => {
    if (state.status === 'running') {
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'TICK', now: Date.now() });
      }, 500); // Run at 500ms to catch up quicker when tab reactivates
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.status]);

  const startTimer = useCallback(async (task: TimerTask | null, strictMode = false) => {
    try {
      const res = await fetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task?.id ?? null,
          mode: stateRef.current.mode,
          strict_mode: strictMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      dispatch({ type: 'START', blockId: data.blockId, task, strictMode, now: Date.now() });
    } catch (err) {
      console.error('Failed to start timer:', err);
    }
  }, []);

  const pauseTimer = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const resumeTimer = useCallback(() => dispatch({ type: 'RESUME', now: Date.now() }), []);

  const completeTimer = useCallback(async () => {
    const { blockId, elapsed, task } = stateRef.current;
    dispatch({ type: 'COMPLETE' });
    if (!blockId) return;
    try {
      await fetch('/api/timer/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId, duration: elapsed, task_id: task?.id ?? null }),
      });
    } catch (err) {
      console.error('Failed to complete timer:', err);
    }
  }, []);

  const abandonTimer = useCallback(async (failedReason = 'manual_abandon') => {
    const { blockId, elapsed } = stateRef.current;
    dispatch({ type: 'ABANDON' });
    if (!blockId) return;
    try {
      await fetch('/api/timer/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId, duration: elapsed, failed_reason: failedReason }),
      });
    } catch (err) {
      console.error('Failed to abandon timer:', err);
    }
  }, []);

  const setMode = useCallback((mode: TimerMode) => dispatch({ type: 'SET_MODE', mode }), []);
  const setDuration = useCallback((minutes: number) => dispatch({ type: 'SET_DURATION', minutes }), []);
  const extendTimer = useCallback((minutes: number) => dispatch({ type: 'EXTEND_DURATION', seconds: minutes * 60 }), []);

  const remaining =
    state.mode === 'pomodoro'
      ? Math.max(0, state.duration - state.elapsed)
      : state.elapsed;

  // Update document title
  useEffect(() => {
    if (state.status === 'running' || state.status === 'paused') {
      const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
      const secs = (remaining % 60).toString().padStart(2, '0');
      const icon = state.mode === 'pomodoro' ? '🍅' : '⏱';
      const statusIcon = state.status === 'paused' ? '⏸ ' : '';
      document.title = `${statusIcon}(${mins}:${secs}) ${icon} | Dayly`;
    } else {
      document.title = 'Dayly';
    }
  }, [remaining, state.status, state.mode]);

  return (
    <TimerContext.Provider value={{
      state,
      remaining,
      startTimer,
      pauseTimer,
      resumeTimer,
      completeTimer,
      abandonTimer,
      setMode,
      setDuration,
      extendTimer,
    }}>
      {children}
    </TimerContext.Provider>
  );
}
