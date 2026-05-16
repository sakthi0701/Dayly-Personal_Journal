'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, Loader2, RefreshCw, Target, Flame, CheckSquare, Clock, Zap } from 'lucide-react';
import GlobalDashboardStats from '@/components/tasks/GlobalDashboardStats';
import TaskList from '@/components/tasks/TaskList';
import TaskForm from '@/components/tasks/TaskForm';
import GoalCountdownWidget from '@/components/goals/GoalCountdownWidget';
import HabitTracker from '@/components/analytics/HabitTracker';
import type { Task } from '@/components/tasks/TaskCard';
import { triggerWidgetDataSync } from '@/lib/cache';

type FilterStatus = 'all' | 'todo' | 'in-progress' | 'done';
type Segment = 'tasks' | 'goals-habits';

export default function ActionPage() {
  const [segment, setSegment] = useState<Segment>('tasks');

  // ── Tasks state ──────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [showForm, setShowForm] = useState(false);
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [statsTrigger, setStatsTrigger] = useState(0);

  // ── Summary strip state ───────────────────────────────────
  const [summaryStats, setSummaryStats] = useState<{
    tasksTotal: number; tasksDue: number; activeGoals: number; habitsToday: number; streak: number; xp: number;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/tasks${params}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {
      showToast('Failed to load tasks', 'error');
    } finally {
      setLoading(false);
      setStatsTrigger((c) => c + 1);
    }
  }, [statusFilter]);

  useEffect(() => { 
    loadTasks(); 
    
    const handleRefresh = () => {
      loadTasks();
      setStatsTrigger((c) => c + 1);
    };
    
    window.addEventListener('dayly-refresh-tasks', handleRefresh);
    return () => window.removeEventListener('dayly-refresh-tasks', handleRefresh);
  }, [loadTasks]);

  // Load summary strip data
  useEffect(() => {
    Promise.all([
      fetch('/api/stats/dashboard').then(r => r.json()).catch(() => ({})),
      fetch('/api/goals').then(r => r.json()).catch(() => ({ goals: [] })),
      fetch('/api/habits').then(r => r.json()).catch(() => ({ habits: [] })),
      fetch('/api/stats/user').then(r => r.json()).catch(() => ({ stats: null })),
    ]).then(([dashStats, goalsData, habitsData, userStats]) => {
      const today = new Date().toISOString().slice(0, 10);
      const habitsToday = (habitsData.habits ?? []).filter((h: { habit_logs?: { logged_at: string }[] }) =>
        (h.habit_logs ?? []).some((l: { logged_at: string }) => l.logged_at.slice(0, 10) === today)
      ).length;
      const activeGoals = (goalsData.goals ?? []).filter((g: { status: string }) => g.status === 'active').length;
      const tasksDue = (dashStats.taskCounts?.todo ?? 0) + (dashStats.taskCounts?.inProgress ?? 0);
      setSummaryStats({
        tasksTotal: dashStats.taskCounts?.total ?? 0,
        tasksDue,
        activeGoals,
        habitsToday,
        streak: userStats.stats?.streak_days ?? 0,
        xp: userStats.stats?.xp ?? 0,
      });
      // Push fresh data to Android widgets
      triggerWidgetDataSync();
    });
  }, [statsTrigger]);

  const handleUpdate = async (id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch {
      loadTasks();
      showToast('Failed to update task', 'error');
    } finally {
      setStatsTrigger((c) => c + 1);
    }
  };

  const handleDelete = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setStatsTrigger((c) => c + 1);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Task deleted');
    } catch {
      loadTasks();
      showToast('Failed to delete task', 'error');
    }
  };

  const handleCreated = (task: Task) => {
    if (!task.parent_task_id) {
      setTasks((prev) => [task, ...prev]);
    } else {
      window.dispatchEvent(new CustomEvent('dayly-refresh-subtasks', { detail: { parentId: task.parent_task_id } }));
    }
    setStatsTrigger((c) => c + 1);
    showToast('Task created ✓');
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormParentId(null);
    setShowForm(true);
  };

  const handleUpdated = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setStatsTrigger((c) => c + 1);
    showToast('Task updated ✓');
  };

  const handleAddSubtask = (parentId: string) => {
    setFormParentId(parentId);
    setShowForm(true);
  };

  const filteredTasks = tasks.filter((t) => {
    if (!search) return true;
    return (
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.tags?.some((tag) => tag.name.toLowerCase().includes(search.toLowerCase()))
    );
  });

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* ── Stats bar ── */}
      <GlobalDashboardStats refreshTrigger={statsTrigger} />

      {/* ── Compact summary strip ── */}
      {summaryStats && (
        <div className="px-6 py-2 border-b border-zinc-800/40 flex items-center gap-4 overflow-x-auto bg-zinc-950/80 backdrop-blur-sm text-xs text-zinc-500 scrollbar-none">
          <SummaryChip icon={<CheckSquare className="w-3.5 h-3.5 text-indigo-400" />} label={`${summaryStats.tasksDue} tasks due`} />
          <SummaryChip icon={<Target className="w-3.5 h-3.5 text-violet-400" />} label={`${summaryStats.activeGoals} active goals`} />
          <SummaryChip icon={<Flame className="w-3.5 h-3.5 text-orange-400" />} label={`${summaryStats.habitsToday} habits logged today`} />
          <SummaryChip icon={<Clock className="w-3.5 h-3.5 text-emerald-400" />} label={`${summaryStats.streak}d streak`} />
          <SummaryChip icon={<Zap className="w-3.5 h-3.5 text-amber-400" />} label={`${summaryStats.xp} XP`} />
        </div>
      )}

      {/* ── Page header + segmented control ── */}
      <div className="px-6 pt-5 pb-0 border-b border-zinc-800/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Action</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Plan, commit, execute.</p>
          </div>
        </div>

        {/* Segmented tabs */}
        <div className="flex gap-0 border-b border-zinc-800">
          {([
            { id: 'tasks', label: 'Tasks', icon: CheckSquare },
            { id: 'goals-habits', label: 'Goals & Habits', icon: Target },
          ] as { id: Segment; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSegment(id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all ${
                segment === id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Segment: Tasks ── */}
      {segment === 'tasks' && (
        <div className="flex-1 flex flex-col">
          {/* Search + filter toolbar */}
          <div className="px-6 py-3 border-b border-zinc-800/40 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                id="action-task-search"
                type="text"
                placeholder="Search tasks or tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-all"
              />
            </div>

            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <Filter className="w-3.5 h-3.5 text-zinc-600 ml-1.5 mr-0.5" />
              {(['all', 'todo', 'in-progress', 'done'] as FilterStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs rounded-lg transition-all font-medium ${
                    statusFilter === s ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'in-progress' ? 'Active' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={loadTasks}
                className="p-2 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-xl transition-all"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                id="new-task-btn"
                onClick={() => { setFormParentId(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all shadow-md shadow-indigo-500/10"
              >
                <Plus className="w-4 h-4" /> New Task
              </button>
            </div>
          </div>

          {/* Task list */}
          <div className="flex-1 px-6 py-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : filteredTasks.length === 0 && !search ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                  <Plus className="w-6 h-6 text-zinc-600" />
                </div>
                <h3 className="text-base font-semibold text-zinc-400 mb-1">No tasks yet</h3>
                <p className="text-sm text-zinc-600 max-w-xs mb-5">
                  Break your goals into tasks. Link them to an active goal to let the Sensei track alignment.
                </p>
                <button
                  onClick={() => { setFormParentId(null); setShowForm(true); }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all"
                >
                  <Plus className="w-4 h-4" /> Create your first task
                </button>
              </div>
            ) : (
              <TaskList
                tasks={filteredTasks}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onAddSubtask={handleAddSubtask}
                onEdit={handleEdit}
                onReorder={setTasks}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Segment: Goals & Habits ── */}
      {segment === 'goals-habits' && (
        <div className="flex-1 px-6 py-6 space-y-6 max-w-5xl mx-auto w-full">
          {/* Goals — direction first */}
          <GoalCountdownWidget />

          {/* Habits — recurring behaviour */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <HabitTracker />
          </div>
        </div>
      )}

      {/* ── Task form modal ── */}
      {showForm && (
        <TaskForm
          parentId={formParentId}
          initialData={editingTask ?? undefined}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
          onClose={() => { setShowForm(false); setFormParentId(null); setEditingTask(null); }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl transition-all
            ${toast.type === 'error'
              ? 'bg-red-900/90 border border-red-700/60 text-red-200'
              : 'bg-zinc-800/90 border border-zinc-700/60 text-white'
            }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function SummaryChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 py-0.5 px-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
      {icon}
      <span className="text-zinc-400">{label}</span>
    </div>
  );
}
