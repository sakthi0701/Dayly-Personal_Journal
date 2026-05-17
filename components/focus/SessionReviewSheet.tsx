'use client';

import { useState } from 'react';
import { Check, X, Zap, Star, AlertTriangle, Coffee, RotateCcw } from 'lucide-react';
import { useTimer } from '@/components/timer/TimerProvider';

interface NotToDoItem {
  label: string;
  emoji: string;
}

interface Props {
  notToDoItems: NotToDoItem[];
  taskTitle: string | null;
  sessionMinutes: number;
  onSubmit: (data: {
    triggeredDistractions: NotToDoItem[];
    completionNote: string;
  }) => void;
  xpResult: { xpEarned: number; xpDeducted: number; cleanSession: boolean } | null;
  isSubmitting: boolean;
}

export default function SessionReviewSheet({
  notToDoItems,
  taskTitle,
  sessionMinutes,
  onSubmit,
  xpResult,
  isSubmitting,
}: Props) {
  const [triggered, setTriggered] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const startTimer = useTimer(state => state.startTimer);
  const setDuration = useTimer(state => state.setDuration);
  const task = useTimer(state => state.task);
  const strictMode = useTimer(state => state.strictMode);
  const abandonTimer = useTimer(state => state.abandonTimer);

  const toggleDistraction = (label: string) => {
    setTriggered((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleSubmit = () => {
    const triggeredDistractions = notToDoItems.filter((item) => triggered.has(item.label));
    setSubmitted(true);
    onSubmit({ triggeredDistractions, completionNote: note });
  };

  // ── Post-submit: XP result display ─────────────────────────────────────────
  if (submitted && xpResult) {
    const net = xpResult.xpEarned - xpResult.xpDeducted;
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 text-center shadow-2xl animate-slide-up">
          {/* Session complete celebration */}
          <div className="mb-4">
            {xpResult.cleanSession ? (
              <>
                <div className="text-4xl mb-2">⚡</div>
                <h2 className="text-lg font-bold text-white">Clean Session!</h2>
                <p className="text-sm text-zinc-400 mt-1">Zero distractions. That&apos;s rare.</p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">✅</div>
                <h2 className="text-lg font-bold text-white">Session Complete</h2>
                {taskTitle && (
                  <p className="text-sm text-zinc-400 mt-1">Worked on: <span className="text-zinc-200">{taskTitle}</span></p>
                )}
              </>
            )}
          </div>

          {/* XP breakdown */}
          <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 mb-4 text-sm space-y-2">
            <div className="flex items-center justify-between text-zinc-300">
              <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-400" /> Focus session</span>
              <span className="text-amber-400 font-medium">+30 XP</span>
            </div>
            {xpResult.cleanSession && (
              <div className="flex items-center justify-between text-zinc-300">
                <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-emerald-400" /> Clean session bonus</span>
                <span className="text-emerald-400 font-medium">+15 XP</span>
              </div>
            )}
            {xpResult.xpDeducted > 0 && (
              <div className="flex items-center justify-between text-zinc-400">
                <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Distractions</span>
                <span className="text-amber-500 font-medium">-{xpResult.xpDeducted} XP</span>
              </div>
            )}
            <div className="pt-2 border-t border-zinc-700 flex items-center justify-between font-semibold">
              <span className="text-white">Total earned</span>
              <span className="text-amber-400 text-base">+{net} XP</span>
            </div>
          </div>

          <p className="text-xs text-zinc-500 mb-6">
            🍅 {Math.round(sessionMinutes)}m of deep work logged
          </p>

          {/* The Three Options */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                setDuration(5);
                startTimer(null, false, [], true);
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <Coffee className="w-4 h-4" /> Take Break (5m)
            </button>
            <button
              onClick={() => {
                setDuration(25);
                startTimer(task, strictMode, notToDoItems, false);
              }}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <RotateCcw className="w-4 h-4" /> Skip Break &amp; Focus (25m)
            </button>
            <button
              onClick={() => {
                abandonTimer();
              }}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium rounded-xl transition-all"
            >
              Done for Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting for result after submit ──────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 text-center shadow-2xl">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Saving session…</p>
        </div>
      </div>
    );
  }

  // ── Main review form ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎉</span>
            <h2 className="text-base font-bold text-white">Session Complete!</h2>
          </div>
          {taskTitle && (
            <p className="text-sm text-zinc-400 ml-7">
              Worked on: <span className="text-zinc-200">{taskTitle}</span>
            </p>
          )}
          <p className="text-xs text-zinc-500 ml-7 mt-0.5">
            {Math.round(sessionMinutes)} minutes of deep work
          </p>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Distraction review */}
          {notToDoItems.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-zinc-200 mb-3">
                Did any of these happen?
              </p>
              <div className="space-y-2">
                {notToDoItems.map((item) => {
                  const isTriggered = triggered.has(item.label);
                  return (
                    <button
                      key={item.label}
                      onClick={() => toggleDistraction(item.label)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                        isTriggered
                          ? 'bg-red-950/30 border-red-700/50 text-red-200'
                          : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 text-sm">
                        <span className="text-base">{item.emoji}</span>
                        {item.label}
                      </span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isTriggered ? 'border-red-400 bg-red-400/20' : 'border-zinc-600'
                      }`}>
                        {isTriggered && <X className="w-3 h-3 text-red-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {triggered.size === 0 ? (
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Clean session! +15 XP bonus
                </p>
              ) : (
                <p className="text-xs text-zinc-500 mt-2">
                  Honest reflection is the first step. No harsh penalties.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-zinc-400">
                ✅ Session done! No distractions were tracked.
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                Add not-to-dos in Action to start tracking focus quality.
              </p>
            </div>
          )}

          {/* Completion note */}
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">
              Completion note <span className="text-zinc-700">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you ship? Any blockers? One sentence is enough."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
            ) : (
              <><Check className="w-4 h-4" /> Save &amp; Continue</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

