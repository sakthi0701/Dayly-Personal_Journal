'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { KeyboardSensor } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import TaskCard, { type Task } from './TaskCard';

interface TaskListProps {
  tasks: Task[];
  onUpdate: (id: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => void;
  onAddSubtask: (parentId: string) => void;
  onEdit: (task: Task) => void;
  onReorder: (tasks: Task[]) => void;
}

interface SortableTaskProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => void;
  onAddSubtask: (parentId: string) => void;
  onEdit: (task: Task) => void;
}

function SortableTask({ task, onUpdate, onDelete, onAddSubtask, onEdit }: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAddSubtask={onAddSubtask}
        onEdit={onEdit}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

interface PriorityGroupProps {
  label: string;
  emoji: string;
  color: string;
  tasks: Task[];
  onUpdate: (id: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => void;
  onAddSubtask: (parentId: string) => void;
  onEdit: (task: Task) => void;
  onReorder: (tasks: Task[]) => void;
}

function PriorityGroup({
  label, emoji, color, tasks,
  onUpdate, onDelete, onAddSubtask, onEdit, onReorder,
}: PriorityGroupProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (tasks.length === 0) return null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = tasks.findIndex((t) => t.id === active.id);
      const newIdx = tasks.findIndex((t) => t.id === over.id);
      onReorder(arrayMove(tasks, oldIdx, newIdx));
    }
  };

  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 px-1`}>
        <span className="text-base">{emoji}</span>
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</h3>
        <span className="text-xs text-zinc-700 ml-1">({tasks.length})</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <SortableTask
                key={task.id}
                task={task}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddSubtask={onAddSubtask}
                onEdit={onEdit}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export default function TaskList({ tasks, onUpdate, onDelete, onAddSubtask, onEdit, onReorder }: TaskListProps) {
  // Split by priority, hide done tasks in separate section
  const activeTasks = tasks.filter((t) => t.status !== 'done');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  const highTasks   = activeTasks.filter((t) => t.priority === 'high');
  const mediumTasks = activeTasks.filter((t) => t.priority === 'medium');
  const noneTasks   = activeTasks.filter((t) => t.priority === 'none');

  const handleGroupReorder = (priority: string, reordered: Task[]) => {
    const rest = tasks.filter((t) => t.priority !== priority || t.status === 'done');
    const merged = [...reordered, ...rest];
    onReorder(merged);

    // Batch upsert — single DB call instead of N PATCHes
    const items = reordered
      .map((task, idx) => ({ id: task.id, position: idx }))
      .filter((item, idx) => reordered[idx].position !== idx); // only changed rows

    if (items.length > 0) {
      fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }).catch(console.error);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PriorityGroup
        label="High Priority"
        emoji="🔴"
        color="text-red-400"
        tasks={highTasks}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAddSubtask={onAddSubtask}
        onEdit={onEdit}
        onReorder={(r) => handleGroupReorder('high', r)}
      />
      <PriorityGroup
        label="Medium Priority"
        emoji="🟡"
        color="text-amber-400"
        tasks={mediumTasks}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAddSubtask={onAddSubtask}
        onEdit={onEdit}
        onReorder={(r) => handleGroupReorder('medium', r)}
      />
      <PriorityGroup
        label="No Priority"
        emoji="⚪"
        color="text-zinc-500"
        tasks={noneTasks}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAddSubtask={onAddSubtask}
        onEdit={onEdit}
        onReorder={(r) => handleGroupReorder('none', r)}
      />

      {/* Done tasks — collapsed section */}
      {doneTasks.length > 0 && (
        <div className="opacity-50">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span>✅</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Completed</h3>
            <span className="text-xs text-zinc-700 ml-1">({doneTasks.length})</span>
          </div>
          <div className="flex flex-col gap-2">
            {doneTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-4xl mb-4">🌱</span>
          <p className="text-zinc-500 text-sm">No tasks yet. Add one to get started.</p>
        </div>
      )}
    </div>
  );
}
