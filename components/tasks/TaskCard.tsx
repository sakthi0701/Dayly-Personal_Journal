'use client';

import { useState } from 'react';
import { ChevronDown, MoreHorizontal, Plus, Trash2, CheckCircle2, Circle, PlayCircle, Pencil } from 'lucide-react';
import TagPill from './TagPill';
import SubtaskList from './SubtaskList';

interface Tag { id: string; name: string; }

export interface Task {
  id: string;
  title: string;
  notes?: string | null;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'high' | 'medium' | 'none';
  estimated_pomodoros: number;
  elapsed_pomodoros: number;
  due_date?: string | null;
  parent_task_id?: string | null;
  goal_id?: string | null;
  position: number;
  tags: Tag[];
  created_at: string;
  subtasks?: Task[];
  time_blocks?: { duration: number; mode: string; completed: boolean }[];
}

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => void;
  onAddSubtask?: (parentId: string) => void;
  onEdit?: (task: Task) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const PRIORITY_CONFIG = {
  high:   { dot: 'bg-red-400',    label: 'High',   badge: 'text-red-400' },
  medium: { dot: 'bg-amber-400',  label: 'Medium', badge: 'text-amber-400' },
  none:   { dot: 'bg-zinc-600',   label: '',        badge: '' },
};

function PomodoroRow({ total, elapsed }: { total: number; elapsed: number }) {
  const capped = Math.min(total, 8);
  const overflow = total > 8 ? total - 8 : 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: capped }).map((_, i) => (
        <span key={i} className={`text-[11px] ${i < elapsed ? 'opacity-100' : 'opacity-30'}`}>🍅</span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-zinc-500 ml-1">+{overflow}</span>
      )}
    </div>
  );
}

export default function TaskCard({ task, onUpdate, onDelete, onAddSubtask, onEdit, dragHandleProps }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cfg = PRIORITY_CONFIG[task.priority];

  const cycleStatus = async () => {
    const next = task.status === 'todo' ? 'in-progress' : task.status === 'in-progress' ? 'done' : 'todo';
    await onUpdate(task.id, { status: next });
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(task.id);
  };

  const StatusIcon = task.status === 'done'
    ? CheckCircle2
    : task.status === 'in-progress'
    ? PlayCircle
    : Circle;

  const statusColor = task.status === 'done'
    ? 'text-emerald-400'
    : task.status === 'in-progress'
    ? 'text-indigo-400'
    : 'text-zinc-600';

  const overdue = task.due_date && task.status !== 'done'
    && new Date(task.due_date) < new Date();

  return (
    <div
      className={`group relative bg-zinc-900/60 border rounded-xl transition-all duration-150
        ${task.status === 'done' ? 'border-zinc-800/40 opacity-60' : 'border-zinc-800 hover:border-zinc-700'}
        ${deleting ? 'animate-pulse' : ''}
      `}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Drag handle */}
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="mt-0.5 cursor-grab active:cursor-grabbing text-zinc-700 hover:text-zinc-500 transition-colors shrink-0"
            style={{ touchAction: 'none' }}
            aria-label="Drag to reorder"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="4" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" />
              <circle cx="4" cy="7" r="1.2" /><circle cx="10" cy="7" r="1.2" />
              <circle cx="4" cy="11" r="1.2" /><circle cx="10" cy="11" r="1.2" />
            </svg>
          </div>
        )}

        {/* Status toggle */}
        <button
          onClick={cycleStatus}
          className={`mt-0.5 shrink-0 transition-all hover:scale-110 ${statusColor}`}
          title={`Status: ${task.status}`}
        >
          <StatusIcon className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span
              className={`text-sm font-medium leading-snug ${
                task.status === 'done' ? 'line-through text-zinc-500' : 'text-white'
              }`}
            >
              {/* Priority indicator */}
              {task.priority !== 'none' && (
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 mb-0.5 ${cfg.dot}`} />
              )}
              {task.title}
            </span>

            {/* Actions menu */}
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-zinc-300 transition-all rounded-lg hover:bg-zinc-800"
                aria-label="Task actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-7 z-20 w-40 bg-zinc-900 border border-zinc-700 rounded-xl py-1 shadow-xl">
                  {onEdit && (
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(task); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <Pencil className="w-4 h-4" /> Edit task
                    </button>
                  )}
                  {onAddSubtask && (
                    <button
                      onClick={() => { setMenuOpen(false); onAddSubtask(task.id); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add subtask
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); handleDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Notes display */}
          {task.notes && (
            <div className="mt-1 text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
              {task.notes}
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
            <PomodoroRow total={task.estimated_pomodoros} elapsed={task.elapsed_pomodoros} />

            {task.due_date && (
              <span className={`text-[11px] font-medium ${overdue ? 'text-red-400' : 'text-zinc-500'}`}>
                {overdue ? '⚠ ' : ''}
                {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}

            {task.tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} size="xs" />
            ))}
          </div>
        </div>

        {/* Expand subtasks toggle */}
        {!task.parent_task_id && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-0.5 p-1 text-zinc-600 hover:text-zinc-400 transition-all rounded-lg hover:bg-zinc-800 shrink-0"
            aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Subtasks */}
      {expanded && (
        <div className="border-t border-zinc-800/60 px-4 pb-3 pt-2">
          <SubtaskList
            parentId={task.id}
            initialSubtasks={task.subtasks}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
          {onAddSubtask && (
            <button
              onClick={() => onAddSubtask(task.id)}
              className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600 hover:text-indigo-400 transition-colors pl-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add subtask
            </button>
          )}
        </div>
      )}
    </div>
  );
}
