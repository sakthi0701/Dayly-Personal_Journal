'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Plus, Loader2, Target, RefreshCw } from 'lucide-react';
import TagPill from './TagPill';
import type { Task } from './TaskCard';
import TagManager from './TagManager';

interface Tag { id: string; name: string; }
interface Goal { id: string; title: string; deadline: string | null; days_remaining: number | null; }

interface TaskFormProps {
  parentId?: string | null;
  initialData?: Task;          // passed when editing an existing task
  onCreated: (task: Task) => void;
  onUpdated?: (task: Task) => void;
  onClose: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'high',   label: '🔴 High' },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'none',   label: '⚪ None' },
];

export default function TaskForm({ parentId, initialData, onCreated, onUpdated, onClose }: TaskFormProps) {
  const isEdit = !!initialData;

  const [title,               setTitle]               = useState(initialData?.title ?? '');
  const [notes,               setNotes]               = useState(initialData?.notes ?? '');
  const [priority,            setPriority]            = useState<'high' | 'medium' | 'none'>(initialData?.priority ?? 'none');
  const [estimatedPomodoros,  setEstimatedPomodoros]  = useState(initialData?.estimated_pomodoros ?? 1);
  const [dueDate,             setDueDate]             = useState(initialData?.due_date?.slice(0, 10) ?? '');
  const [isRecurring,         setIsRecurring]         = useState(initialData?.is_recurring ?? false);
  const [recurrenceEndDate,   setRecurrenceEndDate]   = useState(initialData?.recurrence_end_date?.slice(0, 10) ?? '');
  // Parse recurringDays from existing recurrence_rule (format: 'days:1,3' or legacy 'Nx-weekly' / 'weekly')
  const [recurringDays,       setRecurringDays]       = useState<number[]>(() => {
    const rule = initialData?.recurrence_rule ?? '';
    if (rule.startsWith('days:')) {
      const parsed = rule.replace('days:', '').split(',').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
      if (parsed.length > 0) return parsed;
    }
    // Default to current day of week (0-6) if new or unparsed
    const todayDay = new Date().getDay();
    return [todayDay];
  });
  const [allTags,             setAllTags]             = useState<Tag[]>([]);
  const [selectedTags,        setSelectedTags]        = useState<Tag[]>(initialData?.tags ?? []);
  const [newTagName,          setNewTagName]          = useState('');
  const [allGoals,            setAllGoals]            = useState<Goal[]>([]);
  const [selectedGoalId,      setSelectedGoalId]      = useState<string>(initialData?.goal_id ?? '');
  const [loading,             setLoading]             = useState(false);
  const [error,               setError]               = useState('');
  const [showTagManager,      setShowTagManager]      = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const loadTags = () => {
      fetch('/api/tags')
        .then((r) => r.json())
        .then((d) => setAllTags(d.tags ?? []))
        .catch(() => null);
    };
    loadTags();
    fetch('/api/goals')
      .then((r) => r.json())
      .then((d) => setAllGoals((d.goals ?? []).filter((g: Goal & { status: string }) => g.status === 'active')))
      .catch(() => null);
  }, []);

  const handleAddTag = async () => {
    const name = newTagName.trim().toLowerCase();
    if (!name) return;
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.tag) {
        setAllTags((prev) => {
          if (prev.find((t) => t.id === data.tag.id)) return prev;
          return [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name));
        });
        setSelectedTags((prev) => prev.find((t) => t.id === data.tag.id) ? prev : [...prev, data.tag]);
        setNewTagName('');
      }
    } catch { /* silent */ }
  };

  const toggleTag = (tag: Tag) => {
    setSelectedTags((prev) =>
      prev.find((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setLoading(true);
    setError('');

    let finalDueDate = dueDate || null;
    if (isRecurring && recurringDays.length > 0) {
      const now = new Date();
      const todayDay = now.getDay();
      if (recurringDays.includes(todayDay)) {
        finalDueDate = now.toLocaleDateString('en-CA');
      } else {
        let minOffset = 7;
        for (let offset = 1; offset <= 7; offset++) {
          if (recurringDays.includes((todayDay + offset) % 7)) {
            minOffset = offset;
            break;
          }
        }
        const next = new Date(now);
        next.setDate(next.getDate() + minOffset);
        finalDueDate = next.toLocaleDateString('en-CA');
      }
    }

    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      priority,
      estimated_pomodoros: estimatedPomodoros,
      due_date: finalDueDate,
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? `days:${[...recurringDays].sort((a, b) => a - b).join(',')}` : null,
      recurrence_end_date: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
      tagIds: selectedTags.map((t) => t.id),
      goal_id: selectedGoalId || null,
    };

    try {
      if (isEdit && initialData) {
        // ── EDIT MODE ──────────────────────────────────────────────────────
        const res = await fetch(`/api/tasks/${initialData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to update task');
        onUpdated?.({
          ...initialData,
          title: payload.title,
          notes: payload.notes,
          priority: payload.priority,
          estimated_pomodoros: payload.estimated_pomodoros,
          due_date: payload.due_date,
          is_recurring: payload.is_recurring,
          recurrence_end_date: payload.recurrence_end_date,
          tags: selectedTags,
          goal_id: payload.goal_id,
        });
      } else {
        // ── CREATE MODE ────────────────────────────────────────────────────
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, parent_task_id: parentId ?? null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to create task');
        onCreated({ ...data.task, tags: selectedTags });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">
            {isEdit ? 'Edit Task' : parentId ? 'Add Subtask' : 'New Task'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <input
              ref={titleRef}
              id="task-title"
              type="text"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>

          {/* Notes */}
          <textarea
            id="task-notes"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all resize-none"
          />

          {/* Priority + Pomodoros + Due Date — hidden for subtasks */}
          {!parentId && (
            <div className={`grid gap-3 ${isRecurring ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Priority</label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'none')}
                  className="w-full bg-zinc-800 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-all"
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">🍅 Pomodoros</label>
                <input
                  id="task-pomodoros"
                  type="number"
                  min={1}
                  max={20}
                  value={estimatedPomodoros}
                  onChange={(e) => setEstimatedPomodoros(Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  className="w-full bg-zinc-800 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-all"
                />
              </div>

              {/* Hide manual Due Date field if recurring (since recurrence days determine due dates) */}
              {!isRecurring && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Due Date</label>
                  <div className="space-y-2">
                    <input
                      id="task-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                      className="w-full bg-zinc-800 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-all [color-scheme:dark]"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDueDate(new Date().toLocaleDateString('en-CA'))}
                        className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-md transition-colors"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const tmrw = new Date();
                          tmrw.setDate(tmrw.getDate() + 1);
                          setDueDate(tmrw.toLocaleDateString('en-CA'));
                        }}
                        className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-md transition-colors"
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recurring Task Toggle — hidden for subtasks */}
          {!parentId && (
            <div className="space-y-3">
              {/* Toggle row */}
              <button
                type="button"
                id="task-recurring-toggle"
                onClick={() => setIsRecurring((v) => !v)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-sm font-medium ${
                  isRecurring
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                <RefreshCw className={`w-4 h-4 flex-shrink-0 ${isRecurring ? 'text-violet-400' : ''}`} />
                <span className="flex-1 text-left">Recurring Task</span>
                {/* Toggle pill */}
                <div className={`relative w-9 h-5 rounded-full transition-colors ${isRecurring ? 'bg-violet-500' : 'bg-zinc-700'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {/* Recurrence settings — shown only when recurring is on */}
              {isRecurring && (
                <div className="pl-1 space-y-3 pt-1">
                  {/* Frequency: Specific days of the week */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 text-violet-400" />
                      Repeat On
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { day: 1, name: 'Mon', short: 'M' },
                        { day: 2, name: 'Tue', short: 'T' },
                        { day: 3, name: 'Wed', short: 'W' },
                        { day: 4, name: 'Thu', short: 'T' },
                        { day: 5, name: 'Fri', short: 'F' },
                        { day: 6, name: 'Sat', short: 'S' },
                        { day: 0, name: 'Sun', short: 'S' },
                      ].map(({ day, name }) => {
                        const isSelected = recurringDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            id={`task-recurring-day-${day}`}
                            onClick={() => {
                              setRecurringDays((prev) => {
                                if (prev.includes(day)) {
                                  // Don't allow deselecting all days
                                  if (prev.length === 1) return prev;
                                  return prev.filter((d) => d !== day);
                                } else {
                                  return [...prev, day];
                                }
                              });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'bg-violet-500/25 border-violet-500/60 text-violet-200 shadow-sm shadow-violet-500/20'
                                : 'bg-zinc-800 border-zinc-700/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[10px] text-zinc-500">
                      Task will repeat every week on{' '}
                      <span className="text-violet-300 font-medium">
                        {[...recurringDays]
                          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                          .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                          .join(', ')}
                      </span>
                    </p>
                  </div>

                  {/* End date */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">
                      Repeat Until <span className="text-zinc-600">(optional)</span>
                    </label>
                    <input
                      id="task-recurrence-end-date"
                      type="date"
                      value={recurrenceEndDate}
                      onChange={(e) => setRecurrenceEndDate(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                      className="w-full bg-zinc-800 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60 transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Goal Linking — shown for top-level tasks only */}
          {!parentId && allGoals.length > 0 && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 flex items-center gap-1.5">
                <Target className="w-3 h-3" /> Link to Goal
              </label>
              <select
                id="task-goal"
                value={selectedGoalId}
                onChange={(e) => setSelectedGoalId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60 transition-all"
              >
                <option value="">⬜ No goal (orphan task)</option>
                {allGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    🎯 {g.title}{g.days_remaining !== null ? ` — ${g.days_remaining < 0 ? 'OVERDUE' : g.days_remaining + 'd left'}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-zinc-500 block">Tags</label>
              <button
                type="button"
                onClick={() => setShowTagManager(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Manage Tags
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {allTags.map((tag) => {
                const selected = selectedTags.some((t) => t.id === tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`transition-all ${selected ? 'opacity-100 scale-105' : 'opacity-40 hover:opacity-70'}`}
                  >
                    <TagPill tag={tag} size="sm" />
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New tag…"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                className="flex-1 bg-zinc-800 border border-zinc-700/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/60 transition-all"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-1.5 bg-zinc-800 border border-zinc-700/60 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-600 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              id="task-submit"
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>

      {showTagManager && (
        <TagManager 
          onClose={() => setShowTagManager(false)} 
          onTagsUpdated={() => {
            fetch('/api/tags')
              .then((r) => r.json())
              .then((d) => setAllTags(d.tags ?? []))
              .catch(() => null);
          }} 
        />
      )}
    </div>
  );
}
