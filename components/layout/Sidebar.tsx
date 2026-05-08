'use client';

import Link from 'next/link';
import { useSidebar } from './SidebarProvider';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Zap,
  Flame,
  Timer,
  Brain,
  Swords,
} from 'lucide-react';
import MiniPlayer from '@/components/timer/MiniPlayer';
import { LEVEL_THRESHOLDS } from '@/lib/gamification';

interface UserStats {
  streak_days: number;
  xp: number;
  current_avatar_state: string;
}

const NAV_ITEMS = [
  { href: '/',        icon: LayoutDashboard, label: 'Overview' },
  { href: '/action',  icon: Swords,          label: 'Action'   },
  { href: '/focus',   icon: Timer,           label: 'Focus'    },
  { href: '/entries', icon: BookOpen,        label: 'Journal'  },
  { href: '/sensei',  icon: Brain,           label: 'Sensei'   },
];

/** Use the canonical level table from gamification.ts */
function getLevelInfo(xp: number) {
  let current = LEVEL_THRESHOLDS[0];
  let next = LEVEL_THRESHOLDS[1];
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) {
      current = LEVEL_THRESHOLDS[i];
      next = LEVEL_THRESHOLDS[i + 1] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
      break;
    }
  }
  const range = next.xp - current.xp;
  const progress = range > 0 ? Math.round(((xp - current.xp) / range) * 100) : 100;
  return { title: current.title, nextTitle: next.title, progress, current, next };
}

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebar();
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    fetch('/api/stats/user')
      .then((r) => r.json())
      .then((data) => {
        if (data?.stats) setStats(data.stats);
      })
      .catch(() => null);
  }, []);

  const xp = stats?.xp ?? 0;
  const streak = stats?.streak_days ?? 0;
  const { title: level, progress, next } = getLevelInfo(xp);

  return (
    <aside
      className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300 ease-in-out
        bg-zinc-950 border-r border-zinc-800/60
        ${collapsed ? 'w-[68px]' : 'w-64'}`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-zinc-800/60 ${collapsed ? 'justify-center' : ''}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-indigo-400 shrink-0">
          <rect x="4" y="2" width="16" height="4" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="5" y="7" width="14" height="4" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="6" y="12" width="12" height="4" rx="1" fill="currentColor" opacity="0.8" />
          <rect x="7" y="17" width="10" height="4" rx="1" fill="currentColor" />
        </svg>
        {!collapsed && (
          <span className="text-white font-bold text-lg tracking-tight">Dayly</span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'}
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* MiniPlayer — Spotify-style persistent timer */}
      <MiniPlayer collapsed={collapsed} />

      {/* Bottom Anchor — XP & Streak */}
      <div className="border-t border-zinc-800/60 px-3 py-4">
        {!collapsed ? (
          <div className="space-y-3">
            {/* Streak */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className={`w-4 h-4 ${streak > 0 ? 'text-orange-400' : 'text-zinc-600'}`} />
                <span className="text-xs text-zinc-400">
                  {streak > 0 ? `${streak} day streak` : 'No streak yet'}
                </span>
              </div>
              <span className="text-xs text-zinc-500">{level}</span>
            </div>

            {/* XP Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-600">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-indigo-400" />
                  {xp} XP
                </span>
                <span>{next.xp} XP</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20">
              <Flame className={`w-4 h-4 ${streak > 0 ? 'text-orange-400' : 'text-zinc-600'}`} />
            </div>
            <span className="text-xs text-zinc-600">{streak}d</span>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all shadow-md"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
}
