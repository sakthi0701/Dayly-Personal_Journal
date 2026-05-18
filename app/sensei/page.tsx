'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Brain, Send, Loader2, Target, TrendingUp, Clock, AlertTriangle,
  Plus, MessageSquare, Trash2, ChevronDown, ChevronUp, Flame, Zap,
  PlayCircle, X, BarChart2, ChevronRight,
} from 'lucide-react';
import SunWarrior from '@/components/gamification/SunWarrior';

// ── Types ────────────────────────────────────────────────────────────────────
interface Thread { id: string; title: string | null; last_message_at: string; created_at: string; }
interface Message { id: string; role: 'user' | 'assistant'; content: string; created_at: string; }
interface AnalyticsData {
  totalFocusMinutes: number;
  todayFocusMinutes: number;
  todayPomodoros: number;
  yesterdayFocusMinutes: number;
  lastWeekAvgPerDay: number;
  weeklyBreakdown: { date: string; minutes: number }[];
  weekdayPattern: { name: string; avgMinutes: number }[];
  dailyTimeline: { hour: number; blocks: number }[];
  strictMode: { total: number; passed: number; failed: number };
  rangeDays: number;
}

type ChartRange = 7 | 14 | 30 | 90;
type SecondaryView = 'weekday' | 'peak';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMins(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime(), m = Math.floor(diff / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtDate(d: string, range: ChartRange) {
  const dt = new Date(d);
  if (range <= 14) return dt.toLocaleDateString('en-US', { weekday: 'short' });
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const RANGES: ChartRange[] = [7, 14, 30, 90];
const SUGGESTED = [
  'What am I consistently avoiding this week?',
  'Where is the gap between my intentions and actions?',
  'Which habit is causing the most drag on my momentum?',
  'What pattern shows up in my focus failures?',
];

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SenseiPage() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [userStats, setUserStats] = useState<{ streak_days: number; xp: number } | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>(7);
  const [secondaryView, setSecondaryView] = useState<SecondaryView>('weekday');
  const [showDetails, setShowDetails] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadAnalytics = useCallback((range: ChartRange) => {
    const t = Date.now();
    fetch(`/api/stats/pomodoro?range=${range}&t=${t}`).then(r => r.json()).then(setAnalytics).catch(() => null);
  }, []);

  const loadData = useCallback(() => {
    const t = Date.now();
    Promise.all([
      fetch(`/api/sensei/threads?t=${t}`).then(r => r.json()).catch(() => ({ threads: [] })),
      fetch(`/api/stats/user?t=${t}`).then(r => r.json()).catch(() => ({ stats: null })),
    ]).then(([threadsData, statsData]) => {
      setThreads(threadsData.threads ?? []);
      setThreadsLoading(false);
      setUserStats(statsData.stats ?? null);
    });
    loadAnalytics(chartRange);
  }, [chartRange, loadAnalytics]);

  useEffect(() => {
    loadData();
    window.addEventListener('dayly-refresh-tasks', loadData);
    return () => window.removeEventListener('dayly-refresh-tasks', loadData);
  }, [loadData]);

  useEffect(() => { loadAnalytics(chartRange); }, [chartRange, loadAnalytics]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Derived KPI deltas ────────────────────────────────────────────────────────
  const todayDelta = useMemo(() => {
    if (!analytics) return null;
    const d = analytics.todayFocusMinutes - analytics.yesterdayFocusMinutes;
    return { value: Math.abs(d), up: d >= 0 };
  }, [analytics]);

  const weekDelta = useMemo(() => {
    if (!analytics) return null;
    const d = analytics.todayFocusMinutes - analytics.lastWeekAvgPerDay;
    return { value: Math.abs(d), up: d >= 0 };
  }, [analytics]);

  const strictPassRate = analytics?.strictMode?.total
    ? Math.round((analytics.strictMode.passed / analytics.strictMode.total) * 100) : null;

  // ── Actions ───────────────────────────────────────────────────────────────────
  const sendMessage = async (msg?: string) => {
    const text = (msg ?? question).trim();
    if (!text || loading) return;
    setQuestion(''); setLoading(true);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch('/api/sensei/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, threadId: currentThreadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!currentThreadId && data.threadId) {
        setCurrentThreadId(data.threadId);
        fetch('/api/sensei/threads').then(r => r.json()).then(d => setThreads(d.threads ?? [])).catch(() => null);
      }
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: data.advice, created_at: new Date().toISOString() }]);
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Something went wrong. Please try again.', created_at: new Date().toISOString() }]);
    } finally { setLoading(false); }
  };

  const startNewThread = () => { setCurrentThreadId(null); setMessages([]); setQuestion(''); setOpenThread(null); };

  const openThreadHistory = async (id: string) => {
    if (openThread === id) { setOpenThread(null); return; }
    setOpenThread(id);
    try {
      const res = await fetch(`/api/sensei/threads/${id}`);
      const data = await res.json();
      if (data.messages) { setMessages(data.messages); setCurrentThreadId(id); setShowHistory(false); }
    } catch { /* silent */ }
  };

  const deleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/sensei/threads/${id}`, { method: 'DELETE' });
    setThreads(prev => prev.filter(t => t.id !== id));
    if (currentThreadId === id) startNewThread();
  };

  // ── Chart data ────────────────────────────────────────────────────────────────
  const chartData = useMemo(() =>
    (analytics?.weeklyBreakdown ?? []).map(d => ({ ...d, label: fmtDate(d.date, chartRange) })),
    [analytics, chartRange]
  );
  const secondaryData = secondaryView === 'weekday'
    ? (analytics?.weekdayPattern ?? []).map(d => ({ name: d.name, value: d.avgMinutes }))
    : (analytics?.dailyTimeline ?? []).map(d => ({ name: `${d.hour}h`, value: d.blocks }));

  const hasChartData = chartData.some(d => d.minutes > 0);
  const hasSecondaryData = secondaryData.some(d => d.value > 0);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-5xl mx-auto px-5 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Brain className="w-6 h-6 text-violet-400" /> Sensei
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">See the truth of your behavior, then ask what it means.</p>
          </div>
          <button onClick={startNewThread} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl transition-all">
            <Plus className="w-4 h-4" /> New Thread
          </button>
        </div>

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Hero: Today's focus with delta */}
          <div className="col-span-2 sm:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-zinc-600" />
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Today's Focus</span>
              </div>
              <p className={`text-3xl font-bold ${(analytics?.todayFocusMinutes ?? 0) > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {analytics ? formatMins(analytics.todayFocusMinutes) : '—'}
              </p>
              {analytics && (
                <div className="flex gap-3 mt-1">
                  {todayDelta && (
                    <span className={`text-xs font-medium ${todayDelta.up ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {todayDelta.up ? '↑' : '↓'} {formatMins(todayDelta.value)} vs yesterday
                    </span>
                  )}
                  {weekDelta && (
                    <span className={`text-xs ${weekDelta.up ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {weekDelta.up ? '↑' : '↓'} {formatMins(weekDelta.value)} vs 7d avg
                    </span>
                  )}
                </div>
              )}
            </div>
            {analytics?.todayPomodoros ? (
              <div className="text-right">
                <p className="text-2xl font-bold text-orange-400">{analytics.todayPomodoros}</p>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">🍅 pomodoros</p>
              </div>
            ) : null}
          </div>

          <KPICard icon={Flame} label="Streak" value={userStats?.streak_days ? `${userStats.streak_days}d` : '—'} color="text-orange-400" />
          <KPICard
            icon={Target} label="Strict Rate"
            value={strictPassRate !== null ? `${strictPassRate}%` : '—'}
            color={strictPassRate !== null ? (strictPassRate >= 70 ? 'text-emerald-400' : 'text-amber-400') : 'text-zinc-600'}
          />
        </div>

        {/* ── Show Details toggle ── */}
        {(analytics?.strictMode?.total ?? 0) > 0 && (
          <div>
            <button onClick={() => setShowDetails(v => !v)} className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showDetails ? 'Hide' : 'Show'} strict mode details
            </button>
            {showDetails && (
              <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 grid grid-cols-3 divide-x divide-zinc-800">
                <StatCell label="Total Sessions" value={String(analytics!.strictMode.total)} color="text-zinc-300" />
                <StatCell label="Passed" value={String(analytics!.strictMode.passed)} color="text-emerald-400" />
                <StatCell label="Failed" value={String(analytics!.strictMode.failed)} color="text-rose-400" />
              </div>
            )}
          </div>
        )}

        {/* ── Main Focus Chart ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Focus Minutes</h2>
            </div>
            {/* Range toggle */}
            <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              {RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${chartRange === r ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
          {hasChartData ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} interval={chartRange <= 14 ? 0 : Math.floor(chartRange / 7) - 1} />
                <YAxis tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }} itemStyle={{ color: '#a5b4fc' }}
                  formatter={(v: number) => [`${v}m`, 'Focus']}
                />
                <Area type="monotone" dataKey="minutes" stroke="#6366f1" strokeWidth={2} fill="url(#focusGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={`No focus data for last ${chartRange} days.`} cta={{ label: 'Start a session', href: '/focus' }} />
          )}
        </div>

        {/* ── Secondary Chart ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">
                {secondaryView === 'weekday' ? 'Weekday Pattern' : 'Peak Hours'}
              </h2>
            </div>
            <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              {(['weekday', 'peak'] as SecondaryView[]).map(v => (
                <button key={v} onClick={() => setSecondaryView(v)} className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${secondaryView === v ? 'bg-emerald-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {v === 'weekday' ? 'Weekday' : 'Peak Hrs'}
                </button>
              ))}
            </div>
          </div>
          {hasSecondaryData ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={secondaryData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#52525b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }} itemStyle={{ color: '#6ee7b7' }}
                  formatter={(v: number) => [secondaryView === 'weekday' ? `${v}m avg` : `${v} blocks`, '']}
                />
                <Bar dataKey="value" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Data appears after your first focus sessions." cta={{ label: 'Start a session', href: '/focus' }} />
          )}
        </div>

        {/* ── Sensei Chat Panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <SunWarrior />
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-6 space-y-4 flex flex-col">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-white">Sensei Insight</h2>
              <span className="ml-auto text-[10px] text-zinc-600">autonomous · data-driven</span>
            </div>

            {messages.length > 0 && (
              <div className="flex-1 space-y-3 max-h-80 overflow-y-auto pr-1 scrollbar-none">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600/30 border border-indigo-500/30 text-zinc-200'
                        : 'bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-serif'
                    }`}>{msg.content}</div>
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

            {messages.length === 0 && !loading && (
              <div className="space-y-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">Suggested</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {SUGGESTED.map(p => (
                    <button key={p} onClick={() => sendMessage(p)} className="text-left px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-all">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="relative">
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask the Sensei anything… or leave blank for an autonomous insight."
                rows={2}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-4 pr-10 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-all resize-none"
              />
              <button type="submit" disabled={loading} className="absolute right-2 bottom-2 p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30 rounded-lg hover:bg-zinc-800">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* ── Conversation History ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button onClick={() => setShowHistory(!showHistory)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-800/40 transition-colors">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-white">Conversation History</h2>
              {threads.length > 0 && <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-full px-2 py-0.5">{threads.length}</span>}
            </div>
            {showHistory ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
          </button>
          {showHistory && (
            <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
              {threadsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 text-zinc-600 animate-spin" /></div>
              ) : threads.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-600">No conversations yet. Start one above.</div>
              ) : (
                threads.map(thread => (
                  <div key={thread.id} className="group">
                    <div onClick={() => openThreadHistory(thread.id)} className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-zinc-800/30 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        <Brain className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                        <span className="text-sm text-zinc-300 truncate">{thread.title ?? 'Untitled conversation'}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-[10px] text-zinc-600">{timeAgo(thread.last_message_at)}</span>
                        <button onClick={e => deleteThread(thread.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-700 hover:text-rose-400 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {openThread === thread.id ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
                      </div>
                    </div>
                    {openThread === thread.id && messages.length > 0 && currentThreadId === thread.id && (
                      <div className="px-6 pb-4 space-y-2 bg-zinc-950/40">
                        {messages.slice(-4).map(msg => (
                          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600/20 text-zinc-300' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 font-serif'}`}>
                              {msg.content.slice(0, 200)}{msg.content.length > 200 ? '…' : ''}
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => { setShowHistory(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-xs px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 rounded-lg transition-colors">
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
function KPICard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-zinc-600" />
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
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

