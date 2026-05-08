'use client';

import { useTimer } from './TimerProvider';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export default function StopwatchTimer() {
  const { state, remaining } = useTimer();

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="font-mono text-7xl font-bold tabular-nums text-white tracking-tight select-none">
        {formatTime(remaining)}
      </div>
      {state.task && (
        <p className="text-sm text-zinc-500 text-center truncate max-w-xs">
          ↳ {state.task.title}
        </p>
      )}
    </div>
  );
}
