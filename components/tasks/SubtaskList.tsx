'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import TaskCard, { type Task } from './TaskCard';

interface SubtaskListProps {
  parentId: string;
  initialSubtasks?: Task[];
  onUpdate: (id: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => void;
}

export default function SubtaskList({ parentId, initialSubtasks, onUpdate, onDelete }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Task[]>(initialSubtasks || []);
  const [loading, setLoading] = useState(!initialSubtasks);

  useEffect(() => {
    // If we have initial subtasks, we skip the initial fetch.
    // The refresh event will handle explicit updates.
    if (!initialSubtasks) {
      setLoading(true);
      fetch(`/api/tasks/${parentId}/subtasks`)
        .then((r) => r.json())
        .then((data) => { setSubtasks(data.subtasks ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [parentId, initialSubtasks]);

  useEffect(() => {
    const handleRefresh = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.parentId === parentId) {
        fetch(`/api/tasks/${parentId}/subtasks`)
          .then((r) => r.json())
          .then((data) => { setSubtasks(data.subtasks ?? []); })
          .catch(() => null);
      }
    };
    window.addEventListener('dayly-refresh-subtasks', handleRefresh);
    return () => window.removeEventListener('dayly-refresh-subtasks', handleRefresh);
  }, [parentId]);

  const handleUpdate = async (id: string, updates: Partial<Task>) => {
    await onUpdate(id, updates);
    setSubtasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  };

  const handleDelete = (id: string) => {
    setSubtasks((prev) => prev.filter((t) => t.id !== id));
    onDelete(id);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-zinc-600 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading subtasks…
      </div>
    );
  }

  if (subtasks.length === 0) {
    return (
      <p className="text-xs text-zinc-700 py-1 pl-1">No subtasks yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pl-3 border-l border-zinc-800/60">
      {subtasks.map((sub) => (
        <TaskCard
          key={sub.id}
          task={sub}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
