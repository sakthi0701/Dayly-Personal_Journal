'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Check, Clock, AlertTriangle, ChevronDown, Flame, Bell } from 'lucide-react';

interface PressureTask {
  id: string;
  title: string;
  priority: number;   // 1=High, 2=Med, 3=Low
  deadline: string | null;
  estimated_minutes: number | null;
  status: 'todo' | 'done' | 'snoozed' | 'rescheduled';
  completed_at: string | null;
  created_at: string;
}

const PRIORITY_CONFIG = {
  1: { label: 'High', color: 'text-red-400', bg: 'bg-red-950/40', border: 'border-red-800/50', dot: 'bg-red-400' },
  2: { label: 'Med',  color: 'text-amber-400', bg: 'bg-amber-950/30', border: 'border-amber-800/50', dot: 'bg-amber-400' },
  3: { label: 'Low',  color: 'text-zinc-400', bg: 'bg-zinc-900', border: 'border-zinc-800', dot: 'bg-zinc-500' },
};

function getDeadlineStatus(deadline: string | null): {
  label: string;
  color: string;
  urgent: boolean;
} {
  if (!deadline) return { label: '', color: 'text-zinc-600', urgent: false };
  const diff = new Date(deadline).getTime() - Date.now();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);

  if (diff < 0) return { label: 'Overdue', color: 'text-red-400', urgent: true };
  if (mins < 30) return { label: `${mins}m left`, color: 'text-red-400', urgent: true };
  if (hours < 2) return { label: `${Math.ceil(mins / 60)}h left`, color: 'text-amber-400', urgent: false };
  if (hours < 24) return { label: `${hours}h left`, color: 'text-zinc-400', urgent: false };
  const d = new Date(deadline);
  return {
    label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    color: 'text-zinc-500',
    urgent: false,
  };
}

// ─── Add Form ─────────────────────────────────────────────────────────────────

