'use client';

import { useState, useEffect } from 'react';
import { X, Pencil, Trash2, Check, Loader2 } from 'lucide-react';
import TagPill from './TagPill';

interface Tag { id: string; name: string; }

interface TagManagerProps {
  onClose: () => void;
  onTagsUpdated: () => void;
}

export default function TagManager({ onClose, onTagsUpdated }: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      setTags(data.tags ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tag? It will be removed from all tasks.')) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTags(prev => prev.filter(t => t.id !== id));
        onTagsUpdated();
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSave = async (id: string) => {
    if (!editName.trim()) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      if (res.ok) {
        const data = await res.json();
        setTags(prev => prev.map(t => t.id === id ? data.tag : t));
        onTagsUpdated();
        setEditingId(null);
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-white">Manage Tags</h2>
          <button type="button" onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : tags.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No tags found.</p>
          ) : (
            <div className="space-y-2">
              {tags.map(tag => (
                <div key={tag.id} className="flex items-center justify-between p-2 rounded-xl border border-zinc-800/60 bg-zinc-800/30">
                  {editingId === tag.id ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(tag.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => handleEditSave(tag.id)}
                        disabled={actionLoading === tag.id}
                        className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded-md"
                      >
                        {actionLoading === tag.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={actionLoading === tag.id}
                        className="p-1 text-zinc-500 hover:bg-zinc-800 rounded-md"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <TagPill tag={tag} size="sm" />
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity md:opacity-100">
                        <button
                          onClick={() => { setEditingId(tag.id); setEditName(tag.name); }}
                          className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(tag.id)}
                          disabled={actionLoading === tag.id}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          {actionLoading === tag.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
