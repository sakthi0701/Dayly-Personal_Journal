'use client';

import { useState, useEffect } from 'react';
import { Ban, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

export interface NotToDoChip {
  label: string;
  emoji: string;
}

interface Props {
  selected: NotToDoChip[];
  onChange: (items: NotToDoChip[]) => void;
  strictMode: boolean;
  isRunning: boolean;
}

const MAX_SELECTED = 5;

export default function NotToDoSelector({ selected, onChange, strictMode, isRunning }: Props) {
  const [library, setLibrary] = useState<NotToDoChip[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Fetch library items once
  useEffect(() => {
    fetch('/api/not-to-do')
      .then((r) => r.json())
      .then((d) => setLibrary((d.items ?? []).map((i: { label: string; emoji: string }) => ({ label: i.label, emoji: i.emoji }))))
      .catch(() => null);
  }, []);

  const toggle = (chip: NotToDoChip) => {
    if (isRunning) return;
    const already = selected.some((s) => s.label === chip.label);
    if (already) {
      onChange(selected.filter((s) => s.label !== chip.label));
    } else if (selected.length < MAX_SELECTED) {
      onChange([...selected, chip]);
    }
  };

  const addCustom = () => {
    const label = customInput.trim();
    if (!label) return;
    const chip: NotToDoChip = { label, emoji: '🚫' };
    if (selected.length < MAX_SELECTED && !selected.some((s) => s.label === label)) {
      onChange([...selected, chip]);
    }
    setCustomInput('');
    setShowCustomInput(false);
  };

  const removeSelected = (label: string) => {
    if (isRunning) return;
    onChange(selected.filter((s) => s.label !== label));
  };

  // Show warning chip if strict mode is on and nothing selected
  const showStrictWarning = strictMode && selected.length === 0;

  // When collapsed: show a summary line
  if (!expanded && !isRunning) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-all ${
          showStrictWarning
            ? 'bg-red-950/20 border-red-500/40 text-red-300'
            : selected.length > 0
            ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
        }`}
      >
        <div className="flex items-center gap-2">
          <Ban className={`w-4 h-4 shrink-0 ${showStrictWarning ? 'text-red-400' : 'text-zinc-600'}`} />
          {selected.length === 0 ? (
            <span className={showStrictWarning ? 'text-red-300' : ''}>
              {showStrictWarning ? '⚠ Select distractions to avoid (strict mode)' : 'Set not-to-dos for this session'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 flex-wrap">
              {selected.map((s) => (
                <span key={s.label} className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-200">
                  {s.emoji} {s.label}
                </span>
              ))}
            </span>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />
      </button>
    );
  }

  // Running state — compact readonly display
  if (isRunning) {
    if (selected.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
          Avoid this session
        </p>
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.label}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/30 border border-red-800/40 rounded-full text-xs text-red-300"
            >
              {s.emoji} {s.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Expanded state — full selector
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ban className="w-4 h-4 text-red-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Not-to-dos
          </span>
          {selected.length > 0 && (
            <span className="px-1.5 py-0.5 bg-red-900/40 border border-red-700/40 rounded-full text-xs text-red-300 font-medium">
              {selected.length} selected
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="p-1 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* Strict mode nudge */}
      {showStrictWarning && (
        <p className="text-xs text-red-400/80 bg-red-950/20 border border-red-800/30 rounded-lg px-3 py-2">
          ⚠ Strict mode is on — select at least one distraction to avoid before starting.
        </p>
      )}

      {/* Library chips */}
      {library.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {library.map((chip) => {
            const isSelected = selected.some((s) => s.label === chip.label);
            const maxReached = !isSelected && selected.length >= MAX_SELECTED;
            return (
              <button
                key={chip.label}
                onClick={() => toggle(chip)}
                disabled={maxReached}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-red-900/50 border-red-600/60 text-red-200 shadow-sm shadow-red-900/20'
                    : maxReached
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100'
                }`}
              >
                <span>{chip.emoji}</span>
                <span>{chip.label}</span>
                {isSelected && <X className="w-3 h-3 opacity-70" />}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-zinc-600">
          No library items yet.{' '}
          <a href="/action" className="text-indigo-400 hover:underline">
            Add some in Action →
          </a>
        </p>
      )}

      {/* Selected removable chips (ones not in library — custom) */}
      {selected.filter((s) => !library.some((l) => l.label === s.label)).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-800">
          {selected
            .filter((s) => !library.some((l) => l.label === s.label))
            .map((s) => (
              <span
                key={s.label}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-300"
              >
                {s.emoji} {s.label}
                <button onClick={() => removeSelected(s.label)} className="hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
        </div>
      )}

      {/* Custom item input */}
      {selected.length < MAX_SELECTED && (
        <div>
          {showCustomInput ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); if (e.key === 'Escape') setShowCustomInput(false); }}
                placeholder="One-time distraction to avoid…"
                className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
              />
              <button
                onClick={addCustom}
                disabled={!customInput.trim()}
                className="p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowCustomInput(false)}
                className="p-1.5 text-zinc-600 hover:text-zinc-300 rounded-lg transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomInput(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add one-time item
            </button>
          )}
        </div>
      )}

      {selected.length >= MAX_SELECTED && (
        <p className="text-xs text-zinc-600">Max {MAX_SELECTED} items selected</p>
      )}
    </div>
  );
}
