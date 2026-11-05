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

export interface LoggedDistraction {
  label: string;
  emoji: string;
  timestamp: number;
  elapsedSeconds: number;
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
  loggedDistractions: LoggedDistraction[];
  breakReminderId: string | null; // telegram_reminders row that pings Telegram when the break ends
  remoteSessionId: string | null; // last Telegram-started session seen (adopted once, never re-adopted)
  remoteLinked: boolean;          // the current session is that Telegram-started one
}

export interface TimerStore extends TimerState {
  remaining: number;
  isLoaded: boolean;

  // Actions
  init: () => void;
  startTimer: (task: TimerTask | null, strictMode?: boolean, notToDoItems?: NotToDoItem[]) => Promise<void>;
  startBreak: (minutes: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  completeTimer: (reviewData?: { triggeredDistractions: NotToDoItem[]; completionNote?: string }) => Promise<{ coinsEarned: number; coinsDeducted: number; cleanSession: boolean } | null>;
  abandonTimer: (failedReason?: string) => Promise<void>;
  setMode: (mode: TimerMode) => void;
  setDuration: (minutes: number) => void;
  extendTimer: (minutes: number) => void;
  setTask: (task: TimerTask | null) => void;
  setNotToDoItems: (items: NotToDoItem[]) => void;
  logDistraction: (item: { label: string; emoji: string }) => void;
  dismissTimer: () => void;
  tick: () => void;
  syncRemoteTimer: () => Promise<void>;
}

const POMODORO_DURATION = 25 * 60;
const LS_KEY = 'dayly_timer_v1';
const BREAK_NOTIFICATION_ID = 7001;

// ─── Break-end alerts ────────────────────────────────────────────────────────
// Breaks are client-only (no time_blocks row), but the "break over" alert must
// arrive even if the tab is closed or the Android app is asleep. So the alert is
// scheduled up-front: a native notification at the end time, plus a
// telegram_reminders row that the per-minute pg_cron job delivers.
// Kept in sync on every state change: running break → (re)schedule at now+remaining;
// completed break → leave it to fire; ended early / paused → cancel.

async function scheduleNativeBreakEnd(endsAt: Date | null): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: BREAK_NOTIFICATION_ID }] });
  if (!endsAt) return;
  await LocalNotifications.schedule({
    notifications: [{
      id: BREAK_NOTIFICATION_ID,
      title: '☕ Break over',
      body: 'Time to get back into deep work.',
      schedule: { at: endsAt, allowWhileIdle: true },
    }],
  });
}

// Serialised so a quick pause → resume can't race the create request
let breakAlertQueue: Promise<void> = Promise.resolve();

// A break that ran to the end must still ping Telegram even if the user clicks
// Dismiss / Start Focus on the "Break Over" prompt before the per-minute cron runs —
// so forget the reminder instead of letting syncBreakAlert cancel it.
// (Cancelling here silently swallowed every break-over ping in testing. Don't revert.)
function releaseFinishedBreakAlert(): void {
  const { isBreak, status, breakReminderId } = useTimerStore.getState();
  if (isBreak && status === 'completed' && breakReminderId) {
    useTimerStore.setState({ breakReminderId: null });
  }
}

function syncBreakAlert(): void {
  const { isBreak, status, remaining, task } = useTimerStore.getState();
  if (isBreak && status === 'completed') return; // due now — let it fire

  const endsAt = isBreak && status === 'running' ? new Date(Date.now() + remaining * 1000) : null;

  breakAlertQueue = breakAlertQueue
    .then(async () => {
      await scheduleNativeBreakEnd(endsAt).catch((e) => console.error('[break] native schedule failed', e));

      const id = useTimerStore.getState().breakReminderId;
      if (!endsAt && !id) return;

      const res = await fetch('/api/timer/break', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, endsAt: endsAt?.toISOString() ?? null, taskTitle: task?.title ?? null }),
      });
      if (!res.ok) throw new Error(`break alert ${res.status}`);
      const data = await res.json();
      useTimerStore.setState({ breakReminderId: endsAt ? (id ?? data.id) : null });
    })
    .catch((err) => console.error('[break] alert sync failed', err));
}

// ─── Telegram-started timers ─────────────────────────────────────────────────
// The bot can't touch localStorage, so it writes the session to remote_timer
// (lib/remoteTimer.ts) and the app polls /api/timer/remote to take it over.

const REMOTE_POLL_MS = 15_000;

interface RemoteTimerPayload {
  session_id: string;
  kind: 'focus' | 'break';
  status: 'running' | 'ended';
  duration_seconds: number;
  elapsed_seconds: number;
  block_id: string | null;
  task_id: string | null;
  task_title: string | null;
  strict_mode: boolean;
  not_to_do: NotToDoItem[];
  end_reminder_id: string | null;
  task_pomodoros: { estimated: number; elapsed: number } | null;
}

