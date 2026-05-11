'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Brain, Send, Repeat2, Zap, Loader2, Target, TrendingUp, Clock,
  CheckCircle2, AlertTriangle, Plus, MessageSquare, Trash2, ChevronDown, ChevronUp,
  Flame, PlayCircle, X,
} from 'lucide-react';
import SunWarrior from '@/components/gamification/SunWarrior';

// ── Types ─────────────────────────────────────────────────────────────────────
type InsightMode = 'Pattern' | 'Momentum' | 'Sensei' | 'Task-Audit';

interface Thread {
  id: string;
  title: string | null;
  last_message_at: string;
  created_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface AnalyticsData {
  totalFocusMinutes: number;
  todayFocusMinutes: number;
  todayPomodoros: number;
  weeklyBreakdown: { date: string; minutes: number }[];
  dailyTimeline: { hour: number; blocks: number }[];
  strictMode: { total: number; passed: number; failed: number };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MODES: { id: InsightMode; label: string; icon: React.ElementType; desc: string; active: string; color: string }[] = [
  { id: 'Pattern',    label: 'Pattern',    icon: Repeat2, desc: 'Recurring loops',    color: 'text-rose-400',   active: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
  { id: 'Momentum',   label: 'Momentum',   icon: Zap,     desc: "What's working",     color: 'text-emerald-400', active: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  { id: 'Sensei',     label: 'Sensei',     icon: Brain,   desc: 'Execution autopsy',  color: 'text-violet-400', active: 'bg-violet-500/15 border-violet-500/30 text-violet-300' },
  { id: 'Task-Audit', label: 'Task Audit', icon: Target,  desc: 'Goal alignment',     color: 'text-amber-400',  active: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
];

const SUGGESTED_PROMPTS = [
  'What am I consistently avoiding this week?',
  'Where is the gap between my intentions and actions?',
  'Which habit is causing the most drag on my momentum?',
  'What pattern shows up in my focus failures?',
];

function formatHours(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SenseiPage() {
  // Chat state
  const [activeMode, setActiveMode] = useState<InsightMode>('Sensei');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  // Thread history state
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);

  // Analytics state
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [userStats, setUserStats] = useState<{ streak_days: number; xp: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/sensei/threads').then(r => r.json()).catch(() => ({ threads: [] })),
      fetch('/api/stats/pomodoro').then(r => r.json()).catch(() => null),
      fetch('/api/stats/user').then(r => r.json()).catch(() => ({ stats: null })),
    ]).then(([threadsData, analyticsData, statsData]) => {
      setThreads(threadsData.threads ?? []);
      setThreadsLoading(false);
      setAnalytics(analyticsData);
      setUserStats(statsData.stats ?? null);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async (msg?: string) => {
    const text = (msg ?? question).trim();
    if (!text || loading) return;
    setQuestion('');
    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/sensei/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, mode: activeMode, threadId: currentThreadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (!currentThreadId && data.threadId) {
        setCurrentThreadId(data.threadId);
        // Refresh thread list
        fetch('/api/sensei/threads').then(r => r.json()).then(d => setThreads(d.threads ?? [])).catch(() => null);
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.advice,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: 'Something went wrong. Please try again.', created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ── New thread ───────────────────────────────────────────────────────────────
  const startNewThread = () => {
    setCurrentThreadId(null);
    setMessages([]);
    setQuestion('');
    setOpenThread(null);
  };

  // ── Open thread ──────────────────────────────────────────────────────────────
  const openThreadHistory = async (threadId: string) => {
    if (openThread === threadId) { setOpenThread(null); return; }
    setOpenThread(threadId);
    try {
      const res = await fetch(`/api/sensei/threads/${threadId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
        setCurrentThreadId(threadId);
        setShowHistory(false);
      }
    } catch { /* silent */ }
  };

  // ── Delete thread ─────────────────────────────────────────────────────────────
  const deleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/sensei/threads/${threadId}`, { method: 'DELETE' });
    setThreads(prev => prev.filter(t => t.id !== threadId));
    if (currentThreadId === threadId) startNewThread();
  };

  // ── Analytics derived ─────────────────────────────────────────────────────────
  const thisWeekMinutes = useMemo(() => analytics?.weeklyBreakdown?.reduce((s, d) => s + d.minutes, 0) ?? 0, [analytics]);
  const strictPassRate = analytics?.strictMode?.total
    ? Math.round((analytics.strictMode.passed / analytics.strictMode.total) * 100)
    : null;
  const maxWeekly = useMemo(() => Math.max(...(analytics?.weeklyBreakdown ?? []).map(d => d.minutes), 1), [analytics]);
  const maxTimeline = useMemo(() => Math.max(...(analytics?.dailyTimeline ?? []).map(d => d.blocks), 1), [analytics]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Brain className="w-6 h-6 text-violet-400" /> Sensei
            </h1>
            <p className="text-sm text-zinc-500 mt-1">See the truth of your behavior, then ask what it means.</p>
          </div>
          <button
            onClick={startNewThread}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" /> New Thread
          </button>
        </div>

        {/* ── Top summary strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <SummaryCard icon={Flame} label="Streak" value={userStats?.streak_days ? `${userStats.streak_days}d` : '—'} color="text-orange-400" />
          <SummaryCard icon={Zap} label="XP" value={userStats?.xp ? `${userStats.xp}` : '—'} color="text-amber-400" />
          <SummaryCard
            icon={Clock}
            label="Today"
            value={analytics?.todayFocusMinutes != null ? formatHours(analytics.todayFocusMinutes) : '—'}
            sub={analytics?.todayPomodoros ? `${analytics.todayPomodoros} 🍅` : undefined}
            color={analytics?.todayFocusMinutes ? 'text-emerald-400' : 'text-zinc-600'}
          />
          <SummaryCard icon={TrendingUp} label="This Week" value={formatHours(thisWeekMinutes)} color={thisWeekMinutes > 0 ? 'text-indigo-400' : 'text-zinc-600'} />
          <SummaryCard icon={Target} label="Strict Rate" value={strictPassRate !== null ? `${strictPassRate}%` : '—'} color={strictPassRate !== null ? (strictPassRate >= 70 ? 'text-emerald-400' : 'text-amber-400') : 'text-zinc-600'} />
          <SummaryCard icon={AlertTriangle} label="Violations" value={String(analytics?.strictMode?.failed ?? 0)} color={(analytics?.strictMode?.failed ?? 0) > 0 ? 'text-rose-400' : 'text-zinc-600'} />
        </div>

        {/* ── Two-column: Warrior + Sensei chat ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <SunWarrior />

          {/* Sensei chat panel */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-6 space-y-4 flex flex-col">
            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => {
                const Icon = m.icon;
                const isActive = activeMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setActiveMode(m.id)}
                    className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${
                      isActive ? m.active : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-900 hover:border-zinc-700'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isActive ? m.color : 'text-zinc-600'}`} />
                    <div>
                      <p className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-zinc-400'}`}>{m.label}</p>
                      <p className="text-[10px] text-zinc-600">{m.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Message thread */}
            {messages.length > 0 && (
              <div className="flex-1 space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-none">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600/30 border border-indigo-500/30 text-zinc-200'
                        : 'bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-serif'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="px-4 py-3 bg-zinc-950/80 border border-zinc-800 rounded-2xl flex items-center gap-2 text-xs text-zinc-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" /> Analyzing…
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Suggested prompts — only when empty */}
            {messages.length === 0 && !loading && (
              <div className="space-y-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Suggested</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      className="text-left px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-all"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="relative">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask the Sensei anything…"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-4 pr-10 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-all"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30 rounded-lg hover:bg-zinc-800"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* ── Analytics: Focus Charts ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Weekly breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Weekly Focus</h2>
              <span className="text-xs text-zinc-600 ml-auto">minutes</span>
            </div>
            {(analytics?.weeklyBreakdown ?? []).some(d => d.minutes > 0) ? (
              <div className="flex items-end gap-2 h-28">
                {(analytics?.weeklyBreakdown ?? []).map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group h-full">
                    <div className="w-full flex items-end justify-center flex-1 relative">
                      <div
                        className="w-full max-w-8 bg-indigo-500/70 rounded-t border border-indigo-400/30 group-hover:bg-indigo-400 transition-colors"
                        style={{ height: `${(d.minutes / maxWeekly) * 100}%`, minHeight: d.minutes > 0 ? '4px' : '0' }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChart message="No focus sessions this week." cta={{ label: 'Start a session', href: '/focus' }} />
            )}
          </div>

          {/* Peak hours */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <Clock className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Peak Hours</h2>
              <span className="text-xs text-zinc-600 ml-auto">blocks</span>
            </div>
            {(analytics?.dailyTimeline ?? []).length > 0 ? (
              <div className="flex items-end gap-0.5 h-28">
                {(analytics?.dailyTimeline ?? []).map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group h-full">
                    <div className="w-full flex items-end justify-center flex-1">
                      <div
                        className="w-full bg-emerald-500/70 rounded-t border border-emerald-400/30 group-hover:bg-emerald-400 transition-colors"
                        style={{ height: `${(d.blocks / maxTimeline) * 100}%`, minHeight: '4px' }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-600">{d.hour}h</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChart message="Peak hours appear after your first session." cta={{ label: 'Start a session', href: '/focus' }} />
            )}
          </div>
        </div>

        {/* ── Strict mode stats ── */}
        {(analytics?.strictMode?.total ?? 0) > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Strict Mode Sessions</h2>
            <div className="grid grid-cols-3 divide-x divide-zinc-800">
              <StatCell label="Total" value={String(analytics!.strictMode.total)} color="text-zinc-300" />
              <StatCell label="Passed" value={String(analytics!.strictMode.passed)} color="text-emerald-400" />
              <StatCell label="Failed" value={String(analytics!.strictMode.failed)} color="text-rose-400" />
            </div>
          </div>
        )}

        {/* ── Conversation History ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-800/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-white">Conversation History</h2>
              {threads.length > 0 && (
                <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-full px-2 py-0.5">
                  {threads.length}
                </span>
              )}
            </div>
            {showHistory ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
          </button>

          {showHistory && (
            <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
              {threadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
                </div>
              ) : threads.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-600">
                  No conversations yet. Start one above.
                </div>
              ) : (
                threads.map((thread) => (
                  <div key={thread.id} className="group">
                    <div
                      onClick={() => openThreadHistory(thread.id)}
                      className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-zinc-800/30 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Brain className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                        <span className="text-sm text-zinc-300 truncate">
                          {thread.title ?? 'Untitled conversation'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-[10px] text-zinc-600">{timeAgo(thread.last_message_at)}</span>
                        <button
                          onClick={(e) => deleteThread(thread.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-700 hover:text-rose-400 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {openThread === thread.id
                          ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" />
                          : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
                      </div>
                    </div>
                    {openThread === thread.id && messages.length > 0 && currentThreadId === thread.id && (
                      <div className="px-6 pb-4 space-y-2 bg-zinc-950/40">
                        {messages.slice(-4).map((msg) => (
                          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-indigo-600/20 text-zinc-300'
                                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 font-serif'
                            }`}>
                              {msg.content.slice(0, 200)}{msg.content.length > 200 ? '…' : ''}
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => { setShowHistory(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="text-xs px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 rounded-lg transition-colors"
                          >
                            Continue this thread ↑
                          </button>
                          <button onClick={startNewThread} className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded-lg transition-colors flex items-center gap-1">
                            <X className="w-3 h-3" /> New thread
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-zinc-600" />
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-3 px-4">
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-zinc-600 mt-1 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function EmptyChart({ message, cta }: { message: string; cta?: { label: string; href: string } }) {
  return (
    <div className="h-32 flex flex-col items-center justify-center gap-3">
      <p className="text-xs text-zinc-600 text-center">{message}</p>
      {cta && (
        <a href={cta.href} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs rounded-lg transition-colors">
          <PlayCircle className="w-3.5 h-3.5" /> {cta.label}
        </a>
      )}
    </div>
  );
}
