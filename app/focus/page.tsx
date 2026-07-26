'use client';

import { useState, useEffect, useRef } from 'react';
import { useTimer, type TimerMode, type TimerTask, type NotToDoItem } from '@/components/timer/TimerProvider';
import PomodoroTimer from '@/components/timer/PomodoroTimer';
import StopwatchTimer from '@/components/timer/StopwatchTimer';
import TimerControls from '@/components/timer/TimerControls';
import FlipClock from '@/components/timer/FlipClock';
import WhiteNoise from '@/components/timer/WhiteNoise';
import NotToDoSelector from '@/components/focus/NotToDoSelector';
import SessionReviewSheet from '@/components/focus/SessionReviewSheet';
import { CheckSquare, ChevronDown, Settings2, Flame, AlertTriangle } from 'lucide-react';

// ─── Task Picker (extended to surface pressure tasks) ────────────────────────

interface PressureTask {
  id: string;
  title: string;
  priority: number;
  deadline: string | null;
  status: string;
}

function TaskPicker({ onSelect }: { onSelect: (task: TimerTask | null) => void }) {
  const status = useTimer(state => state.status);
  const task = useTimer(state => state.task);
  const state = { status, task };
  const [tasks, setTasks] = useState<TimerTask[]>([]);
  const [pressureTasks, setPressureTasks] = useState<PressureTask[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchTasks = () => {
    Promise.all([
      fetch('/api/tasks?status=todo').then((r) => r.json()).catch(() => ({ tasks: [] })),
      fetch('/api/pressure-tasks?filter=active').then((r) => r.json()).catch(() => ({ tasks: [] })),
    ]).then(([taskData, pressureData]) => {
      const mapped = (taskData.tasks ?? [])
        .filter((t: { status: string }) => t.status !== 'done')
        .map((t: { id: string; title: string; estimated_pomodoros: number; elapsed_pomodoros: number }) => ({
          id: t.id,
          title: t.title,
          estimated_pomodoros: t.estimated_pomodoros,
          elapsed_pomodoros: t.elapsed_pomodoros,
        }));
      setTasks(mapped);
      setPressureTasks((pressureData.tasks ?? []).filter((t: PressureTask) => t.status !== 'done'));
    });
  };

  useEffect(() => { fetchTasks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'completed') fetchTasks();
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (task: TimerTask | null) => { onSelect(task); setOpen(false); };

  const hasPressure = pressureTasks.length > 0;

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 border rounded-xl text-sm text-left transition-all ${
          hasPressure && !state.task
            ? 'bg-orange-950/20 border-orange-700/40 hover:border-orange-600/60'
            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare className={`w-4 h-4 shrink-0 ${hasPressure && !state.task ? 'text-orange-400' : 'text-zinc-600'}`} />
          <span className={`truncate ${state.task ? 'text-white' : hasPressure ? 'text-orange-300' : 'text-zinc-600'}`}>
            {state.task ? state.task.title : hasPressure ? `${pressureTasks.length} deadline task${pressureTasks.length > 1 ? 's' : ''} due` : 'Select a task (optional)'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 w-full z-20 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              onClick={() => handleSelect(null)}
              className="w-full flex items-center px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-800 transition-colors text-left"
            >
              Free focus (no task)
            </button>

            {/* Pressure tasks section */}
            {pressureTasks.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-orange-400/70 border-t border-zinc-800/60 flex items-center gap-1.5">
                  <Flame className="w-3 h-3" /> Today&apos;s Deadlines
                </div>
                {pressureTasks.map((pt) => {
                  const diff = pt.deadline ? new Date(pt.deadline).getTime() - Date.now() : null;
                  const mins = diff ? Math.floor(diff / 60000) : null;
                  const isUrgent = mins !== null && mins < 120;
                  return (
                    <button
                      key={pt.id}
                      onClick={() => handleSelect({ id: pt.id, title: pt.title, estimated_pomodoros: 1, elapsed_pomodoros: 0 })}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors text-left gap-3"
                    >
                      <span className="text-white truncate">{pt.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isUrgent && <AlertTriangle className="w-3 h-3 text-red-400" />}
                        {pt.deadline && (
                          <span className={`text-xs ${isUrgent ? 'text-red-400' : 'text-zinc-500'}`}>
                            {mins !== null && mins < 60
                              ? `${mins}m`
                              : mins !== null
                              ? `${Math.floor(mins / 60)}h`
                              : new Date(pt.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {/* Regular tasks */}
            {tasks.length > 0 && (
              <>
                {pressureTasks.length > 0 && (
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-600 border-t border-zinc-800/60">
                    All Tasks
                  </div>
                )}
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleSelect(task)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors text-left gap-3"
                  >
                    <span className="text-white truncate">{task.title}</span>
                    <span className="text-zinc-600 text-xs shrink-0">
                      {task.elapsed_pomodoros}/{task.estimated_pomodoros} 🍅
                    </span>
                  </button>
                ))}
              </>
            )}

            {tasks.length === 0 && pressureTasks.length === 0 && (
              <p className="px-4 py-3 text-xs text-zinc-600 text-center">No active tasks. Create one in Action.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Duration Picker ──────────────────────────────────────────────────────────

const DURATIONS = [15, 20, 25, 30, 45, 60];

function DurationPicker() {
  const duration = useTimer(state => state.duration);
  const status = useTimer(state => state.status);
  const mode = useTimer(state => state.mode);
  const setDuration = useTimer(state => state.setDuration);
  const extendTimer = useTimer(state => state.extendTimer);
  const state = { duration, status, mode };
  const currentMinutes = Math.round(state.duration / 60);
  const isRunning = state.status === 'running' || state.status === 'paused';

  return (
    <div className="flex flex-col gap-2">
      {!isRunning && (
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          <Settings2 className="w-3.5 h-3.5 text-zinc-600 ml-1.5" />
          {DURATIONS.map((min) => (
            <button
              key={min}
              onClick={() => setDuration(min)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all font-medium ${
                currentMinutes === min
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {min}m
            </button>
          ))}
        </div>
      )}
      {isRunning && state.mode === 'pomodoro' && (
        <button
          onClick={() => extendTimer(1)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 text-xs font-medium rounded-xl transition-all"
        >
          <span className="text-base leading-none">+</span> 1 min extend
        </button>
      )}
    </div>
  );
}

// ─── Mode Toggle ─────────────────────────────────────────────────────────────

function ModeToggle() {
  const status = useTimer(state => state.status);
  const mode = useTimer(state => state.mode);
  const setMode = useTimer(state => state.setMode);
  const state = { status, mode };
  const modes: { value: TimerMode; label: string }[] = [
    { value: 'pomodoro', label: '🍅 Pomodoro' },
    { value: 'stopwatch', label: '⏱ Stopwatch' },
  ];

  return (
    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => setMode(m.value)}
          disabled={state.status !== 'idle'}
          className={`px-4 py-1.5 text-xs rounded-lg font-medium transition-all ${
            state.mode === m.value
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 disabled:opacity-40'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── Focus Page ───────────────────────────────────────────────────────────────

export default function FocusPage() {
  const status = useTimer(state => state.status);
  const mode = useTimer(state => state.mode);
  const task = useTimer(state => state.task);
  const notToDoItems = useTimer(state => state.notToDoItems);
  const isBreak = useTimer(state => state.isBreak);
  const elapsed = useTimer(state => state.elapsed);
  const startTimer = useTimer(state => state.startTimer);
  const abandonTimer = useTimer(state => state.abandonTimer);
  const extendTimer = useTimer(state => state.extendTimer);
  const setTask = useTimer(state => state.setTask);
  const setNotToDoItems = useTimer(state => state.setNotToDoItems);
  const completeTimer = useTimer(state => state.completeTimer);
  const state = { status, mode, task, notToDoItems, isBreak, elapsed };
  const [strictMode, setStrictMode] = useState(false);
  const [showFlipClock, setShowFlipClock] = useState(false);
  const [strictFailures, setStrictFailures] = useState(0);

  // Phase 13: Not-to-do + review state
  const [selectedNotToDos, setSelectedNotToDos] = useState<NotToDoItem[]>([]);
  const [showReviewSheet, setShowReviewSheet] = useState(false);
  const [reviewResult, setReviewResult] = useState<{ xpEarned: number; xpDeducted: number; cleanSession: boolean; untracked?: boolean } | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Track completion trigger — we want to show review sheet when work session completes
  const prevStatus = useRef(state.status);
  const didInitCheck = useRef(false);
  useEffect(() => {
    // On first mount: if the timer already completed while user was on another page,
    // immediately show the review sheet (the running→completed transition was missed).
    if (!didInitCheck.current) {
      didInitCheck.current = true;
      if (state.status === 'completed' && !state.isBreak) {
        setShowReviewSheet(true);
      }
    }

    if (prevStatus.current === 'running' && state.status === 'completed') {
      if (!state.isBreak) {
        // Work session just completed — show review
        setShowReviewSheet(true);
      }
    }
    prevStatus.current = state.status;
  }, [state.status, state.isBreak]);

  // Notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
          LocalNotifications.requestPermissions();
        });
      }
    });
  }, []);

  // Strict Mode guard
  useEffect(() => {
    if (!strictMode || state.status !== 'running') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setStrictFailures((prev) => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            abandonTimer('strict_mode_violation');
          }
          return newCount;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [strictMode, state.status, abandonTimer]);

  // Reset failures and dismiss review sheet on new session or idle
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'running') {
      setStrictFailures(0);
      setSelectedNotToDos([]);
      setShowReviewSheet(false);
      setReviewResult(null);
    }
  }, [state.status]);

  // Sync selectedNotToDos into timer state (for localStorage persistence)
  const handleNotToDoChange = (items: NotToDoItem[]) => {
    setSelectedNotToDos(items);
    setNotToDoItems(items);
  };

  // Handle "Start Session" with guard for strict mode
  const handleStart = () => {
    if (strictMode && state.mode === 'pomodoro' && selectedNotToDos.length === 0) {
      setShowStrictWarning(true);
      setTimeout(() => setShowStrictWarning(false), 3000);
      return;
    }
    startTimer(state.task, strictMode, selectedNotToDos, false);
  };
  const [showStrictWarning, setShowStrictWarning] = useState(false);

  // Handle review submission
  const handleReviewSubmit = async (data: { triggeredDistractions: NotToDoItem[]; completionNote: string }) => {
    setIsSubmittingReview(true);
    try {
      const result = await completeTimer({
        triggeredDistractions: data.triggeredDistractions,
        completionNote: data.completionNote,
      });
      // If result is null, blockId was missing (offline/untracked session).
      // Provide a synthetic fallback so the review sheet can exit the spinner state.
      setReviewResult(result ?? { xpEarned: 0, xpDeducted: 0, cleanSession: false, untracked: true });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const isRunning = state.status === 'running' || state.status === 'paused';
  const isPomodoro = state.mode === 'pomodoro';

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Flip clock overlay */}
      {showFlipClock && <FlipClock onExit={() => setShowFlipClock(false)} />}

      {/* Session Review Sheet */}
      {showReviewSheet && (
        <SessionReviewSheet
          notToDoItems={state.notToDoItems}
          taskTitle={state.task?.title ?? null}
          sessionMinutes={state.elapsed / 60}
          onSubmit={handleReviewSubmit}
          xpResult={reviewResult}
          isSubmitting={isSubmittingReview}
        />
      )}

      {/* Strict warning toast */}
      {showStrictWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-950/90 border border-red-700/60 text-red-200 text-sm rounded-xl shadow-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          Strict mode requires at least one not-to-do item
        </div>
      )}

      {/* Page header */}
      <div className="px-6 pt-6 pb-4 border-b border-zinc-800/60">
        <h1 className="text-2xl font-bold text-white tracking-tight">Focus Session</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Enter deep work. Eliminate everything else.</p>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Timer column */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-12">
          {/* Mode + Duration controls */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ModeToggle />
            {isPomodoro && <DurationPicker />}
          </div>

          {/* Timer display */}
          <div className="flex flex-col items-center gap-6">
            {isPomodoro ? <PomodoroTimer /> : <StopwatchTimer />}
            <TimerControls
              onFlipClock={() => setShowFlipClock(true)}
              onComplete={() => { /* handled globally by GlobalTimerUI */ }}
              onStart={handleStart}
            />
          </div>

          {/* White noise */}
          <WhiteNoise />
        </div>

        {/* Sidebar column */}
        <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-zinc-800/60 p-6 flex flex-col gap-5">

          {/* Task Picker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2 block">
              {isPomodoro ? '📌 Focusing On' : '⏱ Timing'}
            </label>
            <TaskPicker onSelect={setTask} />
            {isPomodoro && !state.task && !isRunning && (
              <p className="text-xs text-zinc-600 mt-1.5 ml-1">
                Tip: Selecting a task makes sessions count toward your goals
              </p>
            )}
          </div>

          {/* Not-to-do Selector — only for Pomodoro */}
          {isPomodoro && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2 block">
                🚫 Not-to-dos
              </label>
              <NotToDoSelector
                selected={selectedNotToDos}
                onChange={handleNotToDoChange}
                strictMode={strictMode}
                isRunning={isRunning}
              />
            </div>
          )}

          {/* Strict Mode Toggle */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2 block">
              Strict Mode
            </label>
            <button
              id="strict-mode-toggle"
              onClick={() => setStrictMode((v) => !v)}
              disabled={state.status !== 'idle'}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                strictMode
                  ? 'bg-red-950/30 border-red-500/30 text-red-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
              } disabled:opacity-50`}
            >
              <div>
                <p className="text-sm font-medium">
                  {strictMode ? '🔒 Strict Mode ON' : '🔓 Strict Mode OFF'}
                </p>
                <p className="text-xs opacity-60 mt-0.5">
                  {strictMode
                    ? `3 tab switches = fail (${strictFailures}/3)`
                    : 'Tab switching allowed'}
                </p>
              </div>
              <div className={`w-10 h-5 rounded-full transition-all ${strictMode ? 'bg-red-500' : 'bg-zinc-700'}`}>
                <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-all shadow ${strictMode ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>

          {/* Session Tips */}
          <div className="mt-auto bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">Session Tips</p>
            <ul className="space-y-1.5 text-xs text-zinc-600">
              <li>• Put your phone face-down</li>
              <li>• Close all unrelated tabs</li>
              <li>• One task, one window</li>
              <li>• Ship something by the end</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

