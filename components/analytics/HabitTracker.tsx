'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Flame, Trash2, X, Loader2, TrendingUp, ShieldCheck,
  AlertOctagon, Pencil, Check, CalendarDays,
} from 'lucide-react';

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
  frequency: { type: string; weekly_goal?: number } | null;
  created_at: string;
  habit_logs: HabitLog[];
}

// ─── Colour palette ───────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, { dot: string; bar: string; success: string; fill: string }> = {
  indigo:  { dot: 'bg-indigo-500',  bar: 'bg-indigo-500',  success: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',  fill: '#6366f1' },
  violet:  { dot: 'bg-violet-500',  bar: 'bg-violet-500',  success: 'bg-violet-500/20 text-violet-300 border-violet-500/30',  fill: '#8b5cf6' },
  emerald: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', fill: '#10b981' },
  amber:   { dot: 'bg-amber-500',   bar: 'bg-amber-500',   success: 'bg-amber-500/20 text-amber-300 border-amber-500/30',   fill: '#f59e0b' },
  rose:    { dot: 'bg-rose-500',    bar: 'bg-rose-500',    success: 'bg-rose-500/20 text-rose-300 border-rose-500/30',    fill: '#f43f5e' },
  sky:     { dot: 'bg-sky-500',     bar: 'bg-sky-500',     success: 'bg-sky-500/20 text-sky-300 border-sky-500/30',     fill: '#0ea5e9' },
};
const COLORS = Object.keys(COLOR_MAP);
const safeColor = (c: string | null) => COLOR_MAP[c ?? ''] ?? COLOR_MAP.indigo;

// ─── Date utilities ───────────────────────────────────────────────────────────
function getLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Returns the Monday of the ISO week containing `date` */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon…
  const diff = (day === 0 ? -6 : 1 - day); // shift so Monday = start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Count successful logs in a given Mon–Sun week (identified by its Monday date) */
function countWeekCompletions(habit: Habit, weekMonday: Date): number {
  const weekEnd = new Date(weekMonday);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return habit.habit_logs.filter((l) => {
    const d = new Date(l.logged_at);
    return d >= weekMonday && d <= weekEnd && l.status === 'success';
  }).length;
}

