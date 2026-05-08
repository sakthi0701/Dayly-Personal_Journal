'use client';

import { useState, useEffect } from 'react';
import { Target, Plus, CheckCircle2, Trash2, Loader2, Flag, X, Pencil, Check } from 'lucide-react';

interface Goal {
  id: string;
  title: string;
  deadline: string | null;
  status: 'active' | 'completed' | 'abandoned';
  days_remaining: number | null;
  progress_pct: number;
  created_at: string;
}

export default function GoalCountdownWidget() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchGoals = async () => {
    try {
      const res = await fetch('/api/goals');
      const data = await res.json();
      setGoals(data.goals?.filter((g: Goal) => g.status === 'active') ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          deadline: newDeadline || null,
        }),
      });
      if (res.ok) {
        setNewTitle('');
        setNewDeadline('');
        setShowAdd(false);
        fetchGoals();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/goals/${id}`, { method: 'DELETE' });
      fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setEditTitle(goal.title);
    setEditDeadline(goal.deadline ?? '');
  };

  const handleEditSave = async (id: string) => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), deadline: editDeadline || null }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchGoals();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEditSaving(false);
    }
  };

  const getUrgencyColor = (daysRemaining: number | null) => {
    if (daysRemaining === null) return { bar: 'bg-indigo-500', text: 'text-indigo-400', badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' };
    if (daysRemaining < 0)  return { bar: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/10 border-red-500/20 text-red-400' };
    if (daysRemaining <= 10) return { bar: 'bg-red-500',   text: 'text-red-400',    badge: 'bg-red-500/10 border-red-500/20 text-red-400' };
    if (daysRemaining <= 30) return { bar: 'bg-amber-500', text: 'text-amber-400',  badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' };
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Active Goals</h2>
          {goals.length > 0 && (
            <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-full px-2 py-0.5 font-medium">
              {goals.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 font-medium transition-colors"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'New Goal'}
        </button>
      </div>

      {/* Add Goal Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="mb-4 p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-3">
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What are you building toward? (e.g. Launch MedLLM MVP)"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <div className="flex gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Flag className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
              <input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={adding || !newTitle.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </button>
          </div>
        </form>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-zinc-600 text-sm">No active goals. Add one to start tracking alignment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const colors = getUrgencyColor(goal.days_remaining);
            const deadlineLabel =
              goal.days_remaining === null
                ? 'No deadline'
                : goal.days_remaining < 0
                ? `${Math.abs(goal.days_remaining)}d overdue`
                : goal.days_remaining === 0
                ? 'Due today'
                : `${goal.days_remaining}d left`;

            return (
              <div key={goal.id} className="group p-4 bg-zinc-950/50 border border-zinc-800/60 rounded-xl hover:border-zinc-700/60 transition-all">
                {editingId === goal.id ? (
                  /* Inline edit form */
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-2">
                      <Flag className="w-3.5 h-3.5 text-zinc-500" />
                      <input
                        type="date"
                        value={editDeadline}
                        onChange={(e) => setEditDeadline(e.target.value)}
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditSave(goal.id)}
                        disabled={editSaving || !editTitle.trim()}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs rounded-lg"
                      >
                        {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="text-sm font-semibold text-white leading-snug">{goal.title}</h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                          {deadlineLabel}
                        </span>
                        <button onClick={() => startEdit(goal)} title="Edit goal" className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-indigo-400 transition-all">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleComplete(goal.id)} title="Mark complete" className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-emerald-400 transition-all">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(goal.id)} title="Delete goal" className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${colors.bar}`} style={{ width: `${goal.progress_pct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[10px] text-zinc-600">Start</span>
                      <span className={`text-[10px] font-medium ${colors.text}`}>{goal.progress_pct}% of time elapsed</span>
                      <span className="text-[10px] text-zinc-600">Deadline</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
