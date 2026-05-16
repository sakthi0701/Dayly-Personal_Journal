'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Pencil, Trash2, Check, X, Ban } from 'lucide-react';

interface NotToDoItem {
  id: string;
  label: string;
  emoji: string;
  sort_order: number;
}

const EMOJI_OPTIONS = ['🚫', '📱', '📺', '🎮', '💬', '🛒', '☕', '🐦', '📧', '🎵', '🍕', '😴'];
const SUGGESTIONS = [
  { label: 'Checking phone', emoji: '📱' },
  { label: 'YouTube / reels', emoji: '📺' },
  { label: 'Random tab switching', emoji: '🌐' },
  { label: 'Instagram / social media', emoji: '📸' },
  { label: 'Checking messages', emoji: '💬' },
];

// ─── Sortable Row ─────────────────────────────────────────────────────────────

function SortableItem({
  item,
  onEdit,
  onDelete,
}: {
  item: NotToDoItem;
  onEdit: (item: NotToDoItem) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl group hover:border-zinc-700 transition-all"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-zinc-700 hover:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span className="text-lg leading-none shrink-0">{item.emoji}</span>

      <span className="flex-1 text-sm text-zinc-200 truncate">{item.label}</span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-all"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

function EditForm({
  initialLabel = '',
  initialEmoji = '🚫',
  onSave,
  onCancel,
}: {
  initialLabel?: string;
  initialEmoji?: string;
  onSave: (label: string, emoji: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleSave = () => {
    if (!label.trim()) return;
    onSave(label.trim(), emoji);
  };

  return (
    <div className="px-4 py-3 bg-zinc-900/80 border border-indigo-500/30 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        {/* Emoji picker trigger */}
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="w-10 h-10 flex items-center justify-center text-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-all"
          >
            {emoji}
          </button>
          {showEmojiPicker && (
            <div className="absolute top-full mt-1 left-0 z-20 bg-zinc-800 border border-zinc-700 rounded-xl p-2 grid grid-cols-6 gap-1 shadow-xl">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                  className={`w-8 h-8 flex items-center justify-center text-base rounded-lg hover:bg-zinc-700 transition-all ${emoji === e ? 'bg-zinc-700' : ''}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Label input */}
        <input
          autoFocus
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
          placeholder="e.g. Checking Instagram"
          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
        />

        <button
          onClick={handleSave}
          disabled={!label.trim()}
          className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-all"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={onCancel}
          className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NotToDoLibrary() {
  const [items, setItems] = useState<NotToDoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/not-to-do');
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      showToast('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (label: string, emoji: string) => {
    try {
      const res = await fetch('/api/not-to-do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, emoji }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems((prev) => [...prev, data.item]);
      setShowAddForm(false);
      showToast('Item added ✓');
    } catch {
      showToast('Failed to add item');
    }
  };

  const handleEdit = async (id: string, label: string, emoji: string) => {
    try {
      const res = await fetch(`/api/not-to-do/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, emoji }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems((prev) => prev.map((i) => (i.id === id ? data.item : i)));
      setEditingId(null);
      showToast('Updated ✓');
    } catch {
      showToast('Failed to update item');
    }
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/not-to-do/${id}`, { method: 'DELETE' });
      showToast('Removed');
    } catch {
      load();
      showToast('Failed to delete');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      sort_order: idx,
    }));
    setItems(reordered);

    try {
      await fetch('/api/not-to-do/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reordered.map(({ id, sort_order }) => ({ id, sort_order })) }),
      });
    } catch {
      load(); // revert on failure
    }
  };

  const addSuggestion = async (s: { label: string; emoji: string }) => {
    await handleAdd(s.label, s.emoji);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-400" />
            <h2 className="text-base font-semibold text-white">Not-to-do Library</h2>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 ml-7">
            Distractions and bad habits to avoid. Select from these during Focus sessions.
          </p>
        </div>
        <button
          id="add-not-to-do-btn"
          onClick={() => { setShowAddForm(true); setEditingId(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium rounded-xl transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <EditForm
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Items list */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-600 text-sm">Loading…</div>
      ) : items.length === 0 && !showAddForm ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 text-center py-2">No items yet. Start with these common distractions:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => addSuggestion(s)}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 transition-all text-left"
              >
                <span className="text-lg">{s.emoji}</span>
                <span>{s.label}</span>
                <Plus className="w-3.5 h-3.5 ml-auto text-zinc-600" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item) =>
                editingId === item.id ? (
                  <EditForm
                    key={item.id}
                    initialLabel={item.label}
                    initialEmoji={item.emoji}
                    onSave={(label, emoji) => handleEdit(item.id, label, emoji)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onEdit={(i) => setEditingId(i.id)}
                    onDelete={handleDelete}
                  />
                )
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Tip */}
      {items.length > 0 && (
        <p className="text-xs text-zinc-600 text-center">
          💡 Drag to reorder · Select up to 3 items when starting a Focus session
        </p>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 bg-zinc-800/90 border border-zinc-700/60 text-white text-sm rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
