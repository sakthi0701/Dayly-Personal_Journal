'use client';

import { useState, useEffect, useRef } from 'react';
import { useTimer, type TimerMode, type TimerTask } from '@/components/timer/TimerProvider';
import PomodoroTimer from '@/components/timer/PomodoroTimer';
import StopwatchTimer from '@/components/timer/StopwatchTimer';
import TimerControls from '@/components/timer/TimerControls';
import FlipClock from '@/components/timer/FlipClock';
import WhiteNoise from '@/components/timer/WhiteNoise';
import { CheckSquare, ChevronDown, Settings2 } from 'lucide-react';

// ─── Task Picker ──────────────────────────────────────────────────────────────

function TaskPicker({ onSelect }: { onSelect: (task: TimerTask | null) => void }) {
  const { state } = useTimer();
  const [tasks, setTasks] = useState<TimerTask[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TimerTask | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fetchTasks = () => {
    fetch('/api/tasks?status=todo')
      .then((r) => r.json())
      .then((d) => {
        const mapped = (d.tasks ?? []).filter((t: { status: string }) => t.status !== 'done').map((t: {
          id: string;
          title: string;
          estimated_pomodoros: number;
          elapsed_pomodoros: number;
        }) => ({
          id: t.id,
          title: t.title,
          estimated_pomodoros: t.estimated_pomodoros,
          elapsed_pomodoros: t.elapsed_pomodoros,
        }));
        setTasks(mapped);
        
        // Update selected task if it's in the list
        setSelected((prev) => {
          if (!prev) return prev;
          const updated = mapped.find((t: TimerTask) => t.id === prev.id);
          if (updated && updated.elapsed_pomodoros !== prev.elapsed_pomodoros) {
            onSelect(updated);
            return updated;
          }
          return prev;
        });
      })
      .catch(() => null);
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.status === 'idle' || state.status === 'completed') {
      fetchTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (task: TimerTask | null) => {
    setSelected(task);
    onSelect(task);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-sm text-left transition-all"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare className="w-4 h-4 text-zinc-600 shrink-0" />
          <span className={`truncate ${selected ? 'text-white' : 'text-zinc-600'}`}>
            {selected ? selected.title : 'Select a task (optional)'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 w-full z-20 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              onClick={() => handleSelect(null)}
              className="w-full flex items-center px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-800 transition-colors text-left"
            >
              Free focus (no task)
            </button>
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
            {tasks.length === 0 && (
              <p className="px-4 py-3 text-xs text-zinc-600 text-center">No active tasks. Create one in Focus Room.</p>
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
  const { state, setDuration, extendTimer } = useTimer();
  const currentMinutes = Math.round(state.duration / 60);
  const isRunning = state.status === 'running' || state.status === 'paused';

  return (
    <div className="flex flex-col gap-2">
      {/* Duration presets — only when idle */}
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
      {/* +1 min extend — only when running or paused */}
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
  const { state, setMode } = useTimer();
  const modes: { value: TimerMode; label: string }[] = [
    { value: 'pomodoro',  label: '🍅 Pomodoro' },
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

// ─── Inner page (inside TimerProvider) ───────────────────────────────────────

export default function FocusPage() {
  const { state, startTimer, abandonTimer, extendTimer } = useTimer();
  const [selectedTask, setSelectedTask] = useState<TimerTask | null>(null);
  const [strictMode, setStrictMode] = useState(false);
  const [showFlipClock, setShowFlipClock] = useState(false);
  const [strictFailures, setStrictFailures] = useState(0);

  // Phase 9: Strict Mode Visibility Guard
  useEffect(() => {
    // Request notification permission for Pomodoro completion
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Capacitor Native
    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.isNativePlatform()) {
        import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
          LocalNotifications.requestPermissions();
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!strictMode || state.status !== 'running') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setStrictFailures((prev) => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            abandonTimer('strict_mode_violation');
            alert('Session failed! You switched away 3 times in Strict Mode.');
          } else {
            alert(`Strict Mode Warning! You switched tabs. (${newCount}/3 violations)`);
          }
          return newCount;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [strictMode, state.status, abandonTimer]);

  // Reset failures on new session
  useEffect(() => {
    if (state.status === 'idle') setStrictFailures(0);
  }, [state.status]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Flip clock overlay */}
      {showFlipClock && <FlipClock onExit={() => setShowFlipClock(false)} />}


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
            {state.mode === 'pomodoro' && <DurationPicker />}
          </div>

          {/* Timer display */}
          <div className="flex flex-col items-center gap-6">
            {state.mode === 'pomodoro' ? <PomodoroTimer /> : <StopwatchTimer />}
            <TimerControls
              onFlipClock={() => setShowFlipClock(true)}
              onComplete={() => { /* break prompt handled globally by GlobalTimerUI */ }}
            />
          </div>

          {/* White noise */}
          <WhiteNoise />
        </div>

        {/* Sidebar column */}
        <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-zinc-800/60 p-6 flex flex-col gap-6">
          {/* Task Picker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2 block">
              Focusing On
            </label>
            <TaskPicker onSelect={setSelectedTask} />
          </div>

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
                  {strictMode ? `3 tab switches = fail (${strictFailures}/3)` : 'Tab switching allowed'}
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


