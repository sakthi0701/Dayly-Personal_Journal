'use client';

import { useTimer } from './TimerProvider';

interface PomodoroTimerProps {
  onComplete?: () => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return { m, s };
}

export default function PomodoroTimer({ onComplete }: PomodoroTimerProps) {
  const remaining = useTimer(state => state.remaining);
  const mode = useTimer(state => state.mode);
  const duration = useTimer(state => state.duration);
  const status = useTimer(state => state.status);
  const task = useTimer(state => state.task);
  const state = { mode, duration, status, task };
  const { m, s } = formatTime(remaining);

  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = state.mode === 'pomodoro'
    ? (state.duration > 0 ? 1 - remaining / state.duration : 0)
    : Math.min(remaining / (60 * 60), 1); // stopwatch fills over 60 min

  const rawOffset = circumference * (1 - progress);
  const strokeDashoffset = isNaN(rawOffset) || !isFinite(rawOffset) ? circumference : rawOffset;

  const statusColor =
    state.status === 'completed' ? '#34d399' :
    state.status === 'paused'    ? '#f59e0b' :
    state.status === 'running'   ? '#818cf8' :
    '#3f3f46';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* SVG Ring */}
      <div className="relative" style={{ width: 220, height: 220 }}>
        <svg width={220} height={220} viewBox="0 0 220 220" className="rotate-[-90deg]">
          {/* Background track */}
          <circle
            cx={110} cy={110} r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={12}
          />
          {/* Progress arc */}
          <circle
            cx={110} cy={110} r={radius}
            fill="none"
            stroke={statusColor}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono text-5xl font-bold tabular-nums text-white tracking-tight select-none">
            {m}<span className="opacity-60 animate-pulse">:</span>{s}
          </div>
          {state.task && (
            <p className="mt-1 text-xs text-zinc-500 max-w-[140px] text-center truncate">
              {state.task.title}
            </p>
          )}
        </div>
      </div>

      {/* Mode label */}
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">
        {state.mode === 'pomodoro' ? '🍅 Pomodoro' : '⏱ Stopwatch'}
        {state.status === 'paused' && (
          <span className="ml-2 text-amber-500 normal-case tracking-normal">· Paused</span>
        )}
        {state.status === 'completed' && (
          <span className="ml-2 text-emerald-400 normal-case tracking-normal">· Complete!</span>
        )}
      </p>

      {/* Pomodoro progress dots */}
      {state.task && state.mode === 'pomodoro' && (
        <div className="flex items-center gap-1.5">
          {Array.from({ length: state.task.estimated_pomodoros }).map((_, i) => (
            <span
              key={i}
              className={`text-xs transition-all ${
                i < state.task!.elapsed_pomodoros ? 'opacity-100' : 'opacity-20'
              }`}
            >🍅</span>
          ))}
        </div>
      )}
    </div>
  );
}