/** Tell the server an adopted session is over so the bot sees nothing running. */
function endLinkedRemoteSession(): void {
  const { remoteLinked, remoteSessionId } = useTimerStore.getState();
  if (!remoteLinked || !remoteSessionId) return;
  useTimerStore.setState({ remoteLinked: false });
  fetch('/api/timer/remote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: remoteSessionId }),
  }).catch((err) => console.error('[timer/remote] end failed', err));
}

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
  loggedDistractions: [],
  breakReminderId: null,
  remoteSessionId: null,
  remoteLinked: false,
  remaining: POMODORO_DURATION,
  isLoaded: false,

  init: () => {
    if (get().isLoaded) return;

    const startLoops = () => {
      setInterval(() => {
        const state = get();
        if (state.status === 'running') state.tick();
      }, 500);

      // Pick up timers started from Telegram: on load, every 15s while visible, and on return to the tab/app
      get().syncRemoteTimer();
      setInterval(() => {
        if (document.visibilityState === 'visible') get().syncRemoteTimer();
      }, REMOTE_POLL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') get().syncRemoteTimer();
      });
    };

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
            // Keep remoteSessionId so a Telegram session isn't re-adopted after the stale reset
            set({ isLoaded: true, remoteSessionId: saved.remoteSessionId ?? null });
            startLoops();
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
          loggedDistractions: restoredStatus === 'idle' ? [] : (saved.loggedDistractions ?? []),
          breakReminderId: saved.breakReminderId ?? null,
          remoteSessionId: saved.remoteSessionId ?? null,
          remoteLinked: restoredStatus === 'idle' ? false : (saved.remoteLinked ?? false),
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

    startLoops();
  },

  syncRemoteTimer: async () => {
    let timer: RemoteTimerPayload | null;
    try {
      const res = await fetch('/api/timer/remote', { cache: 'no-store' });
      if (!res.ok) return; // e.g. remote_timer table not created yet
      timer = (await res.json()).timer ?? null;
    } catch {
      return; // offline — try again next poll
    }
    const s = get();

    // Stopped from Telegram while this app was running it → stop here too.
    // The server already abandoned the block, so reset locally without calling the API.
    if (s.remoteLinked && timer?.session_id === s.remoteSessionId && timer.status === 'ended') {
      if (s.status === 'running' || s.status === 'paused') {
        const wasBreak = s.isBreak;
        set({
          status: 'idle', elapsed: 0, duration: POMODORO_DURATION, remaining: POMODORO_DURATION,
          blockId: null, task: null, strictMode: false, lastTick: 0, notToDoItems: [],
          isBreak: false, loggedDistractions: [], remoteLinked: false,
          // the bot already cancelled the break's Telegram reminder
          breakReminderId: wasBreak ? null : s.breakReminderId,
        });
        if (wasBreak) scheduleNativeBreakEnd(null).catch(() => null);
      } else {
        set({ remoteLinked: false });
      }
      return;
    }

    if (!timer || timer.status !== 'running' || timer.session_id === s.remoteSessionId) return;

    // Never clobber a session the user is running here, or a focus session awaiting review
    if (s.status === 'running' || s.status === 'paused') return;
    if (s.status === 'completed' && !s.isBreak && s.blockId) return;

    const overBy = timer.elapsed_seconds - timer.duration_seconds;
    // Past its end: still offer the review for focus (same 3× window as the stale-session guard), skip old breaks
    if (overBy >= 0 && (timer.kind === 'break' || overBy > timer.duration_seconds * 2)) {
      set({ remoteSessionId: timer.session_id });
      return;
    }

    releaseFinishedBreakAlert();
    const finished = overBy >= 0;
    const elapsed = Math.min(timer.elapsed_seconds, timer.duration_seconds);
    const isBreak = timer.kind === 'break';
    set({
      status: finished ? 'completed' : 'running',
      mode: 'pomodoro',
      elapsed,
      duration: timer.duration_seconds,
      remaining: timer.duration_seconds - elapsed,
      blockId: timer.block_id,
      // Free-text labels (e.g. "DSA") get an empty id; /api/timer/complete stores the title instead
      task: isBreak ? s.task : (timer.task_title ? {
        id: timer.task_id ?? '',
        title: timer.task_title,
        estimated_pomodoros: timer.task_pomodoros?.estimated ?? 0,
        elapsed_pomodoros: timer.task_pomodoros?.elapsed ?? 0,
      } : null),
      strictMode: timer.strict_mode,
      lastTick: Date.now(),
      notToDoItems: timer.not_to_do ?? [],
      isBreak,
      loggedDistractions: [],
      breakReminderId: isBreak ? timer.end_reminder_id : null,
      remoteSessionId: timer.session_id,
      remoteLinked: !finished,
    });
    if (isBreak) syncBreakAlert(); // schedules the native "break over" notification too
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

  startTimer: async (task, strictMode = false, notToDoItems = []) => {
    releaseFinishedBreakAlert();
    endLinkedRemoteSession();
    try {
      const res = await fetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task?.id || null,
          mode: get().mode,
          strict_mode: strictMode,
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
        isBreak: false,
        loggedDistractions: [],
        remaining,
      });
      syncBreakAlert(); // back to work → cancel any pending break-over ping
    } catch (err) {
      // BUG-2: Network offline at start — timer runs but blockId stays null.
      // Session will not be persisted to DB. We still allow the timer to run
      // so the user's focus session isn't blocked by a network hiccup.
      console.error('[timer/start] Failed — session will run offline (no DB save):', err);
    }
  },

  // Breaks are deliberately NOT sent to /api/timer/start: a break is not focus time,
  // and its time_blocks row used to stay open forever, faking an "in-progress"
  // session for stats and the Telegram check-in cron. Keep breaks client-only.
  startBreak: (minutes) => {
    endLinkedRemoteSession();
    const duration = minutes * 60;
    set({
      status: 'running',
      mode: 'pomodoro',
      elapsed: 0,
      duration,
      remaining: duration,
      blockId: null,
      strictMode: false,
      lastTick: Date.now(),
      notToDoItems: [],
      isBreak: true,
      loggedDistractions: [],
      // task is kept so "Start Focus" after the break resumes the same task
    });
    syncBreakAlert();
  },

  pauseTimer: () => {
    set({ status: 'paused' });
    if (get().isBreak) syncBreakAlert();
  },

  resumeTimer: () => {
    set({ status: 'running', lastTick: Date.now() });
    if (get().isBreak) syncBreakAlert();
  },

  completeTimer: async (reviewData) => {
    // BUG-4: Capture all values before set() so the API call uses pre-mutation state.
    const { blockId, elapsed, task, notToDoItems, mode, duration, loggedDistractions } = get();
    endLinkedRemoteSession();

    const updatedTask = task ? { ...task, elapsed_pomodoros: task.elapsed_pomodoros + (mode === 'pomodoro' ? 1 : 0) } : null;

    // Merge any distractions logged during the session (e.g. from PiP)
    const loggedAsNotToDo: NotToDoItem[] = (loggedDistractions ?? []).map((d) => ({
      label: d.label,
      emoji: d.emoji,
    }));
    const combinedDistractionsMap = new Map<string, NotToDoItem>();
    for (const d of [...(reviewData?.triggeredDistractions ?? []), ...loggedAsNotToDo]) {
      combinedDistractionsMap.set(d.label, d);
    }
    const finalTriggeredDistractions = Array.from(combinedDistractionsMap.values());

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
          task_id: task?.id || null,
          task_title: task?.title ?? null, // free-text label for Telegram-started sessions
          not_to_do_selected: notToDoItems,
          triggered_distractions: finalTriggeredDistractions,
          completion_note: reviewData?.completionNote ?? null,
        }),
      });

      const result = await res.json();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('dayly-refresh-tasks'));
      }

      return result as { coinsEarned: number; coinsDeducted: number; cleanSession: boolean };
    } catch (err) {
      console.error('Failed to complete timer:', err);
      return null;
    }
  },

  abandonTimer: async (failedReason = 'manual_abandon') => {
    releaseFinishedBreakAlert();
    endLinkedRemoteSession();
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
      loggedDistractions: [],
      remaining: mode === 'pomodoro' ? resetDuration : 0,
    });
    syncBreakAlert(); // ending a break early cancels its alerts

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
    if (get().isBreak) syncBreakAlert();
  },

  setTask: (task) => {
    set({ task });
  },

  setNotToDoItems: (notToDoItems) => {
    set({ notToDoItems });
  },

  logDistraction: (item) => {
    const { elapsed, loggedDistractions } = get();
    const newEntry: LoggedDistraction = {
      label: item.label,
      emoji: item.emoji,
      timestamp: Date.now(),
      elapsedSeconds: elapsed,
    };
    set({
      loggedDistractions: [...(loggedDistractions ?? []), newEntry],
    });
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
        loggedDistractions: state.loggedDistractions,
        breakReminderId: state.breakReminderId,
        remoteSessionId: state.remoteSessionId,
        remoteLinked: state.remoteLinked,
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