function AddForm({ onAdd, onCancel }: { onAdd: (t: Partial<PressureTask>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(1);
  const [deadline, setDeadline] = useState('');
  const [estimatedMins, setEstimatedMins] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      priority,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      estimated_minutes: estimatedMins ? parseInt(estimatedMins, 10) : null,
    });
  };

  return (
    <div className="bg-zinc-900/80 border border-indigo-500/30 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-white">New Pressure Task</span>
      </div>

      {/* Title */}
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="What must get done today?"
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
      />

      <div className="grid grid-cols-3 gap-3">
        {/* Priority */}
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Priority</label>
          <div className="flex gap-1">
            {([1, 2, 3] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  priority === p
                    ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].border} ${PRIORITY_CONFIG[p].color}`
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {PRIORITY_CONFIG[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Deadline */}
        <div className="col-span-1">
          <label className="text-xs text-zinc-500 block mb-1">Deadline</label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 transition-all [color-scheme:dark]"
          />
        </div>

        {/* Duration */}
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Est. mins</label>
          <input
            type="number"
            value={estimatedMins}
            onChange={(e) => setEstimatedMins(e.target.value)}
            placeholder="e.g. 45"
            min={5}
            max={480}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-all"
        >
          Add to Pressure Plan
        </button>
      </div>
    </div>
  );
}

// ─── Task Card ─────────────────────────────────────────────────────────────────

function PressureTaskCard({
  task,
  onStatusChange,
  onDelete,
}: {
  task: PressureTask;
  onStatusChange: (id: string, status: PressureTask['status']) => void;
  onDelete: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const deadline = getDeadlineStatus(task.deadline);
  const cfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG[3];
  const isDone = task.status === 'done';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowActions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all ${
        isDone
          ? 'bg-zinc-900/30 border-zinc-800/50 opacity-60'
          : `${cfg.bg} ${cfg.border}`
      }`}
    >
      {/* Complete button */}
      <button
        onClick={() => onStatusChange(task.id, isDone ? 'todo' : 'done')}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
          isDone
            ? 'border-emerald-500 bg-emerald-500/20'
            : `border-current ${cfg.color} hover:bg-current/10`
        }`}
        title={isDone ? 'Mark as todo' : 'Mark as done'}
      >
        {isDone && <Check className="w-3 h-3 text-emerald-400" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-sm font-medium truncate ${isDone ? 'line-through text-zinc-500' : 'text-white'}`}>
            {task.title}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Priority badge */}
            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
            {/* Deadline badge */}
            {deadline.label && (
              <span className={`text-xs flex items-center gap-1 ${deadline.color}`}>
                {deadline.urgent && <AlertTriangle className="w-3 h-3" />}
                {deadline.label}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-1">
          {task.estimated_minutes && (
            <span className="text-xs text-zinc-600 flex items-center gap-1">
              <Clock className="w-3 h-3" /> ~{task.estimated_minutes}m
            </span>
          )}
          {task.status !== 'todo' && task.status !== 'done' && (
            <span className="text-xs text-zinc-500 capitalize">{task.status}</span>
          )}
        </div>
      </div>

      {/* Actions dropdown */}
      {!isDone && (
        <div ref={ref} className="relative shrink-0">
          <button
            onClick={() => setShowActions((v) => !v)}
            className="p-1 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showActions ? 'rotate-180' : ''}`} />
          </button>
          {showActions && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden min-w-36">
              <button
                onClick={() => { onStatusChange(task.id, 'snoozed'); setShowActions(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors text-left"
              >
                <Bell className="w-3.5 h-3.5 text-blue-400" /> Snooze
              </button>
              <button
                onClick={() => { onStatusChange(task.id, 'rescheduled'); setShowActions(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors text-left"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Reschedule
              </button>
              <button
                onClick={() => { onDelete(task.id); setShowActions(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-red-950/30 transition-colors text-left"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
      {isDone && (
        <button
          onClick={() => onDelete(task.id)}
          className="p-1 text-zinc-700 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-all shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PressurePlan() {
  const [tasks, setTasks] = useState<PressureTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pressure-tasks');
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {
      showToast('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (fields: Partial<PressureTask>) => {
    try {
      const res = await fetch('/api/pressure-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTasks((prev) => [data.task, ...prev]);
      setShowForm(false);
      showToast('Task added ✓');
    } catch {
      showToast('Failed to add task');
    }
  };

  const handleStatusChange = async (id: string, status: PressureTask['status']) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/pressure-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      // Show XP feedback on completion
      if (status === 'done') {
        const deadline = tasks.find((t) => t.id === id)?.deadline;
        if (deadline) {
          const isOnTime = Date.now() <= new Date(deadline).getTime();
          showToast(isOnTime ? '✅ On time! +20 XP' : '⏱ Done (late) +8 XP');
        } else {
          showToast('✅ Task complete!');
        }
      }
      if (!res.ok) throw new Error(data.error);
    } catch {
      load();
    }
  };

  const handleDelete = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/pressure-tasks/${id}`, { method: 'DELETE' });
    } catch {
      load();
    }
  };

  const activeTasks = tasks.filter((t) => t.status !== 'done');
  const doneTasks   = tasks.filter((t) => t.status === 'done');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            <h2 className="text-base font-semibold text-white">Today&apos;s Pressure Plan</h2>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 ml-7">
            High-stakes tasks with deadlines. Pick one when starting a Focus session.
          </p>
        </div>
        <button
          id="add-pressure-task-btn"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/30 text-orange-300 text-xs font-medium rounded-xl transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Add Task
        </button>
      </div>

      {/* Add form */}
      {showForm && <AddForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />}

      {/* XP legend */}
      <div className="flex items-center gap-4 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          On time: +20 XP
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Late: +8 XP
        </span>
      </div>

      {/* Tasks */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-600 text-sm">Loading…</div>
      ) : activeTasks.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
            <Flame className="w-5 h-5 text-zinc-700" />
          </div>
          <p className="text-sm text-zinc-500 mb-1">No pressure tasks today</p>
          <p className="text-xs text-zinc-600 max-w-xs">
            Add tasks that have real deadlines. They&apos;ll appear in Focus for quick selection.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeTasks.map((task) => (
            <PressureTaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Done section */}
      {doneTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-600 uppercase tracking-wider font-semibold">Completed</p>
          {doneTasks.map((task) => (
            <PressureTaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 bg-zinc-800/90 border border-zinc-700/60 text-white text-sm rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
