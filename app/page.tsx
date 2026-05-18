'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BookOpen, Flame, Zap, Calendar, Target,
  ArrowRight, CheckSquare, Circle, AlertCircle,
  Clock, Loader2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Habit {
  id: string;
  name: string;
  icon: string;
  habit_logs: { logged_at: string; status: string }[];
}
interface PressureTask {
  id: string;
  title: string;
  deadline: string | null;
  status: string;
}
interface Task {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
}
interface Goal {
  id: string;
  title: string;
  deadline: string | null;
  days_remaining: number | null;
  status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning Sakthi.';
  if (h < 17) return 'Good afternoon Sakthi.';
  if (h < 21) return 'Good evening Sakthi.';
  return 'Still at it.';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function getTodayStr(): string {
  const tz = (typeof window !== 'undefined' ? localStorage.getItem('dayly_timezone') : null) ?? 'UTC';
  const timeZone = tz === 'IST' ? 'Asia/Kolkata' : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function isLoggedToday(logs: { logged_at: string }[]): boolean {
  const today = getTodayStr();
  return logs.some((l) => l.logged_at?.slice(0, 10) === today);
}

function deadlineLabel(dateStr: string | null): { label: string; urgent: boolean } {
  if (!dateStr) return { label: 'No deadline', urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: 'Overdue', urgent: true };
  if (diff === 0) return { label: 'Due today', urgent: true };
  if (diff === 1) return { label: 'Tomorrow', urgent: false };
  return { label: `${diff}d left`, urgent: false };
}

function formatMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionCard({
  icon: Icon,
  title,
  accentClass,
  iconClass,
  badge,
  href,
  hrefLabel,
  children,
  loading,
}: {
  icon: React.ElementType;
  title: string;
  accentClass: string;  // left border color
  iconClass: string;    // icon color
  badge?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className={`relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden`}>
      {/* Accent left border */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentClass}`} />
      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{title}</span>
          {badge && <span className="ml-1">{badge}</span>}
          {href && hrefLabel && (
            <Link
              href={href}
              className="ml-auto text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
            >
              {hrefLabel} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-zinc-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : children}
      </div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: 'rose' | 'amber' | 'orange' | 'indigo' | 'emerald' | 'zinc' }) {
  const map = {
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    orange: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    indigo: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    zinc: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[color]}`}>
      {label}
    </span>
  );
}

function DeadlineChip({ dateStr }: { dateStr: string | null }) {
  const { label, urgent } = deadlineLabel(dateStr);
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${urgent
        ? 'bg-rose-500/15 text-rose-400 border-rose-500/20'
        : label.endsWith('left') && parseInt(label) <= 3
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
      }`}>
      {label}
    </span>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <p className="text-xs text-zinc-700 py-3 text-center">{message}</p>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CommandCenter() {
  const [focusMinutes, setFocusMinutes] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [habitsDue, setHabitsDue] = useState<Habit[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [pressureTasks, setPressureTasks] = useState<PressureTask[]>([]);
  const [pressureLoading, setPressureLoading] = useState(true);
  const [deadlineTasks, setDeadlineTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);

  const load = useCallback(async () => {
    const tz = (typeof window !== 'undefined' ? localStorage.getItem('dayly_timezone') : null) ?? 'UTC';
    const t = Date.now();

    // Focus + streak (parallel, non-blocking)
    fetch(`/api/stats/pomodoro?tz=${tz}&t=${t}`)
      .then((r) => r.json())
      .then((d) => setFocusMinutes(d.todayFocusMinutes ?? 0))
      .catch(() => setFocusMinutes(0));

    fetch(`/api/stats/user?t=${t}`)
      .then((r) => r.json())
      .then((d) => setStreak(d.stats?.streak_days ?? 0))
      .catch(() => setStreak(0));

    // Habits
    fetch(`/api/habits?t=${t}`)
      .then((r) => r.json())
      .then((d) => {
        const due = (d.habits ?? []).filter((h: Habit) => !isLoggedToday(h.habit_logs));
        setHabitsDue(due);
      })
      .catch(() => setHabitsDue([]))
      .finally(() => setHabitsLoading(false));

    // Pressure tasks (active only)
    fetch(`/api/pressure-tasks?filter=active&t=${t}`)
      .then((r) => r.json())
      .then((d) => setPressureTasks(d.tasks ?? []))
      .catch(() => setPressureTasks([]))
      .finally(() => setPressureLoading(false));

    // Deadline tasks
    fetch(`/api/tasks?t=${t}`)
      .then((r) => r.json())
      .then((d) => {
        const withDeadline = (d.tasks ?? [])
          .filter((t: Task) => t.due_date && t.status !== 'done')
          .sort((a: Task, b: Task) =>
            new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
          )
          .slice(0, 5);
        setDeadlineTasks(withDeadline);
      })
      .catch(() => setDeadlineTasks([]))
      .finally(() => setTasksLoading(false));

    // Goals (active, sorted by deadline)
    fetch(`/api/goals?t=${t}`)
      .then((r) => r.json())
      .then((d) => {
        const active = (d.goals ?? [])
          .filter((g: Goal) => g.status === 'active')
          .sort((a: Goal, b: Goal) => {
            // Overdue first, then soonest deadline
            const aD = a.days_remaining ?? 9999;
            const bD = b.days_remaining ?? 9999;
            return aD - bD;
          })
          .slice(0, 4);
        setGoals(active);
      })
      .catch(() => setGoals([]))
      .finally(() => setGoalsLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('dayly-refresh-tasks', load);
    return () => window.removeEventListener('dayly-refresh-tasks', load);
  }, [load]);

  const overdueGoals = goals.filter((g) => (g.days_remaining ?? 0) < 0);
  const upcomingGoals = goals.filter((g) => (g.days_remaining ?? 0) >= 0);

  return (
    <main className="flex-1 min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-5 py-8 space-y-5">

        {/* ── Hero Strip ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between pb-5 border-b border-zinc-800/60">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{getGreeting()}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{formatDate()}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            <span className={`text-sm font-semibold ${focusMinutes && focusMinutes > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
              {focusMinutes === null ? '…' : focusMinutes > 0 ? formatMins(focusMinutes) : '0m'} today
            </span>
          </div>
        </div>

        {/* ── Row 1: Journal CTA + Habits ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">

          {/* Journal CTA */}
          <div className="sm:col-span-3">
            <SectionCard
              icon={BookOpen}
              title="Journal"
              accentClass="bg-amber-500"
              iconClass="text-amber-400"
              href="/entries"
              hrefLabel="All entries"
            >
              <p className="text-sm text-zinc-500 mb-4 leading-relaxed">
                Capture what&apos;s on your mind. Voice or text — your choice.
              </p>
              <Link
                href="/entries/new"
                id="start-writing-btn"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-400 text-sm font-semibold rounded-xl transition-all"
              >
                Start Writing <ArrowRight className="w-4 h-4" />
              </Link>
            </SectionCard>
          </div>

          {/* Habits Due */}
          <div className="sm:col-span-2">
            <SectionCard
              icon={Flame}
              title="Habits"
              accentClass="bg-orange-500"
              iconClass="text-orange-400"
              badge={
                habitsDue.length > 0
                  ? <Badge label={`${habitsDue.length} due`} color="orange" />
                  : undefined
              }
              href="/action?tab=goals-habits"
              hrefLabel="All habits"
              loading={habitsLoading}
            >
              {habitsDue.length === 0 ? (
                <EmptyRow message="All habits logged today 🎉" />
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {habitsDue.slice(0, 4).map((h) => (
                    <Link
                      key={h.id}
                      href="/action?tab=goals-habits"
                      className="flex items-center gap-2.5 py-2 group"
                    >
                      <Circle className="w-3.5 h-3.5 text-zinc-700 flex-shrink-0 group-hover:text-orange-400 transition-colors" />
                      <span className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                        {h.icon} {h.name}
                      </span>
                    </Link>
                  ))}
                  {habitsDue.length > 4 && (
                    <Link href="/action?tab=goals-habits" className="flex items-center gap-1 pt-2 text-[11px] text-zinc-600 hover:text-zinc-400">
                      +{habitsDue.length - 4} more <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ── Row 2: Pressure Plan (full width) ───────────────────────────────── */}
        <SectionCard
          icon={Zap}
          title="Today's Pressure Plan"
          accentClass="bg-rose-500"
          iconClass="text-rose-400"
          badge={
            pressureTasks.length > 0
              ? <Badge label={`${pressureTasks.length} active`} color="rose" />
              : undefined
          }
          href="/action?tab=pressure"
          hrefLabel="Manage plan"
          loading={pressureLoading}
        >
          {pressureTasks.length === 0 ? (
            <EmptyRow message="No active pressure tasks — you're clear." />
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {pressureTasks.slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  href="/action?tab=pressure"
                  className="flex items-center gap-3 py-2.5 group"
                >
                  <CheckSquare className="w-4 h-4 text-zinc-700 flex-shrink-0 group-hover:text-rose-400 transition-colors" />
                  <span className="flex-1 text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                    {task.title}
                  </span>
                  <DeadlineChip dateStr={task.deadline} />
                </Link>
              ))}
              {pressureTasks.length > 5 && (
                <Link href="/action?tab=pressure" className="flex items-center gap-1 pt-2 text-[11px] text-zinc-600 hover:text-zinc-400">
                  +{pressureTasks.length - 5} more <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          )}
        </SectionCard>

        {/* ── Row 3: Deadline Tasks + Goals ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Deadline Tasks */}
          <SectionCard
            icon={Calendar}
            title="Deadline Tasks"
            accentClass="bg-indigo-500"
            iconClass="text-indigo-400"
            badge={
              deadlineTasks.length > 0
                ? <Badge label={`${deadlineTasks.length}`} color="indigo" />
                : undefined
            }
            href="/focus"
            hrefLabel="Focus room"
            loading={tasksLoading}
          >
            {deadlineTasks.length === 0 ? (
              <EmptyRow message="No upcoming task deadlines." />
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {deadlineTasks.map((task) => (
                  <Link
                    key={task.id}
                    href="/focus"
                    className="flex items-center gap-3 py-2.5 group"
                  >
                    <Circle className="w-3.5 h-3.5 text-zinc-700 flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
                    <span className="flex-1 text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                      {task.title}
                    </span>
                    <DeadlineChip dateStr={task.due_date} />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Goals */}
          <SectionCard
            icon={Target}
            title="Goals"
            accentClass="bg-emerald-500"
            iconClass="text-emerald-400"
            badge={
              overdueGoals.length > 0
                ? <Badge label={`${overdueGoals.length} overdue`} color="rose" />
                : undefined
            }
            href="/action?tab=goals-habits"
            hrefLabel="All goals"
            loading={goalsLoading}
          >
            {goals.length === 0 ? (
              <EmptyRow message="No active goals set." />
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {/* Overdue first (already sorted from backend) */}
                {[...overdueGoals, ...upcomingGoals].slice(0, 4).map((g) => (
                  <Link
                    key={g.id}
                    href="/action?tab=goals-habits"
                    className="flex items-center gap-3 py-2.5 group"
                  >
                    {(g.days_remaining ?? 0) < 0 ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-zinc-700 flex-shrink-0 group-hover:text-emerald-400 transition-colors" />
                    )}
                    <span className="flex-1 text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                      {g.title}
                    </span>
                    <DeadlineChip dateStr={g.deadline} />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

      </div>
    </main>
  );
}