/** Current week Mon–Sun dates (7 elements) */
function getCurrentWeekDays(): Date[] {
  const monday = getWeekStart(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Compute weekly streak: consecutive past weeks (not counting current) where completions >= goal */
function calcWeeklyStreak(habit: Habit, weeklyGoal: number): number {
  const createdDate = new Date(habit.created_at);
  createdDate.setHours(0, 0, 0, 0);
  let streak = 0;

  for (let weeksBack = 1; weeksBack <= 52; weeksBack++) {
    const refDate = new Date();
    refDate.setDate(refDate.getDate() - weeksBack * 7);
    const monday = getWeekStart(refDate);

    if (monday < createdDate) break; // don't count before habit existed

    const completions = countWeekCompletions(habit, monday);
    if (habit.habit_type === 'bad') {
      // Bad habit: streak = weeks with ZERO failures
      const failures = habit.habit_logs.filter((l) => {
        const d = new Date(l.logged_at);
        const weekEnd = new Date(monday);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return d >= monday && d <= weekEnd && l.status === 'failed';
      }).length;
      if (failures === 0) streak++;
      else break;
    } else {
      if (completions >= weeklyGoal) streak++;
      else break;
    }
  }
  return streak;
}

// ─── Weekly Summary ───────────────────────────────────────────────────────────
function WeeklySummaryCard({ habits }: { habits: Habit[] }) {
  const weekDays = getCurrentWeekDays();
  const monday = weekDays[0];
  const sunday = weekDays[6];

  const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const todayStr = getLocalDateStr(new Date());

  const goodHabits = habits.filter((h) => (h.habit_type ?? 'good') === 'good');
  const totalThisWeek = goodHabits.reduce((acc, h) => acc + countWeekCompletions(h, monday), 0);
  const totalGoal = goodHabits.reduce((acc, h) => acc + (h.frequency?.weekly_goal ?? 3), 0);
  const weekPct = totalGoal > 0 ? Math.min(100, Math.round((totalThisWeek / totalGoal) * 100)) : 0;

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 border border-zinc-800/60 rounded-2xl p-5 mb-1">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">This Week</span>
          <span className="text-xs text-zinc-500">{fmtShort(monday)} – {fmtShort(sunday)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white">{totalThisWeek}</span>
          <span className="text-xs text-zinc-500">/ {totalGoal} completions</span>
        </div>
      </div>

      {/* Week-level progress bar */}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
          style={{ width: `${weekPct}%` }}
        />
      </div>

      {/* Per-habit progress this week */}
      {goodHabits.length > 0 && (
        <div className="space-y-2.5">
          {goodHabits.map((h) => {
            const goal = h.frequency?.weekly_goal ?? 3;
            const done = countWeekCompletions(h, monday);
            const pct = Math.min(100, Math.round((done / goal) * 100));
            const colors = safeColor(h.color);

            return (
              <div key={h.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400 truncate max-w-[160px]">{h.name}</span>
                  <div className="flex items-center gap-2">
                    {/* 7-day mini dots */}
                    <div className="flex gap-0.5">
                      {weekDays.map((day, i) => {
                        const ds = getLocalDateStr(day);
                        const isToday = ds === todayStr;
                        const isFuture = day > new Date();
                        const log = h.habit_logs.find((l) => getLocalDateStr(new Date(l.logged_at)) === ds);
                        let dotClass = 'bg-zinc-800';
                        if (!isFuture) {
                          if (log?.status === 'success') dotClass = colors.dot;
                          else if (log?.status === 'failed') dotClass = 'bg-rose-600';
                          else if (log?.status === 'skipped') dotClass = 'bg-zinc-600';
                        }
                        return (
                          <div
                            key={i}
                            title={`${DAY_LABELS[i]} ${ds}`}
                            className={`w-2.5 h-2.5 rounded-full ${dotClass} ${isToday ? 'ring-1 ring-white/30' : ''} transition-colors`}
                          />
                        );
                      })}
                    </div>
                    <span className={`text-[10px] font-semibold ${done >= goal ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {done}/{goal}
                    </span>
                  </div>
                </div>
                <div className="h-1 bg-zinc-800/80 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${colors.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('indigo');
  const [newType, setNewType] = useState<'good' | 'bad'>('good');
  const [newWeeklyGoal, setNewWeeklyGoal] = useState(3);
  const [logging, setLogging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('indigo');
  const [editWeeklyGoal, setEditWeeklyGoal] = useState(3);
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
    setEditWeeklyGoal(habit.frequency?.weekly_goal ?? 3);
  };

  const handleEdit = async (habitId: string) => {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/habits/${habitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor, weekly_goal: editWeeklyGoal }),
      });
      if (res.ok) {
        setHabits((prev) =>
          prev.map((h) => h.id === habitId
            ? { ...h, name: editName.trim(), color: editColor, frequency: { ...(h.frequency ?? { type: 'weekly' }), weekly_goal: editWeeklyGoal } }
            : h
          )
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
          frequency: { type: 'weekly', weekly_goal: newType === 'bad' ? 1 : newWeeklyGoal },
          habit_type: newType,
        }),
      });
      if (res.ok) {
        setNewName('');
        setNewColor('indigo');
        setNewType('good');
        setNewWeeklyGoal(3);
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

      {/* Weekly Summary Card — shown when there are good habits */}
      {goodHabits.length > 0 && <WeeklySummaryCard habits={habits} />}

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

          {/* Weekly goal & colour — only for good habits */}
          {newType === 'good' && (
            <div className="flex items-center gap-4">
              {/* Weekly goal stepper */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Goal:</span>
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setNewWeeklyGoal((v) => Math.max(1, v - 1))}
                    className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                  >−</button>
                  <span className="text-sm font-bold text-white w-4 text-center">{newWeeklyGoal}</span>
                  <button
                    type="button"
                    onClick={() => setNewWeeklyGoal((v) => Math.min(7, v + 1))}
                    className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                  >+</button>
                </div>
                <span className="text-xs text-zinc-600">× / week</span>
              </div>

              {/* Color picker */}
              <div className="flex items-center gap-2 flex-1 justify-end">
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
          <p className="text-xs text-zinc-700 mb-4">Add a habit to build identity-based weekly consistency.</p>
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
                editWeeklyGoal={editWeeklyGoal}
                editSaving={editSaving}
                onEditNameChange={setEditName}
                onEditColorChange={setEditColor}
                onEditWeeklyGoalChange={setEditWeeklyGoal}
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
                editWeeklyGoal={editWeeklyGoal}
                editSaving={editSaving}
                onEditNameChange={setEditName}
                onEditColorChange={setEditColor}
                onEditWeeklyGoalChange={setEditWeeklyGoal}
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

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function HabitCard({
  habit, onLog, onSkip, onDelete, onEdit, onEditSave, editingId,
  editName, editColor, editWeeklyGoal, editSaving,
  onEditNameChange, onEditColorChange, onEditWeeklyGoalChange, onEditCancel,
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
  editWeeklyGoal: number;
  editSaving: boolean;
  onEditNameChange: (v: string) => void;
  onEditColorChange: (v: string) => void;
  onEditWeeklyGoalChange: (v: number) => void;
  onEditCancel: () => void;
  logging: string | null;
  isBad?: boolean;
}) {
  const isEditing = editingId === habit.id;
  const colors = safeColor(habit.color);
  const weeklyGoal = habit.frequency?.weekly_goal ?? 3;
  const today = new Date();
  const todayStr = getLocalDateStr(today);
  const todayLog = habit.habit_logs.find((l) => getLocalDateStr(new Date(l.logged_at)) === todayStr);

  // Weekly data
  const weekMonday = getWeekStart(today);
  const weekDays = getCurrentWeekDays();
  const weekCompletions = countWeekCompletions(habit, weekMonday);
  const weekPct = Math.min(100, Math.round((weekCompletions / weeklyGoal) * 100));
  const weeklyStreak = calcWeeklyStreak(habit, weeklyGoal);
  const isWeekGoalMet = weekCompletions >= weeklyGoal;

  const isLogging = (s: string) => logging === habit.id + s;

  return (
    <div className="group bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 hover:border-zinc-700/70 transition-all">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${isBad ? 'bg-rose-500' : colors.dot}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-snug truncate">{habit.name}</p>
            {/* Weekly streak badge */}
            {weeklyStreak > 0 && !isBad && (
              <div className="flex items-center gap-1 mt-0.5">
                <TrendingUp className="w-3 h-3 text-orange-400 flex-shrink-0" />
                <span className="text-[10px] text-orange-400 font-semibold">🔥 {weeklyStreak}-week streak</span>
              </div>
            )}
            {isBad && weeklyStreak > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span className="text-[10px] text-emerald-400 font-semibold">{weeklyStreak}-week clean</span>
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
            <>
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Weekly goal:</span>
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-0.5">
                  <button
                    type="button"
                    onClick={() => onEditWeeklyGoalChange(Math.max(1, editWeeklyGoal - 1))}
                    className="w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-white"
                  >−</button>
                  <span className="text-sm font-bold text-white w-4 text-center">{editWeeklyGoal}</span>
                  <button
                    type="button"
                    onClick={() => onEditWeeklyGoalChange(Math.min(7, editWeeklyGoal + 1))}
                    className="w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-white"
                  >+</button>
                </div>
                <span className="text-xs text-zinc-600">× / week</span>
              </div>
            </>
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

      {/* 7-day week view (Mon → Sun) */}
      {!isBad && (
        <div className="mb-3">
          <div className="flex justify-between mb-1">
            {weekDays.map((day, i) => {
              const ds = getLocalDateStr(day);
              const isToday = ds === todayStr;
              const isFuture = day > new Date();
              const log = habit.habit_logs.find((l) => getLocalDateStr(new Date(l.logged_at)) === ds);
              let dotBg = 'bg-zinc-800';
              if (!isFuture) {
                if (log?.status === 'success') dotBg = colors.dot;
                else if (log?.status === 'failed') dotBg = 'bg-rose-500/70';
                else if (log?.status === 'skipped') dotBg = 'bg-zinc-600';
              }

              return (
                <div key={i} className="flex flex-col items-center gap-0.5" title={ds}>
                  <span className={`text-[9px] font-medium ${isToday ? 'text-white' : 'text-zinc-600'}`}>
                    {DAY_LABELS[i]}
                  </span>
                  <div className={`w-4 h-4 rounded-full ${dotBg} ${isToday ? 'ring-2 ring-white/20' : ''} transition-colors`} />
                </div>
              );
            })}
          </div>
          {/* Weekly progress bar */}
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isWeekGoalMet ? 'bg-emerald-500' : colors.bar}`}
              style={{ width: `${weekPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className={`text-[10px] font-semibold ${isWeekGoalMet ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {weekCompletions}/{weeklyGoal} this week
            </span>
            {isWeekGoalMet && (
              <span className="text-[10px] text-emerald-400 font-bold">✓ Goal met!</span>
            )}
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
    </div>
  );
}
