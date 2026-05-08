'use client';

import { useEffect, useState } from 'react';
import { Clock, Timer, CheckSquare, ListTodo } from 'lucide-react';

interface DashboardStats {
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  estimatedMinutes: number;
  elapsedMinutes: number;
  totalEstimatedPomodoros: number;
}

function formatMinutes(mins: number): string {
  if (mins === 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function GlobalDashboardStats({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats/dashboard')
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  const skeleton = 'h-4 w-12 bg-zinc-800 rounded animate-pulse';

  return (
    <div className="flex items-center gap-6 px-6 py-3 bg-zinc-900/50 border-b border-zinc-800/60 text-sm">
      {/* Estimated Time */}
      <div className="flex items-center gap-2 text-zinc-400">
        <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="text-zinc-500 hidden sm:inline">Est.</span>
        {loading
          ? <span className={skeleton} />
          : <span className="text-white font-medium">{formatMinutes(stats?.estimatedMinutes ?? 0)}</span>
        }
      </div>

      <div className="w-px h-4 bg-zinc-800" />

      {/* Elapsed Time (Phase 8 ready) */}
      <div className="flex items-center gap-2 text-zinc-400">
        <Timer className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-zinc-500 hidden sm:inline">Elapsed</span>
        {loading
          ? <span className={skeleton} />
          : <span className="text-white font-medium">{formatMinutes(stats?.elapsedMinutes ?? 0)}</span>
        }
      </div>

      <div className="w-px h-4 bg-zinc-800" />

      {/* Tasks left */}
      <div className="flex items-center gap-2 text-zinc-400">
        <ListTodo className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-zinc-500 hidden sm:inline">Tasks</span>
        {loading
          ? <span className={skeleton} />
          : <span className="text-white font-medium">{stats?.todoTasks ?? 0} left</span>
        }
      </div>

      <div className="w-px h-4 bg-zinc-800" />

      {/* Done */}
      <div className="flex items-center gap-2 text-zinc-400">
        <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-zinc-500 hidden sm:inline">Done</span>
        {loading
          ? <span className={skeleton} />
          : (
            <span className="text-white font-medium">
              {stats?.doneTasks ?? 0}
              <span className="text-zinc-600">/{stats?.totalTasks ?? 0}</span>
            </span>
          )
        }
      </div>
    </div>
  );
}
