'use client';

import { useState, useEffect } from 'react';
import { Plus, Flame, Trash2, X, Loader2, TrendingUp, ShieldCheck, AlertOctagon, Pencil, Check } from 'lucide-react';

interface HabitLog {
  id: string;
  logged_at: string;
  status: 'success' | 'failed' | 'skipped' | null;
}

interface Habit {
  id: string;
  name: string;
  icon?: string;
  color: string | null;
  habit_type: 'good' | 'bad' | null;
  frequency: { type: string } | null;
  created_at: string;
  habit_logs: HabitLog[];
}

// Always returns a valid color — the null crash fix
const COLOR_MAP: Record<string, { dot: string; bar: string; success: string }> = {
  indigo:  { dot: 'bg-indigo-500',  bar: 'bg-indigo-500',  success: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  violet:  { dot: 'bg-violet-500',  bar: 'bg-violet-500',  success: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  emerald: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  amber:   { dot: 'bg-amber-500',   bar: 'bg-amber-500',   success: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  rose:    { dot: 'bg-rose-500',    bar: 'bg-rose-500',    success: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  sky:     { dot: 'bg-sky-500',     bar: 'bg-sky-500',     success: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
};
const COLORS = Object.keys(COLOR_MAP);
const safeColor = (c: string | null) => COLOR_MAP[c ?? ''] ?? COLOR_MAP.indigo;

function getLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calcStreak(habit: Habit): number {
  const today = new Date();
  const createdDate = new Date(habit.created_at);
  createdDate.setHours(0, 0, 0, 0); // normalize

  const isBad = habit.habit_type === 'bad';
  let streak = 0;

  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);

    if (d < createdDate) break; // Don't count days before the habit existed

    const dateStr = getLocalDateStr(d);
    const log = habit.habit_logs.find((l) => getLocalDateStr(new Date(l.logged_at)) === dateStr);

    if (isBad) {
      if (!log || log.status === 'success') {
        streak++;
      } else if (i === 0) {
        continue; // if failed today, the current streak is 0, but we break on the else. Actually wait.
        // If it's a bad habit and they failed today, the streak IS broken (streak = 0). 
        // We shouldn't continue, we should break. So let's fall through to break.
      } else {
        break;
      }
    } else {
      if (log?.status === 'success') {
        streak++;
      } else if (i === 0) {
        continue;
      } else {
        break;
      }
    }
  }

  // Adjust for bad habits: if failed today, streak is strictly 0.
  if (isBad && streak > 0) {
    const todayLog = habit.habit_logs.find((l) => getLocalDateStr(new Date(l.logged_at)) === getLocalDateStr(today));
    if (todayLog?.status === 'failed') {
      return 0;
    }
  }

  return streak;
}

export default function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('indigo');
  const [newType, setNewType] = useState<'good' | 'bad'>('good');
  const [logging, setLogging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('indigo');
  const [editSaving, setEditSaving] = useState(false);

  const fetchHabits = async () => {
    try {
      const res = await fetch('/api/habits');
      const data = await res.json();
      setHabits(data.habits ?? []);
    } catch (err) {
      console.error('[HabitTracker] fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHabits(); }, []);

  const handleLog = async (habitId: string, status: 'success' | 'failed') => {
    setLogging(habitId + status);
    try {
      const res = await fetch(`/api/habits/${habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchHabits();
    } catch (err) {
      console.error(err);
    } finally {
      setLogging(null);
    }
  };

  const handleSkip = async (habitId: string) => {
    setLogging(habitId + 'skipped');
    try {
      const res = await fetch(`/api/habits/${habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped' }),
      });
      if (res.ok) fetchHabits();
    } catch (err) {
      console.error(err);
    } finally {
      setLogging(null);
    }
  };

  const handleDelete = async (habitId: string) => {
    try {
      await fetch(`/api/habits/${habitId}`, { method: 'DELETE' });
      setHabits((prev) => prev.filter((h) => h.id !== habitId));
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (habit: Habit) => {
    setEditingId(habit.id);
    setEditName(habit.name);
    setEditColor(habit.color ?? 'indigo');
  };

  const handleEdit = async (habitId: string) => {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/habits/${habitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (res.ok) {
        setHabits((prev) =>
          prev.map((h) => h.id === habitId ? { ...h, name: editName.trim(), color: editColor } : h)
        );
        setEditingId(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          icon: newType === 'bad' ? '⚠️' : '✨',
          color: newType === 'bad' ? 'rose' : newColor,
          frequency: { type: 'daily' },
          habit_type: newType,
        }),
      });
      if (res.ok) {
        setNewName('');
        setNewColor('indigo');
        setNewType('good');
        setShowAdd(false);
        fetchHabits();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
      </div>
    );
  }

  const goodHabits = habits.filter((h) => (h.habit_type ?? 'good') === 'good');
  const badHabits  = habits.filter((h) => h.habit_type === 'bad');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          <h2 className="text-base font-bold text-white">Habits</h2>
          {habits.length > 0 && (
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
              {habits.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 font-medium transition-colors"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'Add Habit'}
        </button>
      </div>

      {/* Add Habit Form */}
      {showAdd && (
        <form onSubmit={handleAddHabit} className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewType('good')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-all ${
                newType === 'good'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Good Habit
            </button>
            <button
              type="button"
              onClick={() => setNewType('bad')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-all ${
                newType === 'bad'
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <AlertOctagon className="w-4 h-4" /> Bad Habit
            </button>
          </div>

          <div className="space-y-1">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                newType === 'good'
                  ? 'Identity-based habit (e.g. Read 20 mins)'
                  : 'Habit to break (e.g. Checked phone first thing)'
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {newType === 'bad' && (
              <p className="text-xs text-zinc-600 px-1">
                You&apos;ll mark <span className="text-rose-400">Gave in</span> on days you slip — silence means you held strong.
              </p>
            )}
          </div>

          {/* Color picker — only for good habits */}
          {newType === 'good' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Color:</span>
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full ${COLOR_MAP[c].dot} transition-all ${
                      newColor === c ? 'ring-2 ring-white/30 ring-offset-1 ring-offset-zinc-950 scale-125' : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Adding…' : 'Add Habit'}
          </button>
        </form>
      )}

      {/* Empty state */}
      {habits.length === 0 && !showAdd && (
        <div className="text-center py-10 bg-zinc-950/40 border border-zinc-800/60 border-dashed rounded-xl">
          <Flame className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-500 mb-1">No habits tracked yet</p>
          <p className="text-xs text-zinc-700 mb-4">Add a habit to build identity-based consistency.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
          >
            Add your first habit
          </button>
        </div>
      )}

      {/* Good Habits */}
      {goodHabits.length > 0 && (
        <section className="space-y-3">
          {goodHabits.length > 0 && badHabits.length > 0 && (
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Build</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {goodHabits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                onLog={handleLog}
                onSkip={handleSkip}
                onDelete={handleDelete}
                onEdit={startEdit}
                onEditSave={handleEdit}
                editingId={editingId}
                editName={editName}
                editColor={editColor}
                editSaving={editSaving}
                onEditNameChange={setEditName}
                onEditColorChange={setEditColor}
                onEditCancel={() => setEditingId(null)}
                logging={logging}
              />
            ))}
          </div>
        </section>
      )}

      {/* Bad Habits */}
      {badHabits.length > 0 && (
        <section className="space-y-3">
          {goodHabits.length > 0 && (
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider">Break</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {badHabits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                onLog={handleLog}
                onSkip={handleSkip}
                onDelete={handleDelete}
                onEdit={startEdit}
                onEditSave={handleEdit}
                editingId={editingId}
                editName={editName}
                editColor={editColor}
                editSaving={editSaving}
                onEditNameChange={setEditName}
                onEditColorChange={setEditColor}
                onEditCancel={() => setEditingId(null)}
                logging={logging}
                isBad
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ─── HabitCard ─────────────────────────────────────────────────────────── */

function HabitCard({
  habit, onLog, onSkip, onDelete, onEdit, onEditSave, editingId,
  editName, editColor, editSaving, onEditNameChange, onEditColorChange, onEditCancel,
  logging, isBad = false,
}: {
  habit: Habit;
  onLog: (id: string, status: 'success' | 'failed') => void;
  onSkip: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onEditSave: (id: string) => void;
  editingId: string | null;
  editName: string;
  editColor: string;
  editSaving: boolean;
  onEditNameChange: (v: string) => void;
  onEditColorChange: (v: string) => void;
  onEditCancel: () => void;
  logging: string | null;
  isBad?: boolean;
}) {
  const isEditing = editingId === habit.id;
  const colors = safeColor(habit.color);
  const today = new Date();
  const todayStr = getLocalDateStr(today);
  const todayLog = habit.habit_logs.find((l) => getLocalDateStr(new Date(l.logged_at)) === todayStr);
  const streak = calcStreak(habit);

  const isLogging = (s: string) => logging === habit.id + s;

  return (
    <div className="group bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 hover:border-zinc-700/70 transition-all">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${isBad ? 'bg-rose-500' : colors.dot}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-snug truncate">{habit.name}</p>
            {streak > 0 && !isBad && (
              <div className="flex items-center gap-1 mt-0.5">
                <TrendingUp className="w-3 h-3 text-orange-400 flex-shrink-0" />
                <span className="text-[10px] text-orange-400 font-semibold">{streak}d streak</span>
              </div>
            )}
            {isBad && streak > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span className="text-[10px] text-emerald-400 font-semibold">{streak}d clean</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onEdit(habit)}
            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-700 hover:text-indigo-400 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(habit.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-700 hover:text-red-400 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {isEditing && (
        <div className="mb-3 p-3 bg-zinc-950/70 border border-zinc-700 rounded-lg space-y-2">
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
          {!isBad && (
            <div className="flex items-center gap-1.5">
              {Object.keys(COLOR_MAP).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onEditColorChange(c)}
                  className={`w-4 h-4 rounded-full ${COLOR_MAP[c].dot} transition-all ${
                    editColor === c ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-zinc-950 scale-125' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onEditSave(habit.id)}
              disabled={editSaving || !editName.trim()}
              className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs rounded-lg"
            >
              {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
            </button>
            <button onClick={onEditCancel} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Action area */}
      {todayLog ? (
        <div className={`text-center py-1.5 px-3 rounded-lg border text-xs font-medium ${
          todayLog.status === 'success'
            ? isBad
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
              : colors.success
            : todayLog.status === 'failed'
            ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
            : 'bg-zinc-800 text-zinc-500 border-zinc-700'
        }`}>
          {todayLog.status === 'success'
            ? isBad ? '✓ Stayed clean today' : '✓ Done today'
            : todayLog.status === 'failed'
            ? isBad ? '✗ Gave in today' : '✗ Failed today'
            : '→ Skipped today'}
        </div>
      ) : isBad ? (
        /* Bad habit: just one "Gave in" button — silence = resisted */
        <div className="space-y-1.5">
          <button
            onClick={() => onLog(habit.id, 'failed')}
            disabled={!!isLogging('failed')}
            className="w-full py-1.5 text-sm rounded-lg border border-rose-800/50 bg-rose-950/30 text-rose-400 hover:bg-rose-950/60 hover:border-rose-700 transition-all disabled:opacity-50"
          >
            {isLogging('failed') ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : '✗ Gave in'}
          </button>
          <p className="text-center text-[10px] text-zinc-700">No action = stayed clean ✓</p>
        </div>
      ) : (
        /* Good habit: Done / Failed / Skip */
        <div className="flex gap-1.5">
          {[
            { s: 'success' as const, label: '✓', title: 'Done',   cls: 'hover:bg-emerald-600/20 hover:text-emerald-400 hover:border-emerald-700/50' },
            { s: 'failed'  as const, label: '✗', title: 'Failed', cls: 'hover:bg-rose-600/20 hover:text-rose-400 hover:border-rose-700/50' },
          ].map((btn) => (
            <button
              key={btn.s}
              onClick={() => onLog(habit.id, btn.s)}
              disabled={!!isLogging(btn.s)}
              title={btn.title}
              className={`flex-1 py-1.5 text-sm rounded-lg border border-zinc-700/60 text-zinc-500 transition-all disabled:opacity-50 ${btn.cls}`}
            >
              {isLogging(btn.s) ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : btn.label}
            </button>
          ))}
          <button
            onClick={() => onSkip(habit.id)}
            disabled={!!isLogging('skipped')}
            title="Skip"
            className="flex-1 py-1.5 text-sm rounded-lg border border-zinc-700/60 text-zinc-500 hover:bg-zinc-700/40 hover:text-zinc-300 transition-all disabled:opacity-50"
          >
            {isLogging('skipped') ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : '→'}
          </button>
        </div>
      )}

      {/* 14-day sparkline */}
      <div className="mt-3 flex gap-0.5">
        {[...Array(14)].map((_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - (13 - i));
          const ds = getLocalDateStr(d);
          const log = habit.habit_logs.find((l) => getLocalDateStr(new Date(l.logged_at)) === ds);
          
          const createdDate = new Date(habit.created_at);
          createdDate.setHours(0, 0, 0, 0);
          d.setHours(0, 0, 0, 0);

          let bg = 'bg-zinc-800/80';
          if (d >= createdDate) {
            if (isBad) {
               // Bad habit sparkline
               if (!log || log.status === 'success') bg = 'bg-emerald-600';
               else bg = 'bg-rose-600'; // failed
            } else {
               // Good habit sparkline
               if (log?.status === 'success') bg = colors.bar;
               else if (log?.status === 'failed') bg = 'bg-rose-600';
               else if (log?.status === 'skipped') bg = 'bg-zinc-600';
            }
          }

          return (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-sm ${bg} transition-opacity`}
              title={ds}
            />
          );
        })}
      </div>
    </div>
  );
}
